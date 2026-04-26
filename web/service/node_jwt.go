package service

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/node/auth"
)

type nodeJWTCacheEntry struct {
	token      string
	validUntil time.Time
}

var (
	nodeJWTMu    sync.Mutex
	nodeJWTCache = map[int]nodeJWTCacheEntry{}
)

func parseRSAPrivateKeyFromPEM(pemStr string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, fmt.Errorf("jwt private key: no PEM block")
	}
	if k, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return k, nil
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("jwt private key is not RSA")
	}
	return rsaKey, nil
}

func (s *NodeService) signNodeJWT(_ *model.Node) (string, error) {
	pairing := &PanelPairingService{}
	priv, err := pairing.GetJWTPrivateKey()
	if err != nil {
		return "", err
	}
	claims := jwt.MapClaims{
		"iss": auth.JWTIssuer,
		"aud": auth.JWTAudience,
		"exp": time.Now().Add(3 * time.Minute).Unix(),
		"iat": time.Now().Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return t.SignedString(priv)
}

// bearerTokenForNode returns the Bearer JWT for panel → node requests (pairing-only).
func (s *NodeService) bearerTokenForNode(node *model.Node) (string, error) {
	if node.Id == 0 {
		return s.signNodeJWT(node)
	}
	now := time.Now()
	nodeJWTMu.Lock()
	if e, ok := nodeJWTCache[node.Id]; ok && now.Before(e.validUntil) {
		tok := e.token
		nodeJWTMu.Unlock()
		return tok, nil
	}
	nodeJWTMu.Unlock()

	tok, err := s.signNodeJWT(node)
	if err != nil {
		return "", err
	}

	nodeJWTMu.Lock()
	nodeJWTCache[node.Id] = nodeJWTCacheEntry{token: tok, validUntil: now.Add(90 * time.Second)}
	nodeJWTMu.Unlock()
	return tok, nil
}
