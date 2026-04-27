package service

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestRoutingPayloadBase64ForSubscription(t *testing.T) {
	cfg := &SharxSubpageConfigV2{
		Routing: &SharxSubpageRouting{
			Profiles: []SharxSubpageRoutingProfile{
				{Source: "inline", Body: "{\n  \"Name\": \"t\",\n  \"GlobalProxy\": \"true\"\n}\n"},
			},
		},
	}
	b64, ok := RoutingPayloadBase64ForSubscription(cfg)
	if !ok {
		t.Fatal("expected ok")
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if string(raw) != `{"Name":"t","GlobalProxy":"true"}` {
		t.Fatalf("unexpected compact json: %q", raw)
	}
}

func TestRoutingHeaderValueForSubscription_happPrefix(t *testing.T) {
	cfg := &SharxSubpageConfigV2{
		Routing: &SharxSubpageRouting{
			Profiles: []SharxSubpageRoutingProfile{
				{Source: "inline", Body: `{"Name":"t","GlobalProxy":"true"}`, DeepLinkPreset: "happ"},
			},
		},
	}
	v, ok := RoutingHeaderValueForSubscription(cfg)
	if !ok {
		t.Fatal("expected ok")
	}
	if !strings.HasPrefix(v, happRoutingAddPrefix) {
		t.Fatalf("expected happ:// prefix, got %q", v)
	}
	payload := strings.TrimPrefix(v, happRoutingAddPrefix)
	raw, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if string(raw) != `{"Name":"t","GlobalProxy":"true"}` {
		t.Fatalf("unexpected compact json: %q", raw)
	}
}

func TestRoutingHeaderValueForSubscription_incyPrefix(t *testing.T) {
	cfg := &SharxSubpageConfigV2{
		Routing: &SharxSubpageRouting{
			Profiles: []SharxSubpageRoutingProfile{
				{Source: "inline", Body: `{"Name":"x"}`, DeepLinkPreset: "incy"},
			},
		},
	}
	v, ok := RoutingHeaderValueForSubscription(cfg)
	if !ok {
		t.Fatal("expected ok")
	}
	if !strings.HasPrefix(v, incyRoutingAddPrefix) {
		t.Fatalf("expected incy:// prefix, got %q", v)
	}
}

func TestRoutingPayloadBase64ForSubscription_skipsUrl(t *testing.T) {
	cfg := &SharxSubpageConfigV2{
		Routing: &SharxSubpageRouting{
			Profiles: []SharxSubpageRoutingProfile{
				{Source: "url", URL: "https://example.com/r.json", Body: ""},
				{Source: "inline", Body: `{"Name":"u"}`},
			},
		},
	}
	b64, ok := RoutingPayloadBase64ForSubscription(cfg)
	if !ok || b64 == "" {
		t.Fatal("expected second profile")
	}
}

func TestNormalizeSubscriptionRoutingHeaderValue_bareB64(t *testing.T) {
	plain := `{"Name":"t","GlobalProxy":"true"}`
	b64 := base64.StdEncoding.EncodeToString([]byte(plain))
	out := NormalizeSubscriptionRoutingHeaderValue(b64)
	if out != happRoutingAddPrefix+b64 {
		t.Fatalf("got %q want %s%q", out, happRoutingAddPrefix, b64)
	}
}

func TestNormalizeSubscriptionRoutingHeaderValue_alreadyDeeplink(t *testing.T) {
	full := happRoutingAddPrefix + base64.StdEncoding.EncodeToString([]byte(`{"a":1}`))
	if got := NormalizeSubscriptionRoutingHeaderValue(full); got != full {
		t.Fatalf("got %q", got)
	}
}

func TestNormalizeSubscriptionRoutingHeaderValue_happAddMistake(t *testing.T) {
	plain := `{"Name":"x"}`
	b64 := base64.StdEncoding.EncodeToString([]byte(plain))
	wrong := "happ://add/" + b64
	out := NormalizeSubscriptionRoutingHeaderValue(wrong)
	want := happRoutingAddPrefix + b64
	if out != want {
		t.Fatalf("got %q want %q", out, want)
	}
}
