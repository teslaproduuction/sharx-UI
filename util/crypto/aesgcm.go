// AES-GCM helper for panel-side at-rest secrets (CF tokens, WARP private keys,
// pairing JWT material, …). Key is derived from a single panel-wide secret so
// rotating the secret transparently rotates the key for all callers.
//
// Threat model: protects DB dump exfiltration (e.g. backup leaked, replica
// stolen). Does NOT protect a panel host with full root — anyone with the
// secret can decrypt. Acceptable trade-off for the panel: it must read the
// plaintext to push WARP outbounds + CF API calls anyway.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
)

// EncryptAESGCM seals plaintext with the supplied key (any length — SHA-256-
// stretched to 32 bytes inside) and returns base64-encoded nonce||ciphertext.
// Empty plaintext returns "" so caller can store NULL semantics naturally.
func EncryptAESGCM(plaintext, key string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	if key == "" {
		return "", errors.New("aesgcm: empty key")
	}
	derivedKey := sha256.Sum256([]byte(key))
	block, err := aes.NewCipher(derivedKey[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nil, nonce, []byte(plaintext), nil)
	out := append(nonce, ciphertext...)
	return base64.StdEncoding.EncodeToString(out), nil
}

// DecryptAESGCM is the inverse of EncryptAESGCM. Returns "" when ciphertext
// is empty so callers do not have to special-case empty rows.
func DecryptAESGCM(ciphertextB64, key string) (string, error) {
	if ciphertextB64 == "" {
		return "", nil
	}
	if key == "" {
		return "", errors.New("aesgcm: empty key")
	}
	derivedKey := sha256.Sum256([]byte(key))
	block, err := aes.NewCipher(derivedKey[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	raw, err := base64.StdEncoding.DecodeString(ciphertextB64)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("aesgcm: ciphertext too short")
	}
	nonce, ct := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
