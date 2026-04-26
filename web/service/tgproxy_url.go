package service

import (
	"net"
	"net/url"
	"strconv"
	"strings"
)

// normalizeTelegramBotProxyForDial turns user input (including tg:// and t.me/proxy
// share links) into a URL suitable for fasthttpproxy SOCKS5/HTTP dialers, or an empty
// string when the bot should connect without a proxy.
//
// MTProto / tg://proxy links with a non-empty "secret" target Telegram’s MTProxy stack,
// not HTTPS to api.telegram.org; the Bot API client cannot use such links, so a warning
// is returned and the proxy is not applied (caller may still use a self-hosted API).
func normalizeTelegramBotProxyForDial(raw string) (normalized string, warn string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", ""
	}

	// Bare t.me/telegram share URL without scheme.
	if !strings.Contains(raw, "://") && (strings.HasPrefix(raw, "t.me/") || strings.HasPrefix(raw, "telegram.me/")) {
		raw = "https://" + raw
	}

	lower := strings.ToLower(raw)
	if strings.HasPrefix(lower, "tg://") {
		return normalizeTgOrWebProxyQuery(raw)
	}

	if u, err := url.Parse(raw); err == nil {
		if (u.Scheme == "http" || u.Scheme == "https") && (u.Host == "t.me" || u.Host == "www.t.me" ||
			u.Host == "telegram.me" || u.Host == "www.telegram.me") {
			if p := u.Path; p == "/proxy" || strings.HasPrefix(p, "/proxy/") {
				return normalizeTgOrWebProxyQueryFromValues(u.Query())
			}
		}
	}

	// Shorthand: host:port (SOCKS5 without scheme, IPv4/hostname/IPv6 in brackets).
	if hp, ok := hostPortSocks5Shorthand(raw); ok {
		return "socks5://" + hp, ""
	}

	if strings.HasPrefix(lower, "socks5://") {
		return raw, ""
	}
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		return raw, ""
	}
	return "", "unsupported Telegram proxy format; use socks5://, http(s)://, host:port, or share links tg://proxy?… / t.me/proxy?… (without secret for SOCKS5-only test links)"
}

// hostPortSocks5Shorthand accepts "host:port" or "[IPv6]:port" for a SOCKS5 endpoint without scheme.
func hostPortSocks5Shorthand(s string) (string, bool) {
	if s == "" || strings.Contains(s, "://") || strings.HasPrefix(s, "/") {
		return "", false
	}
	host, portStr, err := net.SplitHostPort(s)
	if err != nil || host == "" {
		return "", false
	}
	p, err := strconv.Atoi(portStr)
	if err != nil || p < 1 || p > 65535 {
		return "", false
	}
	return s, true
}

func normalizeTgOrWebProxyQuery(rawURL string) (string, string) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", "invalid proxy URL: " + err.Error()
	}
	return normalizeTgOrWebProxyQueryFromValues(u.Query())
}

func normalizeTgOrWebProxyQueryFromValues(q url.Values) (string, string) {
	server := firstNonEmptyFromQuery(q, "server")
	port := firstNonEmptyFromQuery(q, "port")
	secret := firstNonEmptyFromQuery(q, "secret")
	if server == "" || port == "" {
		return "", "tg/t.me proxy link: missing server or port"
	}
	if secret != "" {
		return "", "MTProto proxy links (tg://proxy / t.me/proxy with secret) cannot be used for the Telegram Bot API (HTTPS to api.telegram.org). Use a SOCKS5 or HTTP(S) proxy, or set a self-hosted Bot API in «API server»."
	}
	return "socks5://" + server + ":" + port, ""
}

func firstNonEmptyFromQuery(q url.Values, k string) string {
	v := q.Get(k)
	if v != "" {
		return v
	}
	// case-insensitive keys
	for name, values := range q {
		if strings.EqualFold(name, k) && len(values) > 0 {
			return values[0]
		}
	}
	return ""
}
