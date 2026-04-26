package service

import "testing"

func TestNormalizeTelegramBotProxyForDial(t *testing.T) {
	cases := []struct {
		in       string
		wantOut  string
		wantWarn bool
	}{
		{"", "", false},
		{"  socks5://127.0.0.1:1080  ", "socks5://127.0.0.1:1080", false},
		{"http://10.0.0.1:8888", "http://10.0.0.1:8888", false},
		{"https://user:pass@p.example:8443", "https://user:pass@p.example:8443", false},
		{"192.0.2.1:1080", "socks5://192.0.2.1:1080", false},
		{"[2001:db8::1]:1080", "socks5://[2001:db8::1]:1080", false},
		{"tg://proxy?server=1.1.1.1&port=1080&secret=ddd", "", true},
		{"https://t.me/proxy?server=example.com&port=8888&secret=ee6f", "", true},
		{"t.me/proxy?server=1.1.1.1&port=443&secret=ddabcdef", "", true},
		{"https://t.me/proxy?server=1.1.1.1&port=443", "socks5://1.1.1.1:443", false},
		{"tg://proxy?server=2.2.2.2&port=100", "socks5://2.2.2.2:100", false},
		{"nonsense@#$", "", true},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			out, warn := normalizeTelegramBotProxyForDial(tc.in)
			if (warn != "") != tc.wantWarn {
				t.Errorf("warn: got %q, want non-empty: %v", warn, tc.wantWarn)
			}
			if out != tc.wantOut {
				t.Errorf("out: got %q, want %q", out, tc.wantOut)
			}
		})
	}
}
