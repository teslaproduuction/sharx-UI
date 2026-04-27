package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/konstpic/sharx-code/v2/database/model"
)

func TestMergeWireGuardSettingsWithClients_createsPeer(t *testing.T) {
	settings := map[string]any{
		"mtu":       1420,
		"secretKey": "aGVsbG8gd29ybGQgaGVsbG8gd29ybGQgaGVsbG8gd29ybGQ=", // 32 bytes in b64 - may be invalid curve, use proper
		"address":   []any{"10.8.0.1/32"},
		"peers":     []any{},
	}
	// fix: use valid 32-byte random key - build from empty via BuildWireGuardInboundSettingsJSON
	s, err := BuildWireGuardInboundSettingsJSON(&WireGuardInboundRequest{Address: []string{"10.8.0.1/32"}, Peers: nil})
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(s), &settings); err != nil {
		t.Fatal(err)
	}
	clients := []*model.ClientEntity{
		{Email: "u1@t.com", Enable: true, Status: "active"},
	}
	if err := mergeWireGuardSettingsWithClients(settings, clients); err != nil {
		t.Fatal(err)
	}
	peers, _ := settings["peers"].([]any)
	if len(peers) != 1 {
		t.Fatalf("peers: %d", len(peers))
	}
	p0 := peers[0].(map[string]any)
	if p0["publicKey"] == nil || p0["publicKey"] == "" {
		t.Fatalf("expected publicKey: %#v", p0)
	}
	if p0["privateKey"] == nil || p0["privateKey"] == "" {
		t.Fatalf("expected privateKey: %#v", p0)
	}
	if p0["preSharedKey"] == nil || p0["preSharedKey"] == "" {
		t.Fatalf("expected preSharedKey: %#v", p0)
	}
	if anyToInt(p0["keepAlive"]) != 25 {
		t.Fatalf("keepAlive: %v", p0["keepAlive"])
	}
	a, _ := p0["allowedIPs"].([]any)
	if len(a) < 1 || !strings.HasSuffix(strAny(a[0]), "/32") {
		t.Fatalf("allowedIPs: %#v", a)
	}
}
