package sub

import (
	"encoding/hex"
	"strings"
	"testing"
)

func TestTelemtTgProxySecretForLink_hexNotBase64(t *testing.T) {
	raw, err := hex.DecodeString("00000000000000000000000000000001")
	if err != nil || len(raw) != 16 {
		t.Fatal(err)
	}
	got := telemtTgProxySecretForLink(raw, true, false, "")
	if !strings.HasPrefix(got, "ee") {
		t.Fatalf("fake-tls secret should start with ee, got %q", got)
	}
	if len(got) != 34 {
		t.Fatalf("expected 34 hex chars (ee + 16 bytes), got %d: %q", len(got), got)
	}
	if strings.ContainsAny(got, "+/") {
		t.Fatalf("secret must be hex, not base64: %q", got)
	}
}

func TestTelemtTgProxySecretForLink_tlsAppendsDomainHex(t *testing.T) {
	raw, _ := hex.DecodeString("d6298c54233a04b3eb1b5663f7599c8d")
	domain := "llgin.vk.com"
	got := telemtTgProxySecretForLink(raw, true, false, domain)
	want := "eed6298c54233a04b3eb1b5663f7599c8d" + strings.ToLower(hex.EncodeToString([]byte(domain)))
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestTelemtTgProxySecretForLink_securePrefix(t *testing.T) {
	raw, _ := hex.DecodeString("ffffffffffffffffffffffffffffffff")
	got := telemtTgProxySecretForLink(raw, false, true, "")
	if !strings.HasPrefix(got, "dd") || len(got) != 34 {
		t.Fatalf("secure: %q", got)
	}
}

func TestTelemtTgProxySecretForLink_classic32(t *testing.T) {
	raw, _ := hex.DecodeString("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	got := telemtTgProxySecretForLink(raw, false, false, "")
	if got != "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" {
		t.Fatalf("classic: %q", got)
	}
}
