package job

import (
	"time"

	"strings"

	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/logger"
	ldaputil "github.com/konstpic/sharx-code/v2/util/ldap"
	"github.com/konstpic/sharx-code/v2/web/service"

	"strconv"

	"github.com/google/uuid"
)

var DefaultTruthyValues = []string{"true", "1", "yes", "on"}

type LdapSyncJob struct {
	settingService service.SettingService
	inboundService service.InboundService
	xrayService    service.XrayService
}

func NewLdapSyncJob() *LdapSyncJob {
	return new(LdapSyncJob)
}

func (j *LdapSyncJob) Run() {
	logger.Info("LDAP sync job started")

	enabled, err := j.settingService.GetLdapEnable()
	if err != nil || !enabled {
		logger.Warning("LDAP disabled or failed to fetch flag")
		return
	}

	// --- LDAP fetch ---
	host, err := j.settingService.GetLdapHost()
	if err != nil {
		logger.Warning("LDAP setting read failed: ldapHost:", err)
		return
	}
	port, err := j.settingService.GetLdapPort()
	if err != nil {
		logger.Warning("LDAP setting read failed: ldapPort:", err)
		return
	}
	useTLS, err := j.settingService.GetLdapUseTLS()
	if err != nil {
		logger.Warning("LDAP setting read failed: ldapUseTLS:", err)
		return
	}
	bindDN, err := j.settingService.GetLdapBindDN()
	if err != nil {
		logger.Warning("LDAP setting read failed: ldapBindDN:", err)
		return
	}
	password, err := j.settingService.GetLdapPassword()
	if err != nil {
		logger.Warning("LDAP setting read failed: ldapPassword:", err)
		return
	}
	baseDN, err := j.settingService.GetLdapBaseDN()
	if err != nil {
		logger.Warning("LDAP setting read failed: ldapBaseDN:", err)
		return
	}
	userFilter, err := j.settingService.GetLdapUserFilter()
	if err != nil {
		logger.Warning("LDAP setting read failed: ldapUserFilter:", err)
		return
	}
	userAttr, err := j.settingService.GetLdapUserAttr()
	if err != nil {
		logger.Warning("LDAP setting read failed: ldapUserAttr:", err)
		return
	}

	flagField, err := j.settingService.GetLdapFlagField()
	if err != nil || strings.TrimSpace(flagField) == "" {
		// Backwards-compatible fallback to the legacy vless field name
		flagField, err = j.settingService.GetLdapVlessField()
		if err != nil {
			logger.Warning("LDAP setting read failed: ldapFlagField/ldapVlessField:", err)
			return
		}
	}

	truthyCSV, err := j.settingService.GetLdapTruthyValues()
	if err != nil {
		logger.Warning("LDAP setting read failed: ldapTruthyValues:", err)
		return
	}
	truthyVals := splitCsv(truthyCSV)

	invert, err := j.settingService.GetLdapInvertFlag()
	if err != nil {
		logger.Warning("LDAP setting read failed: ldapInvertFlag:", err)
		return
	}

	cfg := ldaputil.Config{
		Host:       host,
		Port:       port,
		UseTLS:     useTLS,
		BindDN:     bindDN,
		Password:   password,
		BaseDN:     baseDN,
		UserFilter: userFilter,
		UserAttr:   userAttr,
		FlagField:  flagField,
		TruthyVals: truthyVals,
		Invert:     invert,
	}

	flags, err := ldaputil.FetchVlessFlags(cfg)
	if err != nil {
		logger.Warning("LDAP fetch failed:", err)
		return
	}
	logger.Infof("Fetched %d LDAP flags", len(flags))

	// --- Load all inbounds and all clients once ---
	inboundTagsCSV, err := j.settingService.GetLdapInboundTags()
	if err != nil {
		logger.Warning("LDAP setting read failed: ldapInboundTags:", err)
		return
	}
	inboundTags := splitCsv(inboundTagsCSV)
	inbounds, err := j.inboundService.GetAllInbounds()
	if err != nil {
		logger.Warning("Failed to get inbounds:", err)
		return
	}

	allClients := map[string]*model.Client{}  // email -> client
	inboundMap := map[string]*model.Inbound{} // tag -> inbound
	for _, ib := range inbounds {
		inboundMap[ib.Tag] = ib
		clients, _ := j.inboundService.GetClients(ib)
		for i := range clients {
			allClients[clients[i].Email] = &clients[i]
		}
	}

	// --- Prepare batch operations ---
	autoCreate, err := j.settingService.GetLdapAutoCreate()
	if err != nil {
		logger.Warning("LDAP setting read failed: ldapAutoCreate:", err)
		return
	}
	defGB, err := j.settingService.GetLdapDefaultTotalGB()
	if err != nil {
		logger.Warning("LDAP setting read failed: ldapDefaultTotalGB:", err)
		return
	}
	defExpiryDays, err := j.settingService.GetLdapDefaultExpiryDays()
	if err != nil {
		logger.Warning("LDAP setting read failed: ldapDefaultExpiryDays:", err)
		return
	}
	// defLimitIP removed - using HWID only

	clientsToCreate := map[string][]model.Client{} // tag -> []new clients
	clientsToEnable := map[string][]string{}       // tag -> []email
	clientsToDisable := map[string][]string{}      // tag -> []email

	for email, allowed := range flags {
		exists := allClients[email] != nil
		for _, tag := range inboundTags {
			if !exists && allowed && autoCreate {
				newClient := j.buildClient(inboundMap[tag], email, defGB, defExpiryDays)
				clientsToCreate[tag] = append(clientsToCreate[tag], newClient)
			} else if exists {
				if allowed && !allClients[email].Enable {
					clientsToEnable[tag] = append(clientsToEnable[tag], email)
				} else if !allowed && allClients[email].Enable {
					clientsToDisable[tag] = append(clientsToDisable[tag], email)
				}
			}
		}
	}

	// --- Execute batch create ---
	for tag, newClients := range clientsToCreate {
		if len(newClients) == 0 {
			continue
		}
		payload := &model.Inbound{Id: inboundMap[tag].Id}
		payload.Settings = j.clientsToJSON(newClients)
		if _, err := j.inboundService.AddInboundClient(payload); err != nil {
			logger.Warningf("Failed to add clients for tag %s: %v", tag, err)
		} else {
			logger.Infof("LDAP auto-create: %d clients for %s", len(newClients), tag)
			j.xrayService.SetToNeedRestart()
		}
	}

	// --- Execute enable/disable batch ---
	for tag, emails := range clientsToEnable {
		j.batchSetEnable(inboundMap[tag], emails, true)
	}
	for tag, emails := range clientsToDisable {
		j.batchSetEnable(inboundMap[tag], emails, false)
	}

	// --- Auto delete clients not in LDAP ---
	autoDelete, err := j.settingService.GetLdapAutoDelete()
	if err != nil {
		logger.Warning("LDAP setting read failed: ldapAutoDelete:", err)
		return
	}
	if autoDelete {
		ldapEmailSet := map[string]struct{}{}
		for e := range flags {
			ldapEmailSet[e] = struct{}{}
		}
		for _, tag := range inboundTags {
			j.deleteClientsNotInLDAP(tag, ldapEmailSet)
		}
	}
}

func splitCsv(s string) []string {
	if s == "" {
		return DefaultTruthyValues
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		v := strings.TrimSpace(p)
		if v != "" {
			out = append(out, v)
		}
	}
	return out
}

// buildClient creates a new client for auto-create
func (j *LdapSyncJob) buildClient(ib *model.Inbound, email string, defGB, defExpiryDays int) model.Client {
	c := model.Client{
		Email:  email,
		Enable: true,
		// LimitIP removed - using HWID only
		TotalGB: int64(defGB),
	}
	if defExpiryDays > 0 {
		c.ExpiryTime = time.Now().Add(time.Duration(defExpiryDays) * 24 * time.Hour).UnixMilli()
	}
	switch ib.Protocol {
	case model.Trojan, model.Shadowsocks:
		c.Password = uuid.NewString()
	default:
		c.ID = uuid.NewString()
	}
	return c
}

// batchSetEnable enables/disables clients in batch through a single call
func (j *LdapSyncJob) batchSetEnable(ib *model.Inbound, emails []string, enable bool) {
	if len(emails) == 0 {
		return
	}

	// Prepare JSON for mass update
	clients := make([]model.Client, 0, len(emails))
	for _, email := range emails {
		clients = append(clients, model.Client{
			Email:  email,
			Enable: enable,
		})
	}

	payload := &model.Inbound{
		Id:       ib.Id,
		Settings: j.clientsToJSON(clients),
	}

	// Use a single AddInboundClient call to update enable
	if _, err := j.inboundService.AddInboundClient(payload); err != nil {
		logger.Warningf("Batch set enable failed for inbound %s: %v", ib.Tag, err)
		return
	}

	logger.Infof("Batch set enable=%v for %d clients in inbound %s", enable, len(emails), ib.Tag)
	j.xrayService.SetToNeedRestart()
}

// deleteClientsNotInLDAP deletes clients not in LDAP using batches and a single restart
func (j *LdapSyncJob) deleteClientsNotInLDAP(inboundTag string, ldapEmails map[string]struct{}) {
	inbounds, err := j.inboundService.GetAllInbounds()
	if err != nil {
		logger.Warning("Failed to get inbounds for deletion:", err)
		return
	}

	batchSize := 50 //  clients in 1 batch
	restartNeeded := false

	for _, ib := range inbounds {
		if ib.Tag != inboundTag {
			continue
		}
		clients, err := j.inboundService.GetClients(ib)
		if err != nil {
			logger.Warningf("Failed to get clients for inbound %s: %v", ib.Tag, err)
			continue
		}

		// Collect clients for deletion
		toDelete := []model.Client{}
		for _, c := range clients {
			if _, ok := ldapEmails[c.Email]; !ok {
				toDelete = append(toDelete, c)
			}
		}

		if len(toDelete) == 0 {
			continue
		}

		// Delete in batches
		for i := 0; i < len(toDelete); i += batchSize {
			end := i + batchSize
			if end > len(toDelete) {
				end = len(toDelete)
			}
			batch := toDelete[i:end]

			for _, c := range batch {
				var clientKey string
				switch ib.Protocol {
				case model.Trojan:
					clientKey = c.Password
				case model.Shadowsocks:
					clientKey = c.Email
				default: // vless/vmess
					clientKey = c.ID
				}

				if _, err := j.inboundService.DelInboundClient(ib.Id, clientKey); err != nil {
					logger.Warningf("Failed to delete client %s from inbound id=%d(tag=%s): %v",
						c.Email, ib.Id, ib.Tag, err)
				} else {
					logger.Infof("Deleted client %s from inbound id=%d(tag=%s)",
						c.Email, ib.Id, ib.Tag)
					// do not restart here
					restartNeeded = true
				}
			}
		}
	}

	// One time after all batches
	if restartNeeded {
		j.xrayService.SetToNeedRestart()
		logger.Info("Xray restart scheduled after batch deletion")
	}
}

// clientsToJSON serializes an array of clients to JSON
func (j *LdapSyncJob) clientsToJSON(clients []model.Client) string {
	b := strings.Builder{}
	b.WriteString("{\"clients\":[")
	for i, c := range clients {
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(j.clientToJSON(c))
	}
	b.WriteString("]}")
	return b.String()
}

// clientToJSON serializes minimal client fields to JSON object string without extra deps
func (j *LdapSyncJob) clientToJSON(c model.Client) string {
	// construct minimal JSON manually to avoid importing json for simple case
	b := strings.Builder{}
	b.WriteString("{")
	if c.ID != "" {
		b.WriteString("\"id\":\"")
		b.WriteString(c.ID)
		b.WriteString("\",")
	}
	if c.Password != "" {
		b.WriteString("\"password\":\"")
		b.WriteString(c.Password)
		b.WriteString("\",")
	}
	b.WriteString("\"email\":\"")
	b.WriteString(c.Email)
	b.WriteString("\",")
	b.WriteString("\"enable\":")
	if c.Enable {
		b.WriteString("true")
	} else {
		b.WriteString("false")
	}
	b.WriteString(",")
	// limitIp removed - using HWID only
	b.WriteString("\"totalGB\":")
	b.WriteString(strconv.FormatInt(c.TotalGB, 10))
	if c.ExpiryTime > 0 {
		b.WriteString(",\"expiryTime\":")
		b.WriteString(strconv.FormatInt(c.ExpiryTime, 10))
	}
	b.WriteString("}")
	return b.String()
}
