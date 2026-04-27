package service

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"strings"
	"time"
)

// SelfSignedTLSParams configures a self-signed server certificate for TLS (e.g. Hysteria over QUIC).
type SelfSignedTLSParams struct {
	CommonName   string
	DNSNames     []string
	IPAddresses  []string
	ValidityDays int
}

// SelfSignedTLSPEM is PEM-encoded certificate and private key for inbound TLS.
type SelfSignedTLSPEM struct {
	CertPEM string `json:"certPem"`
	KeyPEM  string `json:"keyPem"`
}

// GenerateSelfSignedServerTLS creates an RSA-2048 key and a self-signed X.509 server certificate.
// At least one DNS name or IP SAN is set; defaults to localhost if none are provided.
func GenerateSelfSignedServerTLS(p SelfSignedTLSParams) (*SelfSignedTLSPEM, error) {
	days := p.ValidityDays
	if days <= 0 {
		days = 365
	}
	if days > 3650 {
		days = 3650
	}

	seenD := make(map[string]struct{})
	var dns []string
	for _, d := range p.DNSNames {
		d = strings.TrimSpace(d)
		if d == "" {
			continue
		}
		if _, ok := seenD[d]; !ok {
			seenD[d] = struct{}{}
			dns = append(dns, d)
		}
	}

	seenI := make(map[string]struct{})
	var ips []net.IP
	for _, s := range p.IPAddresses {
		if ip := net.ParseIP(strings.TrimSpace(s)); ip != nil {
			k := ip.String()
			if _, ok := seenI[k]; !ok {
				seenI[k] = struct{}{}
				ips = append(ips, ip)
			}
		}
	}

	cn := strings.TrimSpace(p.CommonName)
	if cn == "" {
		if len(dns) > 0 {
			cn = dns[0]
		} else if len(ips) > 0 {
			cn = ips[0].String()
		} else {
			cn = "localhost"
		}
	}

	if hostIP := net.ParseIP(cn); hostIP != nil {
		k := hostIP.String()
		if _, ok := seenI[k]; !ok {
			seenI[k] = struct{}{}
			ips = append(ips, hostIP)
		}
	} else {
		if _, ok := seenD[cn]; !ok {
			seenD[cn] = struct{}{}
			dns = append(dns, cn)
		}
	}

	if len(dns) == 0 && len(ips) == 0 {
		dns = []string{"localhost"}
	}

	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("generate RSA key: %w", err)
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, err
	}
	now := time.Now()
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			Organization: []string{"SharX"},
			CommonName:     cn,
		},
		NotBefore:   now.Add(-1 * time.Hour),
		NotAfter:    now.AddDate(0, 0, days),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:    dns,
		IPAddresses: ips,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &priv.PublicKey, priv)
	if err != nil {
		return nil, fmt.Errorf("create certificate: %w", err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(priv)})

	return &SelfSignedTLSPEM{
		CertPEM: string(certPEM),
		KeyPEM:  string(keyPEM),
	}, nil
}
