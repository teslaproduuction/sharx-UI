//go:build linux

package conndrop

import (
	"os/exec"
	"runtime"
	"sync"
)

var (
	conntrackOnce sync.Once
	conntrackPath string
	conntrackOk   bool
)

// Available is true when running on Linux and the conntrack binary is on PATH.
func Available() bool {
	if runtime.GOOS != "linux" {
		return false
	}
	conntrackOnce.Do(func() {
		p, err := exec.LookPath("conntrack")
		if err == nil && p != "" {
			conntrackPath = p
			conntrackOk = true
		}
	})
	return conntrackOk
}

// DropIPs closes connections where either end matches an IP (per-IP conntrack -D -s / -D -d).
// Requires CAP_NET_ADMIN in containers. conntrack delete may return "0 entries" (non-fatal).
func DropIPs(ips []string) error {
	if !Available() {
		return ErrConntrackUnavailable
	}
	for _, ip := range ips {
		if ip == "" {
			continue
		}
		//nolint:gosec // G204: conntrack path from LookPath, ip from trusted panel flow
		_ = exec.Command(conntrackPath, "-D", "-s", ip).Run()
		_ = exec.Command(conntrackPath, "-D", "-d", ip).Run()
	}
	return nil
}
