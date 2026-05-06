package sub

import (
	"encoding/hex"
	"strings"
)

// telemtTgProxySecretForLink builds the `secret` query value for tg://proxy (lowercase hex).
// tlsMode → 0xee + 16-byte key; secure → 0xdd + key; else classic 32 hex digits.
func telemtTgProxySecretForLink(raw16 []byte, tlsMode, secure bool) string {
	switch {
	case tlsMode:
		return strings.ToLower(hex.EncodeToString(append([]byte{0xee}, raw16...)))
	case secure:
		return strings.ToLower(hex.EncodeToString(append([]byte{0xdd}, raw16...)))
	default:
		return strings.ToLower(hex.EncodeToString(raw16))
	}
}
