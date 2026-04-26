// Package pairing_outbound derives a shared symmetric key from the public pairing material
// (caCertPem + jwt public PEM) that is present in the base64 SECRET_KEY bundle on the node
// and in the panel_pairing table on the panel. Node→panel log push and similar requests
// can authenticate with HMAC-SHA256 over the raw body; nodes are disambiguated by nodeAddress
// in the body (shared SECRET_KEY for all workers).
package pairing_outbound

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// OutboundHMACKey derives a 32-byte key from the same strings encoded in the SECRET_KEY JSON
// and stored in the panel's panel_pairing row. Trailing whitespace is ignored so DB vs env match.
func OutboundHMACKey(caCertPem, jwtPublicKeyPem string) [32]byte {
	s := strings.TrimSpace(caCertPem) + "\n" + strings.TrimSpace(jwtPublicKeyPem)
	return sha256.Sum256([]byte(s))
}

// SignBody returns hex-encoded HMAC-SHA256 of body using OutboundHMACKey.
func SignBody(key [32]byte, body []byte) string {
	mac := hmac.New(sha256.New, key[:])
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// ValidSignature reports whether hexSig (v1= output) matches HMAC of body.
func ValidSignature(key [32]byte, body []byte, hexSig string) bool {
	if len(hexSig) != sha256.Size*2 { // hex of 32 bytes
		return false
	}
	expect, err := hex.DecodeString(hexSig)
	if err != nil || len(expect) != sha256.Size {
		return false
	}
	mac := hmac.New(sha256.New, key[:])
	mac.Write(body)
	return hmac.Equal(expect, mac.Sum(nil))
}
