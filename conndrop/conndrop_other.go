//go:build !linux

package conndrop

// Available is false on non-Linux; use Linux worker nodes to drop connections.
func Available() bool { return false }

// DropIPs is not supported on this platform.
func DropIPs(ips []string) error { return ErrConntrackUnavailable }
