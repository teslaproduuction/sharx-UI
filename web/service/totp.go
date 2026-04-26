package service

import (
	"strings"
	"time"

	"github.com/xlzd/gotp"
)

// VerifyTOTPCode checks a TOTP code against secret using a ±30s window (adjacent time steps).
func VerifyTOTPCode(secret, code string) bool {
	code = strings.TrimSpace(code)
	if secret == "" || code == "" {
		return false
	}
	t := gotp.NewDefaultTOTP(secret)
	now := time.Now().Unix()
	for _, delta := range []int64{-30, 0, 30} {
		if t.Verify(code, now+delta) {
			return true
		}
	}
	return false
}
