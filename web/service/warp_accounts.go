// Phase 3 Part B — Cloudflare WARP egress accounts (multi-account, persisted).
//
// Distinct from the existing single-account WarpService (settings-stored
// helper for the legacy /panel/warp page). This service introduces a
// dedicated warp_accounts table + Xray-native wireguard outbound builder so
// admins can register multiple WARP devices, assign them to nodes, and
// reference them from RoutingBuilder by friendly name (warp-<name>).
//
// See .agent/protocols/warp.md.
package service

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/curve25519"

	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/util/crypto"
)

const (
	warpAPIBase    = "https://api.cloudflareclient.com/v0a4005"
	warpDefaultTOS = "2024-01-01T00:00:00.000Z"
	warpDefaultMTU = 1280
)

// WarpAccountService handles multi-account WARP registration + Xray outbound generation.
type WarpAccountService struct{}

// warpEncryptionKey returns the panel-wide secret used to AES-GCM-encrypt
// at-rest WARP private/license/access tokens. Derives from panelSecretPrefix
// (always present, baked at install). Stable across restarts.
func warpEncryptionKey() string {
	ss := SettingService{}
	v, _ := ss.getString("panelSecretPrefix")
	if strings.TrimSpace(v) == "" {
		return "warp-fallback-key"
	}
	return "warp-v1:" + v
}

// generateWGKeypair returns base64 (private, public) per Curve25519 scalar mult.
func generateWGKeypair() (string, string, error) {
	priv := make([]byte, 32)
	if _, err := rand.Read(priv); err != nil {
		return "", "", err
	}
	priv[0] &= 248
	priv[31] &= 127
	priv[31] |= 64
	pub, err := curve25519.X25519(priv, curve25519.Basepoint)
	if err != nil {
		return "", "", err
	}
	return base64.StdEncoding.EncodeToString(priv), base64.StdEncoding.EncodeToString(pub), nil
}

type warpRegisterRequest struct {
	Key   string `json:"key"`
	TOS   string `json:"tos"`
	Type  string `json:"type"`
	Model string `json:"model"`
	Name  string `json:"name"`
}

type warpRegisterResponse struct {
	ID      string `json:"id"`
	Account struct {
		ID      string `json:"id"`
		License string `json:"license"`
	} `json:"account"`
	Config struct {
		ClientID  string `json:"client_id"`
		Interface struct {
			Addresses struct {
				V4 string `json:"v4"`
				V6 string `json:"v6"`
			} `json:"addresses"`
		} `json:"interface"`
		Peers []struct {
			PublicKey string `json:"public_key"`
			Endpoint  struct {
				V4 string `json:"v4"`
				V6 string `json:"v6"`
			} `json:"endpoint"`
		} `json:"peers"`
	} `json:"config"`
	Token string `json:"token"`
}

// Register runs the full anonymous WARP register flow and persists the account.
func (s *WarpAccountService) Register(name string) (*model.WarpAccount, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("name is required")
	}
	priv, pub, err := generateWGKeypair()
	if err != nil {
		return nil, fmt.Errorf("keygen: %w", err)
	}
	body, _ := json.Marshal(warpRegisterRequest{
		Key:   pub,
		TOS:   warpDefaultTOS,
		Type:  "PC",
		Model: "sharx",
		Name:  name,
	})
	req, _ := http.NewRequest(http.MethodPost, warpAPIBase+"/reg", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("CF-Client-Version", "a-7.21-0721")
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("CF register: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("CF register HTTP %d: %s", resp.StatusCode, string(raw))
	}
	var rr warpRegisterResponse
	if err := json.Unmarshal(raw, &rr); err != nil {
		return nil, fmt.Errorf("CF register parse: %w", err)
	}
	if len(rr.Config.Peers) == 0 {
		return nil, errors.New("CF register: response has no peers")
	}
	peer := rr.Config.Peers[0]
	// CF returns endpoint as either "host:port" (modern) or just "host:" / "" /
	// "ip:0" (older API). Always normalize to engage.cloudflareclient.com:2408
	// when port is 0/missing — that is the canonical WARP relay anycast.
	endpoint := peer.Endpoint.V4
	if !strings.Contains(endpoint, ":") || strings.HasSuffix(endpoint, ":0") || strings.HasSuffix(endpoint, ":") {
		endpoint = "engage.cloudflareclient.com:2408"
	}
	reserved, _ := warpReservedFromClientID(rr.Config.ClientID)

	encKey := warpEncryptionKey()
	privEnc, err := crypto.EncryptAESGCM(priv, encKey)
	if err != nil {
		return nil, fmt.Errorf("encrypt private: %w", err)
	}
	tokenEnc, _ := crypto.EncryptAESGCM(rr.Token, encKey)
	licenseEnc, _ := crypto.EncryptAESGCM(rr.Account.License, encKey)

	row := &model.WarpAccount{
		Name:          name,
		DeviceId:      rr.ID,
		AccountId:     rr.Account.ID,
		PrivateKey:    privEnc,
		PublicKey:     pub,
		LicenseKey:    licenseEnc,
		IsPlus:        false,
		IPv4Address:   rr.Config.Interface.Addresses.V4,
		IPv6Address:   rr.Config.Interface.Addresses.V6,
		PeerEndpoint:  endpoint,
		PeerPublicKey: peer.PublicKey,
		Reserved:      reserved,
		AccessToken:   tokenEnc,
		RefreshedAt:   time.Now().UnixMilli(),
	}
	if err := database.GetDB().Create(row).Error; err != nil {
		return nil, fmt.Errorf("persist warp account: %w", err)
	}
	return row, nil
}

// warpReservedFromClientID decodes the first 3 bytes of base64(client_id).
func warpReservedFromClientID(clientID string) ([]byte, error) {
	if clientID == "" {
		return nil, errors.New("empty client_id")
	}
	pad := strings.Repeat("=", (4-len(clientID)%4)%4)
	raw, err := base64.StdEncoding.DecodeString(clientID + pad)
	if err != nil {
		return nil, err
	}
	if len(raw) < 3 {
		return nil, errors.New("client_id too short")
	}
	return raw[:3], nil
}

// BuildXrayOutboundJSON renders the Xray-native wireguard outbound for one WARP account.
func (s *WarpAccountService) BuildXrayOutboundJSON(acc *model.WarpAccount) (string, error) {
	if acc == nil {
		return "", errors.New("nil account")
	}
	priv, err := crypto.DecryptAESGCM(acc.PrivateKey, warpEncryptionKey())
	if err != nil {
		return "", fmt.Errorf("decrypt private: %w", err)
	}
	addrs := []string{}
	if acc.IPv4Address != "" {
		addrs = append(addrs, acc.IPv4Address+"/32")
	}
	if acc.IPv6Address != "" {
		addrs = append(addrs, acc.IPv6Address+"/128")
	}
	reservedNums := make([]int, 0, len(acc.Reserved))
	for _, b := range acc.Reserved {
		reservedNums = append(reservedNums, int(b))
	}
	// Tag = "warp-<name>" but skip double prefix when admin already named it warp-*.
	tag := "warp-" + acc.Name
	if strings.HasPrefix(strings.ToLower(acc.Name), "warp-") || strings.EqualFold(acc.Name, "warp") {
		tag = acc.Name
	}
	out := map[string]any{
		"tag":      tag,
		"protocol": "wireguard",
		"settings": map[string]any{
			"secretKey": priv,
			"address":   addrs,
			"peers": []map[string]any{{
				"publicKey":  acc.PeerPublicKey,
				"allowedIPs": []string{"0.0.0.0/0", "::/0"},
				"endpoint":   acc.PeerEndpoint,
				"keepAlive":  25,
			}},
			"reserved": reservedNums,
			"mtu":      warpDefaultMTU,
			"workers":  2,
		},
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// ApplyPlusLicense PUTs a WARP+ license key against the account and toggles is_plus on success.
func (s *WarpAccountService) ApplyPlusLicense(accountID int, licenseKey string) (*model.WarpAccount, error) {
	licenseKey = strings.TrimSpace(licenseKey)
	if licenseKey == "" {
		return nil, errors.New("license key is required")
	}
	var acc model.WarpAccount
	if err := database.GetDB().First(&acc, accountID).Error; err != nil {
		return nil, err
	}
	token, err := crypto.DecryptAESGCM(acc.AccessToken, warpEncryptionKey())
	if err != nil {
		return nil, err
	}
	body, _ := json.Marshal(map[string]string{"license": licenseKey})
	req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("%s/reg/%s/account", warpAPIBase, acc.DeviceId), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	rawResp, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("CF apply license HTTP %d: %s", resp.StatusCode, string(rawResp))
	}
	licenseEnc, _ := crypto.EncryptAESGCM(licenseKey, warpEncryptionKey())
	patch := map[string]any{"license_key": licenseEnc, "is_plus": true, "refreshed_at": time.Now().UnixMilli()}
	if err := database.GetDB().Model(&model.WarpAccount{}).Where("id = ?", accountID).Updates(patch).Error; err != nil {
		return nil, err
	}
	return s.Get(accountID)
}

// Delete removes the account from CF (best-effort) and the DB.
func (s *WarpAccountService) Delete(accountID int) error {
	var acc model.WarpAccount
	if err := database.GetDB().First(&acc, accountID).Error; err != nil {
		return err
	}
	if token, err := crypto.DecryptAESGCM(acc.AccessToken, warpEncryptionKey()); err == nil && token != "" {
		req, _ := http.NewRequest(http.MethodDelete, fmt.Sprintf("%s/reg/%s", warpAPIBase, acc.DeviceId), nil)
		req.Header.Set("Authorization", "Bearer "+token)
		_, _ = (&http.Client{Timeout: 30 * time.Second}).Do(req)
	}
	return database.GetDB().Delete(&model.WarpAccount{}, accountID).Error
}

// List returns all WARP accounts (does not decrypt secrets).
func (s *WarpAccountService) List() ([]*model.WarpAccount, error) {
	var rows []*model.WarpAccount
	if err := database.GetDB().Order("id ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// Get returns one account row.
func (s *WarpAccountService) Get(id int) (*model.WarpAccount, error) {
	var acc model.WarpAccount
	if err := database.GetDB().First(&acc, id).Error; err != nil {
		return nil, err
	}
	return &acc, nil
}
