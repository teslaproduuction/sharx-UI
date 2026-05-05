package sub

import (
	"strings"

	"github.com/konstpic/sharx-code/v2/database/model"
)

func shallowCopyStringMap(m map[string]string) map[string]string {
	if m == nil {
		return nil
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func shallowCopyAnyMap(m map[string]any) map[string]any {
	if m == nil {
		return nil
	}
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// applyHostOverridesToParams merges optional Host subscription_* fields into vless:// / trojan:// / ss:// query params.
func applyHostOverridesToParams(host *model.Host, streamNetwork string, params map[string]string) {
	if host == nil || params == nil {
		return
	}
	if sni := strings.TrimSpace(host.SubscriptionSNI); sni != "" {
		params["sni"] = sni
	}
	if alpn := strings.TrimSpace(host.SubscriptionAlpn); alpn != "" {
		params["alpn"] = alpn
	}
	if fp := strings.TrimSpace(host.SubscriptionFingerprint); fp != "" {
		params["fp"] = fp
	}
	if host.SubscriptionAllowInsecure != nil {
		if *host.SubscriptionAllowInsecure {
			params["allowInsecure"] = "1"
		} else {
			delete(params, "allowInsecure")
		}
	}

	hh := strings.TrimSpace(host.SubscriptionHttpHost)
	pp := strings.TrimSpace(host.SubscriptionPath)
	switch streamNetwork {
	case "grpc":
		if hh != "" {
			params["authority"] = hh
		}
		if pp != "" {
			params["serviceName"] = pp
		}
	case "ws", "httpupgrade", "xhttp":
		if hh != "" {
			params["host"] = hh
		}
		if pp != "" {
			params["path"] = pp
		}
	case "tcp":
		if params["headerType"] == "http" {
			if hh != "" {
				params["host"] = hh
			}
			if pp != "" {
				params["path"] = pp
			}
		}
	}
}

// applyHostOverridesToVmessBase merges Host subscription_* into VMess share JSON (before encoding).
func applyHostOverridesToVmessBase(host *model.Host, network string, baseObj map[string]any) {
	if host == nil || baseObj == nil {
		return
	}
	if sni := strings.TrimSpace(host.SubscriptionSNI); sni != "" {
		baseObj["sni"] = sni
	}
	if alpn := strings.TrimSpace(host.SubscriptionAlpn); alpn != "" {
		baseObj["alpn"] = alpn
	}
	if fp := strings.TrimSpace(host.SubscriptionFingerprint); fp != "" {
		baseObj["fp"] = fp
	}
	if host.SubscriptionAllowInsecure != nil {
		baseObj["allowInsecure"] = *host.SubscriptionAllowInsecure
	}

	hh := strings.TrimSpace(host.SubscriptionHttpHost)
	pp := strings.TrimSpace(host.SubscriptionPath)
	switch network {
	case "grpc":
		if hh != "" {
			baseObj["authority"] = hh
		}
		if pp != "" {
			baseObj["path"] = pp
		}
	case "ws", "httpupgrade", "xhttp":
		if hh != "" {
			baseObj["host"] = hh
		}
		if pp != "" {
			baseObj["path"] = pp
		}
	case "tcp":
		typeStr, _ := baseObj["type"].(string)
		if typeStr == "http" {
			if hh != "" {
				baseObj["host"] = hh
			}
			if pp != "" {
				baseObj["path"] = pp
			}
		}
	}
}

// applyHostOverridesToHysteriaParams merges TLS-related Host overrides into hysteria:// query params (uses "insecure", not "allowInsecure").
func applyHostOverridesToHysteriaParams(host *model.Host, params map[string]string) {
	if host == nil || params == nil {
		return
	}
	if sni := strings.TrimSpace(host.SubscriptionSNI); sni != "" {
		params["sni"] = sni
	}
	if alpn := strings.TrimSpace(host.SubscriptionAlpn); alpn != "" {
		params["alpn"] = alpn
	}
	if fp := strings.TrimSpace(host.SubscriptionFingerprint); fp != "" {
		params["fp"] = fp
	}
	if host.SubscriptionAllowInsecure != nil {
		if *host.SubscriptionAllowInsecure {
			params["insecure"] = "1"
		} else {
			delete(params, "insecure")
		}
	}
}
