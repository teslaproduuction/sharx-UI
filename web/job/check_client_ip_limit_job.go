package job

import (
	"strings"

	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/web/service"
)

// CheckClientIPLimitJob enforces per-client concurrent unique IP limits.
type CheckClientIPLimitJob struct {
	clientService  service.ClientService
	sessionService service.ClientSessionService
}

func NewCheckClientIPLimitJob() *CheckClientIPLimitJob {
	return &CheckClientIPLimitJob{
		clientService:  service.ClientService{},
		sessionService: service.ClientSessionService{},
	}
}

func (j *CheckClientIPLimitJob) Run() {
	db := database.GetDB()
	var clients []model.ClientEntity
	if err := db.Where("ip_limit_enabled = ? AND max_ips > 0 AND enable = ?", true, true).Find(&clients).Error; err != nil {
		logger.Debugf("CheckClientIPLimitJob: list clients: %v", err)
		return
	}

	for i := range clients {
		c := &clients[i]
		resp, err := j.sessionService.GetOnlineSessionsForClient(c.UserId, c.Id)
		if err != nil || resp == nil {
			continue
		}
		ips := uniqueSessionIPsFromResults(resp.Results)
		if len(ips) <= c.MaxIPs {
			continue
		}
		excess := ips[c.MaxIPs:]
		if len(excess) == 0 {
			continue
		}
		logger.Warningf("CheckClientIPLimitJob: client %s exceeded IP limit (%d>%d), dropping %d IP(s)",
			c.Name, len(ips), c.MaxIPs, len(excess))
		if err := j.sessionService.DropSessionsByIPsForClient(c.UserId, c.Id, excess); err != nil {
			logger.Warningf("CheckClientIPLimitJob: drop sessions for %s: %v", c.Name, err)
		}
	}
}

func uniqueSessionIPsFromResults(results []service.ClientSessionNodeResult) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0)
	for _, block := range results {
		for _, s := range block.Sessions {
			ip := strings.TrimSpace(s.IP)
			if ip == "" {
				continue
			}
			k := strings.ToLower(ip)
			if _, ok := seen[k]; ok {
				continue
			}
			seen[k] = struct{}{}
			out = append(out, ip)
		}
	}
	return out
}
