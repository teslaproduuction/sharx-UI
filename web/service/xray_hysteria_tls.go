package service

import (
	"encoding/json"
	"strings"

	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/xray"
)

func tlsSettingsHasServerCerts(ts map[string]any) bool {
	if ts == nil {
		return false
	}
	certs, ok := ts["certificates"].([]any)
	if !ok || len(certs) == 0 {
		return false
	}
	c0, ok := certs[0].(map[string]any)
	if !ok {
		return false
	}
	cf, _ := c0["certificateFile"].(string)
	kf, _ := c0["keyFile"].(string)
	if strings.TrimSpace(cf) != "" && strings.TrimSpace(kf) != "" {
		return true
	}
	certArr, caOk := c0["certificate"].([]any)
	keyArr, kaOk := c0["key"].([]any)
	return caOk && kaOk && len(certArr) > 0 && len(keyArr) > 0
}

// patchHysteriaStreamTLS ensures Hysteria / Hysteria2 inbounds use TLS with a server certificate.
// Xray's hysteria listener calls quic.Listen and requires a non-nil TLS config (security "none" fails).
func patchHysteriaStreamTLS(stream map[string]any, defaultCertFile, defaultKeyFile string) {
	netw, _ := stream["network"].(string)
	if netw != "hysteria" {
		return
	}
	sec, _ := stream["security"].(string)
	if sec == "reality" {
		return
	}
	ts, tsOK := stream["tlsSettings"].(map[string]any)
	hasCerts := tsOK && tlsSettingsHasServerCerts(ts)
	if sec == "tls" && hasCerts {
		ensureHysteriaDefaultALPN(stream)
		return
	}
	cf := strings.TrimSpace(defaultCertFile)
	kf := strings.TrimSpace(defaultKeyFile)
	if cf == "" || kf == "" {
		if sec != "tls" || !hasCerts {
			logger.Debug("Hysteria inbound needs TLS with certificates; set stream TLS + cert/key or panel web certificate paths (webCertFile / webKeyFile).")
		}
		return
	}
	stream["security"] = "tls"
	if !tsOK || ts == nil {
		ts = map[string]any{}
		stream["tlsSettings"] = ts
	}
	if !tlsSettingsHasServerCerts(ts) {
		ts["certificates"] = []any{
			map[string]any{
				"certificateFile": cf,
				"keyFile":         kf,
			},
		}
	}
	ensureHysteriaDefaultALPN(stream)
}

func ensureHysteriaDefaultALPN(stream map[string]any) {
	ts, ok := stream["tlsSettings"].(map[string]any)
	if !ok || ts == nil {
		return
	}
	if _, has := ts["alpn"]; has {
		return
	}
	ts["alpn"] = []any{"h3"}
}

// BuildInboundXrayConfig returns the Xray inbound config, applying Hysteria TLS fixes in memory only.
func BuildInboundXrayConfig(inbound *model.Inbound, defaultCertFile, defaultKeyFile string) *xray.InboundConfig {
	if inbound == nil {
		return nil
	}
	ib := *inbound
	if model.NormalizeProtocol(ib.Protocol) == model.WireGuard && ib.Settings != "" {
		ib.Settings = SanitizeWireGuardSettingsJSONForXray(ib.Settings)
	}
	if model.IsHysteria(ib.Protocol) && len(ib.StreamSettings) > 0 {
		var stream map[string]any
		if err := json.Unmarshal([]byte(ib.StreamSettings), &stream); err == nil {
			patchHysteriaStreamTLS(stream, defaultCertFile, defaultKeyFile)
			if out, err := json.MarshalIndent(stream, "", "  "); err == nil {
				ib.StreamSettings = string(out)
			}
		}
	}
	return ib.GenXrayInboundConfig()
}
