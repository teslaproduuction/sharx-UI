package service

import (
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/konstpic/sharx-code/v2/conndrop"
	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/logger"
	"gorm.io/gorm/clause"
)

// ClientSessionBlockService manages per-client blocked source IPs (subscription session blocklist).
type ClientSessionBlockService struct{}

// kickConntrackAfterSessionBlock drops active kernel connections for the IP on the panel host (single-node)
// and on each worker that carries this client's inbounds (multi-node). Helps tear down MTProto/Telemt TCP
// since Xray session-IP routing rules do not apply to Telemt traffic.
func kickConntrackAfterSessionBlock(clientId int, ips []string) {
	if len(ips) == 0 {
		return
	}
	ss := SettingService{}
	multi, _ := ss.GetMultiNodeMode()
	if !multi {
		if conndrop.Available() {
			if err := conndrop.DropIPs(ips); err != nil {
				logger.Debugf("session block: local conntrack drop: %v", err)
			}
		}
		return
	}
	nodeSvc := NodeService{}
	cs := ClientService{}
	inboundIds, err := cs.GetInboundIdsForClient(clientId)
	if err != nil {
		return
	}
	seen := make(map[int]struct{})
	for _, iid := range inboundIds {
		nodes, err := nodeSvc.GetNodesForInbound(iid)
		if err != nil {
			continue
		}
		for _, n := range nodes {
			if n == nil || !n.Enable {
				continue
			}
			if _, ok := seen[n.Id]; ok {
				continue
			}
			seen[n.Id] = struct{}{}
			if err := nodeSvc.PostDropIPsToNode(n, ips); err != nil {
				logger.Debugf("session block: node %s drop ips: %v", n.Name, err)
			}
		}
	}
}

// NormalizeClientIP trims host/port and returns canonical form for comparison.
func NormalizeClientIP(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if h, _, err := net.SplitHostPort(s); err == nil {
		s = h
	}
	if strings.HasPrefix(s, "[") && strings.Contains(s, "]") {
		if close := strings.Index(s, "]"); close > 1 {
			s = s[1:close]
		}
	}
	if ip := net.ParseIP(s); ip != nil {
		if v4 := ip.To4(); v4 != nil {
			return v4.String()
		}
		return ip.String()
	}
	return s
}

// IsSessionIPBlocked returns true if this client's subscription should be denied for the given remote IP.
func (s *ClientSessionBlockService) IsSessionIPBlocked(clientId int, ip string) (bool, error) {
	n := NormalizeClientIP(ip)
	if n == "" {
		return false, nil
	}
	db := database.GetDB()
	var rows []model.ClientBlockedSessionIP
	err := db.Where("client_id = ?", clientId).Find(&rows).Error
	if err != nil {
		return false, err
	}
	for _, r := range rows {
		if NormalizeClientIP(r.IP) == n {
			return true, nil
		}
	}
	return false, nil
}

// ListBlockedSessionIPs returns all blocked IPs for a client (normalized storage).
func (s *ClientSessionBlockService) ListBlockedSessionIPs(clientId int) ([]string, error) {
	db := database.GetDB()
	var rows []model.ClientBlockedSessionIP
	if err := db.Where("client_id = ?", clientId).Order("created_at ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		if strings.TrimSpace(r.IP) != "" {
			out = append(out, r.IP)
		}
	}
	return out, nil
}

// SetSessionIPBlocked adds or removes an IP from the client's session blocklist.
func (s *ClientSessionBlockService) SetSessionIPBlocked(userId, clientId int, ip string, blocked bool) error {
	ip = NormalizeClientIP(ip)
	if ip == "" {
		return fmt.Errorf("invalid IP")
	}
	cs := ClientService{}
	cl, err := cs.GetClient(clientId)
	if err != nil {
		return err
	}
	if cl == nil || cl.UserId != userId {
		return fmt.Errorf("client not found")
	}
	db := database.GetDB()
	email := strings.TrimSpace(cl.Name)
	if !blocked {
		if err := db.Where("client_id = ? AND ip = ?", clientId, ip).Delete(&model.ClientBlockedSessionIP{}).Error; err != nil {
			return err
		}
		(&XrayService{}).ApplySessionIPBlockHotAfterDB(clientId, email, ip, false)
		SyncTelemtAfterClientSessionBlocksChanged(clientId)
		return nil
	}
	row := model.ClientBlockedSessionIP{
		ClientId:  clientId,
		IP:        ip,
		CreatedAt: time.Now().Unix(),
	}
	if err := db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "client_id"}, {Name: "ip"}},
		DoNothing: true,
	}).Create(&row).Error; err != nil {
		return err
	}
	(&XrayService{}).ApplySessionIPBlockHotAfterDB(clientId, email, ip, true)
	kickConntrackAfterSessionBlock(clientId, []string{ip})
	SyncTelemtAfterClientSessionBlocksChanged(clientId)
	return nil
}

// ErrSessionIPBlocked is returned when subscription is denied due to session IP blocklist.
var ErrSessionIPBlocked = fmt.Errorf("session IP is blocked for this client")

// CheckSessionIPAllowed returns an error if the request IP is on the client's blocklist.
func (s *ClientSessionBlockService) CheckSessionIPAllowed(clientId int, requestIP string) error {
	ok, err := s.IsSessionIPBlocked(clientId, requestIP)
	if err != nil {
		return err
	}
	if ok {
		return ErrSessionIPBlocked
	}
	return nil
}
