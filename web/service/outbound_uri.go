// Phase 4 — Outbound URI import (3X-UI pattern). Parses share-link URIs
// into model.Outbound rows ready for /panel/outbound/add. Supported schemes
// cover everything Xray-core handles natively; sing-box-only protocols
// (mieru/anytls/hy2/tuic) live as OutboundSidecar rows and are not parsed
// here — those have no industry-standard URI form.
//
// Parsers return preview rows only; the controller is responsible for
// assigning UserId + persisting.
package service

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/konstpic/sharx-code/v2/database/model"
)

// ParseOutboundURI dispatches to the per-scheme parser. Returns an Outbound
// row with Tag (from URI fragment / generated), Protocol, Settings JSON, and
// optionally StreamSettings JSON. Settings is always present; StreamSettings
// only when the URI specifies a non-tcp transport (ws/grpc/etc).
func ParseOutboundURI(raw string) (*model.Outbound, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("empty URI")
	}
	scheme, _, _ := strings.Cut(raw, "://")
	switch strings.ToLower(scheme) {
	case "vless":
		return parseVlessURI(raw)
	case "vmess":
		return parseVmessURI(raw)
	case "trojan":
		return parseTrojanURI(raw)
	case "ss":
		return parseShadowsocksURI(raw)
	case "socks", "socks5":
		return parseSocksURI(raw)
	case "http", "https":
		return parseHTTPProxyURI(raw)
	default:
		return nil, fmt.Errorf("unsupported URI scheme %q (want vless/vmess/trojan/ss/socks/http)", scheme)
	}
}

// remarkFromFragment returns the URL fragment ("#name") as a clean remark;
// empty string when missing. Both raw and percent-encoded fragments work.
func remarkFromFragment(u *url.URL) string {
	if u.Fragment != "" {
		if dec, err := url.QueryUnescape(u.Fragment); err == nil {
			return dec
		}
		return u.Fragment
	}
	return ""
}

// genTag returns a stable tag from the remark (alpha-num lowercased) or a
// scheme+host fallback. Caller should still verify uniqueness against the DB.
func genTag(remark, scheme, host string) string {
	src := remark
	if src == "" {
		src = scheme + "-" + host
	}
	var b strings.Builder
	for _, r := range strings.ToLower(src) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_':
			b.WriteRune(r)
		}
	}
	out := b.String()
	if out == "" {
		out = scheme + "-out"
	}
	return out
}

func parseVlessURI(raw string) (*model.Outbound, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("vless: %w", err)
	}
	if u.User == nil || u.User.Username() == "" {
		return nil, errors.New("vless: missing UUID")
	}
	uuid := u.User.Username()
	host := u.Hostname()
	port, _ := strconv.Atoi(u.Port())
	if host == "" || port <= 0 {
		return nil, errors.New("vless: missing host or port")
	}
	q := u.Query()
	encryption := q.Get("encryption")
	if encryption == "" {
		encryption = "none"
	}
	flow := q.Get("flow")

	settings := map[string]any{
		"vnext": []map[string]any{{
			"address": host,
			"port":    port,
			"users":   []map[string]any{{"id": uuid, "encryption": encryption, "flow": flow, "level": 0}},
		}},
	}
	stream := buildStreamFromQuery(q)
	remark := remarkFromFragment(u)
	return &model.Outbound{
		Remark:         remark,
		Enable:         true,
		Protocol:       "vless",
		Tag:            genTag(remark, "vless", host),
		Settings:       mustMarshalString(settings),
		StreamSettings: mustMarshalString(stream),
	}, nil
}

func parseTrojanURI(raw string) (*model.Outbound, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("trojan: %w", err)
	}
	if u.User == nil || u.User.Username() == "" {
		return nil, errors.New("trojan: missing password")
	}
	password := u.User.Username()
	host := u.Hostname()
	port, _ := strconv.Atoi(u.Port())
	if host == "" || port <= 0 {
		return nil, errors.New("trojan: missing host or port")
	}
	settings := map[string]any{
		"servers": []map[string]any{{"address": host, "port": port, "password": password, "level": 0}},
	}
	q := u.Query()
	stream := buildStreamFromQuery(q)
	if _, has := stream["security"]; !has {
		stream["security"] = "tls"
		stream["tlsSettings"] = map[string]any{"serverName": host}
	}
	remark := remarkFromFragment(u)
	return &model.Outbound{
		Remark:         remark,
		Enable:         true,
		Protocol:       "trojan",
		Tag:            genTag(remark, "trojan", host),
		Settings:       mustMarshalString(settings),
		StreamSettings: mustMarshalString(stream),
	}, nil
}

func parseVmessURI(raw string) (*model.Outbound, error) {
	body := strings.TrimPrefix(raw, "vmess://")
	// vmess:// is base64-encoded JSON (v2rayN flavor). Try std + url-safe with
	// padding loosened to match the wild west of producers.
	dec, err := base64Decode(body)
	if err != nil {
		return nil, fmt.Errorf("vmess: base64: %w", err)
	}
	var obj struct {
		PS   string      `json:"ps"`
		Add  string      `json:"add"`
		Port any         `json:"port"`
		ID   string      `json:"id"`
		Aid  any         `json:"aid"`
		Scy  string      `json:"scy"`
		Net  string      `json:"net"`
		Type string      `json:"type"`
		Host string      `json:"host"`
		Path string      `json:"path"`
		TLS  string      `json:"tls"`
		SNI  string      `json:"sni"`
		ALPN string      `json:"alpn"`
		Fp   string      `json:"fp"`
		_    interface{} `json:"-"`
	}
	if err := json.Unmarshal(dec, &obj); err != nil {
		return nil, fmt.Errorf("vmess: json: %w", err)
	}
	port := toInt(obj.Port)
	aid := toInt(obj.Aid)
	if obj.Add == "" || port <= 0 || obj.ID == "" {
		return nil, errors.New("vmess: missing add/port/id")
	}
	security := obj.Scy
	if security == "" {
		security = "auto"
	}
	settings := map[string]any{
		"vnext": []map[string]any{{
			"address": obj.Add,
			"port":    port,
			"users":   []map[string]any{{"id": obj.ID, "alterId": aid, "security": security, "level": 0}},
		}},
	}
	q := url.Values{}
	q.Set("type", obj.Net)
	q.Set("security", obj.TLS)
	q.Set("sni", obj.SNI)
	q.Set("host", obj.Host)
	q.Set("path", obj.Path)
	q.Set("headerType", obj.Type)
	q.Set("fp", obj.Fp)
	q.Set("alpn", obj.ALPN)
	stream := buildStreamFromQuery(q)
	return &model.Outbound{
		Remark:         obj.PS,
		Enable:         true,
		Protocol:       "vmess",
		Tag:            genTag(obj.PS, "vmess", obj.Add),
		Settings:       mustMarshalString(settings),
		StreamSettings: mustMarshalString(stream),
	}, nil
}

func parseShadowsocksURI(raw string) (*model.Outbound, error) {
	// Two formats: SIP002 (ss://base64(method:pass)@host:port#name) and the
	// legacy fully-base64 (ss://base64(method:pass@host:port)#name).
	u, err := url.Parse(raw)
	if err == nil && u.Host != "" && u.User != nil {
		method, password, ok := decodeSSUserinfo(u.User.String())
		if !ok {
			return nil, errors.New("ss: bad SIP002 userinfo")
		}
		host := u.Hostname()
		port, _ := strconv.Atoi(u.Port())
		if host == "" || port <= 0 {
			return nil, errors.New("ss: missing host or port")
		}
		settings := map[string]any{
			"servers": []map[string]any{{"address": host, "port": port, "method": method, "password": password, "level": 0}},
		}
		remark := remarkFromFragment(u)
		return &model.Outbound{
			Remark:         remark,
			Enable:         true,
			Protocol:       "shadowsocks",
			Tag:            genTag(remark, "ss", host),
			Settings:       mustMarshalString(settings),
			StreamSettings: "{}",
		}, nil
	}
	// Legacy: ss://base64(method:pass@host:port)#name
	body := strings.TrimPrefix(raw, "ss://")
	body, frag, _ := strings.Cut(body, "#")
	dec, derr := base64Decode(body)
	if derr != nil {
		return nil, fmt.Errorf("ss: base64: %w", derr)
	}
	s := string(dec)
	at := strings.LastIndex(s, "@")
	if at < 0 {
		return nil, errors.New("ss: missing @ in legacy form")
	}
	mp := s[:at]
	hp := s[at+1:]
	colon := strings.Index(mp, ":")
	if colon < 0 {
		return nil, errors.New("ss: missing : in method:password")
	}
	method := mp[:colon]
	password := mp[colon+1:]
	hi := strings.LastIndex(hp, ":")
	if hi < 0 {
		return nil, errors.New("ss: missing : in host:port")
	}
	host := hp[:hi]
	port, _ := strconv.Atoi(hp[hi+1:])
	if host == "" || port <= 0 {
		return nil, errors.New("ss: bad host:port")
	}
	remark, _ := url.QueryUnescape(frag)
	settings := map[string]any{
		"servers": []map[string]any{{"address": host, "port": port, "method": method, "password": password, "level": 0}},
	}
	return &model.Outbound{
		Remark:         remark,
		Enable:         true,
		Protocol:       "shadowsocks",
		Tag:            genTag(remark, "ss", host),
		Settings:       mustMarshalString(settings),
		StreamSettings: "{}",
	}, nil
}

func parseSocksURI(raw string) (*model.Outbound, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("socks: %w", err)
	}
	host := u.Hostname()
	port, _ := strconv.Atoi(u.Port())
	if host == "" || port <= 0 {
		return nil, errors.New("socks: missing host or port")
	}
	user := ""
	pass := ""
	if u.User != nil {
		user = u.User.Username()
		pass, _ = u.User.Password()
	}
	server := map[string]any{"address": host, "port": port, "level": 0}
	if user != "" {
		server["users"] = []map[string]any{{"user": user, "pass": pass, "level": 0}}
	}
	settings := map[string]any{"servers": []map[string]any{server}}
	remark := remarkFromFragment(u)
	return &model.Outbound{
		Remark:         remark,
		Enable:         true,
		Protocol:       "socks",
		Tag:            genTag(remark, "socks", host),
		Settings:       mustMarshalString(settings),
		StreamSettings: "{}",
	}, nil
}

func parseHTTPProxyURI(raw string) (*model.Outbound, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("http: %w", err)
	}
	host := u.Hostname()
	port, _ := strconv.Atoi(u.Port())
	if host == "" || port <= 0 {
		// http:// often omits explicit port — default by scheme.
		if u.Scheme == "https" {
			port = 443
		} else {
			port = 80
		}
		if host == "" {
			return nil, errors.New("http: missing host")
		}
	}
	user := ""
	pass := ""
	if u.User != nil {
		user = u.User.Username()
		pass, _ = u.User.Password()
	}
	server := map[string]any{"address": host, "port": port}
	if user != "" {
		server["users"] = []map[string]any{{"user": user, "pass": pass}}
	}
	settings := map[string]any{"servers": []map[string]any{server}}
	stream := map[string]any{}
	if u.Scheme == "https" {
		stream["security"] = "tls"
		stream["tlsSettings"] = map[string]any{"serverName": host}
	}
	remark := remarkFromFragment(u)
	return &model.Outbound{
		Remark:         remark,
		Enable:         true,
		Protocol:       "http",
		Tag:            genTag(remark, "http", host),
		Settings:       mustMarshalString(settings),
		StreamSettings: mustMarshalString(stream),
	}, nil
}

// buildStreamFromQuery emits an Xray streamSettings block from a query-style
// transport hint (vless/vmess share-link form). Empty when type=tcp + no TLS.
func buildStreamFromQuery(q url.Values) map[string]any {
	netw := strings.ToLower(strings.TrimSpace(q.Get("type")))
	if netw == "" {
		netw = "tcp"
	}
	stream := map[string]any{"network": netw}
	switch netw {
	case "ws":
		ws := map[string]any{}
		if v := q.Get("path"); v != "" {
			ws["path"] = v
		}
		if v := q.Get("host"); v != "" {
			ws["headers"] = map[string]any{"Host": v}
		}
		stream["wsSettings"] = ws
	case "grpc":
		g := map[string]any{}
		if v := q.Get("serviceName"); v != "" {
			g["serviceName"] = v
		}
		stream["grpcSettings"] = g
	case "h2", "http":
		h := map[string]any{}
		if v := q.Get("path"); v != "" {
			h["path"] = v
		}
		if v := q.Get("host"); v != "" {
			h["host"] = []string{v}
		}
		stream["httpSettings"] = h
	case "tcp":
		if t := q.Get("headerType"); t == "http" {
			stream["tcpSettings"] = map[string]any{"header": map[string]any{"type": "http"}}
		}
	}
	switch strings.ToLower(strings.TrimSpace(q.Get("security"))) {
	case "tls":
		tls := map[string]any{}
		if v := q.Get("sni"); v != "" {
			tls["serverName"] = v
		}
		if v := q.Get("fp"); v != "" {
			tls["fingerprint"] = v
		}
		if v := q.Get("alpn"); v != "" {
			tls["alpn"] = strings.Split(v, ",")
		}
		stream["security"] = "tls"
		stream["tlsSettings"] = tls
	case "reality":
		r := map[string]any{}
		if v := q.Get("sni"); v != "" {
			r["serverName"] = v
		}
		if v := q.Get("fp"); v != "" {
			r["fingerprint"] = v
		}
		if v := q.Get("pbk"); v != "" {
			r["publicKey"] = v
		}
		if v := q.Get("sid"); v != "" {
			r["shortId"] = v
		}
		if v := q.Get("spx"); v != "" {
			r["spiderX"] = v
		}
		stream["security"] = "reality"
		stream["realitySettings"] = r
	}
	return stream
}

// base64Decode accepts std and url-safe variants, with or without padding.
func base64Decode(s string) ([]byte, error) {
	s = strings.TrimSpace(s)
	if pad := len(s) % 4; pad != 0 {
		s += strings.Repeat("=", 4-pad)
	}
	if dec, err := base64.StdEncoding.DecodeString(s); err == nil {
		return dec, nil
	}
	if dec, err := base64.URLEncoding.DecodeString(s); err == nil {
		return dec, nil
	}
	return nil, errors.New("not valid base64")
}

func decodeSSUserinfo(s string) (method, password string, ok bool) {
	// SIP002 percent-encodes the base64(method:password) blob.
	if dec, err := url.QueryUnescape(s); err == nil {
		s = dec
	}
	if !strings.Contains(s, ":") {
		// Treat as base64-wrapped.
		if dec, err := base64Decode(s); err == nil {
			s = string(dec)
		}
	}
	colon := strings.Index(s, ":")
	if colon < 0 {
		return "", "", false
	}
	return s[:colon], s[colon+1:], true
}

func toInt(v any) int {
	switch t := v.(type) {
	case float64:
		return int(t)
	case int:
		return t
	case string:
		n, _ := strconv.Atoi(strings.TrimSpace(t))
		return n
	}
	return 0
}

func mustMarshalString(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}
