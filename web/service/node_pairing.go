package service

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/util/random"
)

// PrepareNodePairing switches the node into auth_mode=pairing and returns the panel-wide
// SECRET_KEY (base64 JSON) that the worker consumes via environment variable.
//
// Starting with migration 0027 the panel uses a single shared pairing bundle (Remnawave-style)
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
		u, _ = url.Parse("https://" + addr)
		node.Address = u.String()
	}

	pairing := &PanelPairingService{}
	secret, err := pairing.GetSecretKey()
	if err != nil {
		return "", fmt.Errorf("panel pairing secret: %w", err)
	}

	node.AuthMode = "pairing"
	node.UseTLS = true
	node.InsecureTLS = false
	node.CertPath = ""
	node.KeyPath = ""
	// Per-node TLS/JWT fields are no longer used; keep them blank for new pairing nodes.
	node.CaCertPem = ""
	node.PanelClientCertPem = ""
	node.PanelClientKeyPem = ""
	node.JwtPrivateKeyPem = ""
	// ApiKey is still populated: some flows fall back to it and a random value avoids UNIQUE collisions.
	node.ApiKey = random.Seq(32)

	return secret, nil
}
