package service

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/konstpic/sharx-code/v2/database/model"
)

// PrepareNodePairing switches the node into auth_mode=pairing and returns the panel-wide
// SECRET_KEY (base64 JSON) that the worker consumes via environment variable.
//
// Starting with migration 0027 the panel uses a single shared pairing bundle
// so no per-node TLS/JWT material is created here. The same SECRET_KEY is reused for every node;
// this makes it easy to deploy many nodes with one docker-compose.yml.
func (s *NodeService) PrepareNodePairing(node *model.Node) (secretKey string, err error) {
	if strings.TrimSpace(node.Address) == "" {
		return "", fmt.Errorf("node address is required")
	}
	addr := strings.TrimSpace(node.Address)
	u, err := url.Parse(addr)
	if err != nil || u.Host == "" {
		return "", fmt.Errorf("invalid node address URL")
	}
	if u.Scheme == "" {
		scheme := "https"
		if !node.UseTLS {
			scheme = "http"
		}
		var errParse error
		u, errParse = url.Parse(scheme + "://" + addr)
		if errParse != nil {
			return "", fmt.Errorf("invalid node address URL")
		}
		node.Address = u.String()
	} else if u.Scheme == "http" {
		// Pairing workers listen with TLS; store https so panel and map match real transport.
		u.Scheme = "https"
		node.Address = u.String()
	}

	// Bare host may have been resolved to http:// above when useTls was false; pairing is always https.
	if u2, err2 := url.Parse(node.Address); err2 == nil && u2.Scheme == "http" {
		u2.Scheme = "https"
		node.Address = u2.String()
	}

	pairing := &PanelPairingService{}
	secret, err := pairing.GetSecretKey()
	if err != nil {
		return "", fmt.Errorf("panel pairing secret: %w", err)
	}

	node.AuthMode = "pairing"
	// Panel→worker is always TLS+mTLS for pairing (worker does not serve plain HTTP with SECRET_KEY).
	node.UseTLS = true
	node.InsecureTLS = false
	node.CertPath = ""
	node.KeyPath = ""
	// Per-node TLS/JWT fields are no longer used; keep them blank for new pairing nodes.
	node.CaCertPem = ""
	node.PanelClientCertPem = ""
	node.PanelClientKeyPem = ""
	node.JwtPrivateKeyPem = ""
	// Pairing does not use per-node API keys: panel↔node uses JWT + mTLS; node→panel (logs) uses HMAC from SECRET_KEY.
	node.ApiKey = ""

	return secret, nil
}
