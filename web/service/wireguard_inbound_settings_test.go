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
		Mtu: 1500,
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
