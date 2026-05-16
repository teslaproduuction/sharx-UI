// Phase 7 — Cloudflare API integration scaffold.
//
// Wraps the subset of Cloudflare's API v4 the panel needs:
//   - Verify token + discover account/scope (GET /user/tokens/verify)
//   - List zones for the account (GET /zones)
//   - DNS records CRUD (POST/PUT/DELETE /zones/<id>/dns_records)
//   - Workers Scripts deploy/delete (PUT /accounts/<id>/workers/scripts/<name>)
//
// Persisted state lives in the cloudflare_* tables (migration 0049). Tokens
// are AES-GCM encrypted at rest with the same panel-secret-derived key used
// for WARP private/access secrets (util/crypto/aesgcm).
//
// Real CF API calls land per-feature in a follow-up commit; this commit ships
// the CRUD layer + verify endpoint so admins can already register and store
// credentials.
package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/util/crypto"
)

const cfAPIBase = "https://api.cloudflare.com/client/v4"

// CloudflareService manages CF credentials + domains + zones.
type CloudflareService struct{}

// cfEncryptionKey reuses the same panel-wide secret derivation as WARP.
// Stable across restarts; rotating panelSecretPrefix re-derives the key
// (admins must re-paste tokens after a rotation).
func cfEncryptionKey() string {
	ss := SettingService{}
	v, _ := ss.getString("panelSecretPrefix")
	if strings.TrimSpace(v) == "" {
		return "cf-fallback-key"
	}
	return "cf-v1:" + v
}

// AddCredential encrypts + persists the supplied API token. Caller may then
// call VerifyCredential to validate scope against CF's /user/tokens/verify.
func (s *CloudflareService) AddCredential(name, apiToken string) (*model.CloudflareCredential, error) {
	name = strings.TrimSpace(name)
	apiToken = strings.TrimSpace(apiToken)
	if name == "" || apiToken == "" {
		return nil, errors.New("name and apiToken required")
	}
	enc, err := crypto.EncryptAESGCM(apiToken, cfEncryptionKey())
	if err != nil {
		return nil, err
	}
	row := &model.CloudflareCredential{
		Name:     name,
		APIToken: enc,
	}
	if err := database.GetDB().Create(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

// ListCredentials returns all stored CF credentials (encrypted token redacted).
func (s *CloudflareService) ListCredentials() ([]*model.CloudflareCredential, error) {
	var rows []*model.CloudflareCredential
	if err := database.GetDB().Order("id ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, r := range rows {
		r.APIToken = ""
	}
	return rows, nil
}

// DeleteCredential drops the row + cascades to zones/domains via FK.
func (s *CloudflareService) DeleteCredential(id int) error {
	return database.GetDB().Delete(&model.CloudflareCredential{}, id).Error
}

// VerifyCredential calls GET /user/tokens/verify to check the token is alive
// and update last_verified.
func (s *CloudflareService) VerifyCredential(id int) (map[string]any, error) {
	var row model.CloudflareCredential
	if err := database.GetDB().First(&row, id).Error; err != nil {
		return nil, err
	}
	tok, err := crypto.DecryptAESGCM(row.APIToken, cfEncryptionKey())
	if err != nil {
		return nil, err
	}
	resp, err := s.cfRequest(tok, http.MethodGet, "/user/tokens/verify", nil)
	if err != nil {
		return nil, err
	}
	now := time.Now().UnixMilli()
	_ = database.GetDB().Model(&model.CloudflareCredential{}).Where("id = ?", id).Update("last_verified", now).Error
	return resp, nil
}

// SyncZones re-fetches /zones for the credential and refreshes the
// cloudflare_zones table. Returns the row count.
func (s *CloudflareService) SyncZones(credentialID int) (int, error) {
	var row model.CloudflareCredential
	if err := database.GetDB().First(&row, credentialID).Error; err != nil {
		return 0, err
	}
	tok, err := crypto.DecryptAESGCM(row.APIToken, cfEncryptionKey())
	if err != nil {
		return 0, err
	}
	resp, err := s.cfRequest(tok, http.MethodGet, "/zones?per_page=200", nil)
	if err != nil {
		return 0, err
	}
	results, _ := resp["result"].([]any)
	if err := database.GetDB().Where("credential_id = ?", credentialID).Delete(&model.CloudflareZone{}).Error; err != nil {
		return 0, err
	}
	rows := make([]model.CloudflareZone, 0, len(results))
	for _, r := range results {
		m, ok := r.(map[string]any)
		if !ok {
			continue
		}
		zoneID, _ := m["id"].(string)
		name, _ := m["name"].(string)
		status, _ := m["status"].(string)
		if zoneID == "" || name == "" {
			continue
		}
		rows = append(rows, model.CloudflareZone{
			CredentialId: credentialID,
			CfZoneId:     zoneID,
			Name:         name,
			Status:       status,
		})
	}
	if len(rows) > 0 {
		if err := database.GetDB().Create(&rows).Error; err != nil {
			return 0, err
		}
	}
	return len(rows), nil
}

// ListDomains returns all CF-managed domains.
func (s *CloudflareService) ListDomains() ([]*model.CloudflareDomain, error) {
	var rows []*model.CloudflareDomain
	if err := database.GetDB().Order("id ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// AddDomain persists a domain row. Mode-specific provisioning (DNS record
// create, worker script deploy) lands in a follow-up commit.
func (s *CloudflareService) AddDomain(d *model.CloudflareDomain) error {
	if d == nil {
		return errors.New("nil domain")
	}
	if strings.TrimSpace(d.Name) == "" {
		return errors.New("name required")
	}
	if d.Mode == "" {
		d.Mode = "direct"
	}
	switch d.Mode {
	case "direct", "cdn", "worker", "auto_cdn_ip":
	default:
		return fmt.Errorf("unsupported mode %q", d.Mode)
	}
	d.Status = "pending"
	return database.GetDB().Create(d).Error
}

// DeleteDomain drops the row.
func (s *CloudflareService) DeleteDomain(id int) error {
	return database.GetDB().Delete(&model.CloudflareDomain{}, id).Error
}

// cfRequest is a thin wrapper around the CF API v4. JSON in/out.
func (s *CloudflareService) cfRequest(token, method, path string, body any) (map[string]any, error) {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, cfAPIBase+path, rd)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("CF API HTTP %d: %s", resp.StatusCode, string(raw))
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}
