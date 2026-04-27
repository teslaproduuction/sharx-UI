package xray

import (
	"fmt"
	"strings"
)

// SessionIPBlockRuleTag returns a stable Xray routing ruleTag for panel session-IP blocks (hot API + file merge).
func SessionIPBlockRuleTag(clientId int, normalizedIP string) string {
	s := strings.TrimSpace(normalizedIP)
	s = strings.ReplaceAll(s, ":", "_")
	s = strings.ReplaceAll(s, ".", "_")
	s = strings.ReplaceAll(s, "/", "_")
	if s == "" {
		s = "unknown"
	}
	return fmt.Sprintf("sharx-sb-%d-%s", clientId, s)
}
