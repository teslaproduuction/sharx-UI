package service

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestBuildWireGuardInboundSettingsJSON_defaults(t *testing.T) {
	s, err := BuildWireGuardInboundSettingsJSON(&WireGuardInboundRequest{})
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		t.Fatal(err)
	}
	if m["mtu"] != float64(1420) { // json numbers
		t.Fatalf("mtu: %v", m["mtu"])
	}
	if sk, ok := m["secretKey"].(string); !ok || sk == "" {
		t.Fatalf("secretKey: %v", m["secretKey"])
	}
	if m["noKernelTun"] != true {
		t.Fatalf("noKernelTun: %v", m["noKernelTun"])
	}
	addrs, _ := m["address"].([]interface{})
	if len(addrs) != 1 || addrs[0] != "10.8.0.1/32" {
		t.Fatalf("address: %v", m["address"])
	}
	dns, _ := m["clientDns"].([]interface{})
	if dns == nil {
		t.Fatalf("clientDns: %v", m["clientDns"])
	}
	if len(dns) != 0 {
		t.Fatalf("clientDns: %v", m["clientDns"])
	}
}

func TestBuildWireGuardInboundSettingsJSON_clientDns(t *testing.T) {
	s, err := BuildWireGuardInboundSettingsJSON(&WireGuardInboundRequest{
		ClientDNS: []string{" 1.1.1.1 ", "", "2606:4700:4700::1111"},
	})
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		t.Fatal(err)
	}
	dns, _ := m["clientDns"].([]interface{})
	if len(dns) != 2 {
		t.Fatalf("got %v", m["clientDns"])
	}
}

func TestApplyWireGuardSettingsAddressForXray_json(t *testing.T) {
	const in = `{"mtu":1420,"secretKey":"YQ==","address":["10.8.0.1/24"],"peers":[]}`
	out := applyWireGuardSettingsAddressForXray(in)
	if !strings.Contains(out, `"10.8.0.1/32"`) {
		t.Fatalf("got: %s", out)
	}
}

func TestBuildWireGuardInboundSettingsJSON_normalizesServerAddressMask(t *testing.T) {
	s, err := BuildWireGuardInboundSettingsJSON(&WireGuardInboundRequest{
		Address: []string{"10.8.0.1/24"},
	})
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		t.Fatal(err)
	}
	addrs, _ := m["address"].([]interface{})
	if len(addrs) != 1 || addrs[0] != "10.8.0.1/32" {
		t.Fatalf("expected /32 normalization, got: %v", m["address"])
	}
}

func TestBuildWireGuardInboundSettingsJSON_peer(t *testing.T) {
	w := 4
	s, err := BuildWireGuardInboundSettingsJSON(&WireGuardInboundRequest{
		Mtu:     1500,
		Address: []string{"10.0.0.1/32"},
		Peers: []WireGuardPeerRequest{{
			PublicKey:  "cHVibGljS2V5X3Rlc3Q=",
			AllowedIPs: []string{"10.0.0.2/32"},
		}},
		NoKernelTun: boolPtr(false),
		Workers:     &w,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(s, `"peers"`) {
		t.Fatal(s)
	}
	if !strings.Contains(s, `"workers":4`) {
		t.Fatal(s)
	}
}

func boolPtr(b bool) *bool { return &b }

func TestPreserveWireGuardPeersOnInboundUpdate(t *testing.T) {
	const old = `{"mtu":1420,"secretKey":"old","address":["10.8.0.1/32"],"peers":[{"publicKey":"abc","email":"a@b.c"}],"noKernelTun":true}`
	const newNoPeers = `{"mtu":1500,"secretKey":"new","address":["10.8.0.1/32"],"peers":[],"noKernelTun":false}`
	out, err := PreserveWireGuardPeersOnInboundUpdate(newNoPeers, old)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "publicKey") || !strings.Contains(out, "abc") {
		t.Fatalf("expected peer preserved: %s", out)
	}
	if !strings.Contains(out, "1500") {
		t.Fatal(out)
	}
	// already has peers -> no merge
	keep, err := PreserveWireGuardPeersOnInboundUpdate(`{"peers":[{"publicKey":"x"}]}`, old)
	if err != nil {
		t.Fatal(err)
	}
	if keep != `{"peers":[{"publicKey":"x"}]}` {
		t.Fatalf("got %q", keep)
	}
}
