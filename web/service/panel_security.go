// Package service — Phase 1 panel security.
//
// PanelSecurityService manages the Caddy front-door masking settings:
//   - Secret URL prefix (random b64url) that hides the panel UI behind /<prefix>/.
//   - Decoy URL the Caddy reverse-proxies all unrecognized paths to (Hiddify pattern).
//   - Mascaraed mode delay (after which the bare root '/' also routes to the decoy).
//   - Caddy admin endpoint for future hot-reload (Phase 5).
//
// See .agent/plans/phase-1-caddy-masking.md and .agent/protocols/caddy-masking.md.
package service

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/konstpic/sharx-code/v2/logger"
)

const (
	panelSecretPrefixKey        = "panelSecretPrefix"
	panelDecoyURLKey            = "panelDecoyURL"
	panelMascaraedAfterHoursKey = "panelMascaraedAfterHours"
	panelInstallTimeKey         = "panelInstallTime"
	caddyAdminURLKey            = "caddyAdminURL"

	panelSecretPrefixBytes = 16   // 128-bit entropy → 22-char b64url string
	mascaraedHoursMin      = 0    // 0 means immediate
	mascaraedHoursMax      = 8760 // 1 year cap
)

// PanelSecurityStatus is the read-only snapshot returned to the UI.
type PanelSecurityStatus struct {
	SecretPrefix             string `json:"secretPrefix"`
	DecoyURL                 string `json:"decoyURL"`
	MascaraedAfterHours      int    `json:"mascaraedAfterHours"`
	InstallTime              int64  `json:"installTime"`
	MascaraedActive          bool   `json:"mascaraedActive"`
	SecondsUntilMascaraed    int64  `json:"secondsUntilMascaraed"`
	CaddyAdminURL            string `json:"caddyAdminURL"`
	HasSecretPrefixGenerated bool   `json:"hasSecretPrefixGenerated"`
}

// PanelSecurityService is a thin wrapper over SettingService for Phase 1 keys.
// Caddy reload is NOT automated in Phase 1 — see Phase 5 for hot-reload via Caddy admin API.
type PanelSecurityService struct {
	settings SettingService
}

// EnsureInstallTime stamps panelInstallTime on first invocation; idempotent.
// Called from main.go runWebServer() right after EnsureXrayTemplateConfigValid.
func (p *PanelSecurityService) EnsureInstallTime() error {
	cur, err := p.settings.getString(panelInstallTimeKey)
	if err == nil && strings.TrimSpace(cur) != "" {
		return nil
	}
	now := strconv.FormatInt(time.Now().Unix(), 10)
	if err := p.settings.setString(panelInstallTimeKey, now); err != nil {
		return err
	}
	logger.Infof("panel_security: stamped panelInstallTime=%s (mascaraed countdown started)", now)
	return nil
}

// GetStatus assembles the read-only status for the UI.
func (p *PanelSecurityService) GetStatus() (*PanelSecurityStatus, error) {
	prefix, _ := p.settings.getString(panelSecretPrefixKey)
	decoy, _ := p.settings.getString(panelDecoyURLKey)
	hoursStr, _ := p.settings.getString(panelMascaraedAfterHoursKey)
	installStr, _ := p.settings.getString(panelInstallTimeKey)
	caddy, _ := p.settings.getString(caddyAdminURLKey)

	hours, _ := strconv.Atoi(strings.TrimSpace(hoursStr))
	installTs, _ := strconv.ParseInt(strings.TrimSpace(installStr), 10, 64)

	now := time.Now().Unix()
	mascaraedAt := installTs + int64(hours)*3600
	active := installTs > 0 && now >= mascaraedAt
	remaining := mascaraedAt - now
	if remaining < 0 {
		remaining = 0
	}

	return &PanelSecurityStatus{
		SecretPrefix:             prefix,
		DecoyURL:                 decoy,
		MascaraedAfterHours:      hours,
		InstallTime:              installTs,
		MascaraedActive:          active,
		SecondsUntilMascaraed:    remaining,
		CaddyAdminURL:            caddy,
		HasSecretPrefixGenerated: strings.TrimSpace(prefix) != "",
	}, nil
}

// RotateSecretPrefix generates a fresh random prefix and persists it.
// Returns the new prefix so the caller can include it in the response (and warn the admin
// that everyone needs to relogin via the new URL). Caddy must be reloaded manually in Phase 1
// (`docker compose restart caddy`), Phase 5 will automate this via the admin API.
func (p *PanelSecurityService) RotateSecretPrefix() (string, error) {
	prefix, err := generateSecretPrefix()
	if err != nil {
		return "", err
	}
	if err := p.settings.setString(panelSecretPrefixKey, prefix); err != nil {
		return "", err
	}
	logger.Infof("panel_security: rotated panelSecretPrefix to %s***", prefix[:4])
	return prefix, nil
}

// SetDecoyURL validates the URL is an https:// scheme and persists it.
// Empty string is rejected — the UI must always have a fallback decoy.
func (p *PanelSecurityService) SetDecoyURL(rawURL string) error {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return errors.New("decoy URL must not be empty")
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return errors.New("decoy URL is not a valid URL: " + err.Error())
	}
	if u.Scheme != "https" {
		return errors.New("decoy URL must use https:// (Caddy will not proxy http upstream from a TLS site)")
	}
	if u.Host == "" {
		return errors.New("decoy URL must have a host")
	}
	return p.settings.setString(panelDecoyURLKey, rawURL)
}

// SetMascaraedAfterHours updates how long after install the root path also routes to the decoy.
func (p *PanelSecurityService) SetMascaraedAfterHours(hours int) error {
	if hours < mascaraedHoursMin || hours > mascaraedHoursMax {
		return errors.New("mascaraedAfterHours must be between 0 and 8760")
	}
	return p.settings.setString(panelMascaraedAfterHoursKey, strconv.Itoa(hours))
}

// ActivateMascaraedNow effectively backdates panelInstallTime so mascaraedActive=true immediately.
// Useful when the admin wants to lock down the root '/' before the timer expires naturally.
func (p *PanelSecurityService) ActivateMascaraedNow() error {
	hoursStr, _ := p.settings.getString(panelMascaraedAfterHoursKey)
	hours, _ := strconv.Atoi(strings.TrimSpace(hoursStr))
	backdate := time.Now().Unix() - int64(hours)*3600 - 1
	return p.settings.setString(panelInstallTimeKey, strconv.FormatInt(backdate, 10))
}

// EnsureSecretPrefix generates one if it is empty (used once at install/migration time).
// Idempotent — does nothing if a prefix already exists.
func (p *PanelSecurityService) EnsureSecretPrefix() (string, error) {
	cur, err := p.settings.getString(panelSecretPrefixKey)
	if err == nil && strings.TrimSpace(cur) != "" {
		return cur, nil
	}
	prefix, err := generateSecretPrefix()
	if err != nil {
		return "", err
	}
	if err := p.settings.setString(panelSecretPrefixKey, prefix); err != nil {
		return "", err
	}
	logger.Infof("panel_security: generated initial panelSecretPrefix=%s***", prefix[:4])
	return prefix, nil
}

func generateSecretPrefix() (string, error) {
	buf := make([]byte, panelSecretPrefixBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	// b64url no-pad → URL-safe path segment, 22 chars for 16 bytes.
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
