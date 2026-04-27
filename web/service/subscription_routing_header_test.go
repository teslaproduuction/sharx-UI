package service

import (
	"encoding/base64"
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
