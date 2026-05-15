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

func TestMergeWireGuardSettingsWithClients_preservesKeysWhenClientDisabled(t *testing.T) {
	s, err := BuildWireGuardInboundSettingsJSON(&WireGuardInboundRequest{Address: []string{"10.8.0.1/32"}, Peers: nil})
	if err != nil {
		t.Fatal(err)
	}
	var settings map[string]any
	if err := json.Unmarshal([]byte(s), &settings); err != nil {
		t.Fatal(err)
	}
	active := []*model.ClientEntity{
		{Email: "u1@t.com", Enable: true, Status: "active"},
	}
	if err := mergeWireGuardSettingsWithClients(settings, active); err != nil {
		t.Fatal(err)
	}
	peers1, _ := settings["peers"].([]any)
	if len(peers1) != 1 {
		t.Fatalf("peers: %d", len(peers1))
	}
	p1 := peers1[0].(map[string]any)
	pub1 := strAny(p1["publicKey"])
	priv1 := strAny(p1["privateKey"])
	if pub1 == "" || priv1 == "" {
		t.Fatal("missing keys")
	}
	_, hasVault := settings[PanelWireGuardInactivePeersSettingsKey]
	if hasVault {
		t.Fatalf("unexpected inactive vault: %#v", settings[PanelWireGuardInactivePeersSettingsKey])
	}

	disabled := []*model.ClientEntity{
		{Email: "u1@t.com", Enable: false, Status: "active"},
	}
	if err := mergeWireGuardSettingsWithClients(settings, disabled); err != nil {
		t.Fatal(err)
	}
	peers2, _ := settings["peers"].([]any)
	if len(peers2) != 0 {
		t.Fatalf("expected no active peers, got %d", len(peers2))
	}
	vault, _ := settings[PanelWireGuardInactivePeersSettingsKey].([]any)
	if len(vault) != 1 {
		t.Fatalf("inactive vault: %d", len(vault))
	}
	p2 := vault[0].(map[string]any)
	if strAny(p2["publicKey"]) != pub1 || strAny(p2["privateKey"]) != priv1 {
		t.Fatalf("keys changed: was pub=%s priv=%s now pub=%s priv=%s", pub1, priv1, strAny(p2["publicKey"]), strAny(p2["privateKey"]))
	}

	enabledAgain := []*model.ClientEntity{
		{Email: "u1@t.com", Enable: true, Status: "active"},
	}
	if err := mergeWireGuardSettingsWithClients(settings, enabledAgain); err != nil {
		t.Fatal(err)
	}
	peers3, _ := settings["peers"].([]any)
	if len(peers3) != 1 {
		t.Fatalf("peers after re-enable: %d", len(peers3))
	}
	p3 := peers3[0].(map[string]any)
	if strAny(p3["publicKey"]) != pub1 || strAny(p3["privateKey"]) != priv1 {
		t.Fatalf("keys not restored after re-enable")
	}
	if _, ok := settings[PanelWireGuardInactivePeersSettingsKey]; ok {
		t.Fatal("inactive vault should be cleared when all assigned clients are active")
	}
}
