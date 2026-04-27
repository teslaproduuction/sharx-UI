package service

import (
	"crypto/x509"
	"encoding/pem"
	"testing"
)

func TestGenerateSelfSignedServerTLS(t *testing.T) {
	out, err := GenerateSelfSignedServerTLS(SelfSignedTLSParams{
		CommonName:   "test.example.com",
		DNSNames:     []string{"test.example.com", "alt.example.com"},
		ValidityDays: 30,
	})
	if err != nil {
		t.Fatal(err)
	}
	if out == nil || out.CertPEM == "" || out.KeyPEM == "" {
		t.Fatal("empty PEM")
	}
	block, _ := pem.Decode([]byte(out.CertPEM))
	if block == nil || block.Type != "CERTIFICATE" {
		t.Fatal("invalid cert PEM")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	if cert.Subject.CommonName != "test.example.com" {
		t.Errorf("CN: got %q", cert.Subject.CommonName)
	}
	if len(cert.DNSNames) < 2 {
		t.Errorf("DNSNames: %+v", cert.DNSNames)
	}
}

func TestGenerateSelfSignedServerTLS_DefaultLocalhost(t *testing.T) {
	out, err := GenerateSelfSignedServerTLS(SelfSignedTLSParams{})
	if err != nil {
		t.Fatal(err)
	}
	block, _ := pem.Decode([]byte(out.CertPEM))
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	if len(cert.DNSNames) == 0 {
		t.Fatal("expected at least localhost SAN")
	}
}
