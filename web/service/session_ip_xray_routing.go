package service

import (
	"encoding/json"
	"fmt"
	"net"
	"strings"

	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/util/json_util"
	"github.com/konstpic/sharx-code/v2/xray"
)

// Session block traffic is sent to this outbound (must exist in template: blackhole).
const sessionIPBlockOutboundTag = "blocked"

type sessionIPBlockRow struct {
	ClientId int    `gorm:"column:client_id"`
	Email    string `gorm:"column:email"`
	IP       string `gorm:"column:ip"`
}

// listSessionIPBlockRowsForXray returns email+IP rows for routing rules.
// If filter is nil, all blocked rows are included. If filter is non-nil, only those client_ids (empty map => none).
func listSessionIPBlockRowsForXray(filter map[int]struct{}) ([]sessionIPBlockRow, error) {
	db := database.GetDB()
	q := db.Table("client_blocked_session_ips AS c").
		Select("c.client_id AS client_id, ce.email AS email, c.ip AS ip").
		Joins("INNER JOIN client_entities ce ON ce.id = c.client_id")
	if filter != nil {
		if len(filter) == 0 {
			return nil, nil
		}
		ids := make([]int, 0, len(filter))
		for id := range filter {
			ids = append(ids, id)
		}
		q = q.Where("c.client_id IN ?", ids)
	}
	var rows []sessionIPBlockRow
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func ipToRoutingCIDR(ip string) string {
	n := NormalizeClientIP(ip)
	if n == "" {
		return ""
	}
	if parsed := net.ParseIP(n); parsed != nil {
		if v4 := parsed.To4(); v4 != nil {
			return fmt.Sprintf("%s/32", v4.String())
		}
		return fmt.Sprintf("%s/128", parsed.String())
	}
	if strings.Contains(n, "/") {
		return n
	}
	return n + "/32"
}

// MergeSessionIPBlockRoutingIntoConfig prepends Xray routing rules: user email + source CIDR -> blocked outbound.
// filter nil: all rows in client_blocked_session_ips. filter non-nil: only listed client IDs (omit empty map for none).
func MergeSessionIPBlockRoutingIntoConfig(cfg *xray.Config, filter map[int]struct{}) error {
	if cfg == nil {
		return nil
	}
	rows, err := listSessionIPBlockRowsForXray(filter)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}

	prefix := make([]any, 0, len(rows))
	for _, r := range rows {
		email := strings.TrimSpace(r.Email)
		norm := NormalizeClientIP(r.IP)
		cidr := ipToRoutingCIDR(norm)
		if email == "" || cidr == "" {
			continue
		}
		ruleTag := xray.SessionIPBlockRuleTag(r.ClientId, norm)
		prefix = append(prefix, map[string]any{
			"type":        "field",
			"ruleTag":     ruleTag,
			"user":        []string{email},
			"source":      []string{cidr},
			"outboundTag": sessionIPBlockOutboundTag,
		})
	}
	if len(prefix) == 0 {
		return nil
	}

	var routing map[string]any
	if len(cfg.RouterConfig) > 0 {
		if err := json.Unmarshal(cfg.RouterConfig, &routing); err != nil {
			return fmt.Errorf("routing json: %w", err)
		}
	} else {
		routing = map[string]any{"domainStrategy": "AsIs"}
	}
	existing, _ := routing["rules"].([]any)
	if existing == nil {
		existing = []any{}
	}
	combined := make([]any, 0, len(prefix)+len(existing))
	combined = append(combined, prefix...)
	combined = append(combined, existing...)
	routing["rules"] = combined

	out, err := json.Marshal(routing)
	if err != nil {
		return err
	}
	cfg.RouterConfig = json_util.RawMessage(out)
	logger.Debugf("Merged %d session-IP block routing rule(s) into Xray config", len(prefix))
	return nil
}
