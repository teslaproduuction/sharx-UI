package controller

import (
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/util/common"
	"github.com/konstpic/sharx-code/v2/web/service"

	"github.com/gin-gonic/gin"
)

const (
	publicSubRateWindow = time.Minute
	publicSubRateMax    = 120
)

type publicSubRateBucket struct {
	mu sync.Mutex
	ts []time.Time
}

var publicSubRate sync.Map // clientIP -> *publicSubRateBucket

func publicSubscriptionRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if ip == "" {
			ip = "unknown"
		}
		now := time.Now()
		v, _ := publicSubRate.LoadOrStore(ip, &publicSubRateBucket{})
		b := v.(*publicSubRateBucket)
		b.mu.Lock()
		var keep []time.Time
		for _, t := range b.ts {
			if now.Sub(t) < publicSubRateWindow {
				keep = append(keep, t)
			}
		}
		if len(keep) >= publicSubRateMax {
			b.ts = keep
			b.mu.Unlock()
			c.AbortWithStatus(http.StatusTooManyRequests)
			return
		}
		keep = append(keep, now)
		b.ts = keep
		b.mu.Unlock()
		c.Next()
	}
}

// registerPublicSubscriptionRoutes registers unauthenticated JSON endpoints for the first-party subscription page.
func registerPublicSubscriptionRoutes(g *gin.RouterGroup, ss *service.SettingService) {
	if ss == nil {
		s := service.SettingService{}
		ss = &s
	}
	pub := g.Group("/panel/api/public")
	pub.Use(publicSubscriptionRateLimit())
	pub.GET("/subscription", publicSubscriptionGet(ss))
	pub.GET("/appMeta", publicAppMeta)
}

func publicAppMeta(c *gin.Context) {
	meta := service.GetPublicAppMeta()
	jsonObj(c, meta, nil)
}

func hostForSubsHook(reqHost string) string {
	host := reqHost
	if strings.Contains(host, ":") {
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
	}
	return host
}

func publicSubscriptionGet(ss *service.SettingService) gin.HandlerFunc {
	return func(c *gin.Context) {
		subID := strings.TrimSpace(c.Query("id"))
		if subID == "" {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		if subscriptionSubsHook == nil {
			c.AbortWithStatus(http.StatusServiceUnavailable)
			return
		}

		var client model.ClientEntity
		if err := database.GetDB().Where("sub_id = ?", subID).First(&client).Error; err != nil {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}

		var svc service.SubscriptionPageConfigService
		_ = svc.EnsureDefault()
		cfgUUID, err := svc.FirstConfigUUID()
		if err != nil {
			c.AbortWithStatus(http.StatusInternalServerError)
			return
		}
		cfgRow, err := svc.GetByUUID(cfgUUID)
		if err != nil {
			c.AbortWithStatus(http.StatusInternalServerError)
			return
		}

		host := hostForSubsHook(c.Request.Host)
		subs, _, _, err := subscriptionSubsHook(subID, host)
		if err != nil || len(subs) == 0 {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}

		scheme := "http"
		if cf, _ := ss.GetCertFile(); cf != "" {
			if kf, _ := ss.GetKeyFile(); kf != "" {
				scheme = "https"
			}
		}
		tls := scheme == "https"
		feedURL, jsonURL, pageURL := service.SubscriptionURLsForClient(*ss, subID, c.Request.Host, tls)

		nowMs := time.Now().UnixMilli()
		totalLimit := int64(client.TotalGB * 1024 * 1024 * 1024)
		used := client.Up + client.Down
		trafficExceeded := client.TotalGB > 0 && used >= totalLimit
		timeExpired := client.ExpiryTime > 0 && client.ExpiryTime <= nowMs

		userStatus := "ACTIVE"
		if !client.Enable {
			userStatus = "DISABLED"
		} else if timeExpired {
			userStatus = "EXPIRED"
		} else if trafficExceeded {
			userStatus = "LIMITED"
		}

		isActive := client.Enable && !timeExpired && !trafficExceeded

		expiresAt := time.Date(9999, 12, 31, 23, 59, 59, 0, time.UTC).Format(time.RFC3339Nano)
		var daysLeft int
		if client.ExpiryTime > 0 {
			expiresAt = time.UnixMilli(client.ExpiryTime).UTC().Format(time.RFC3339Nano)
			daysLeft = int(time.UnixMilli(client.ExpiryTime).Sub(time.Now()).Hours() / 24)
			if daysLeft < 0 {
				daysLeft = 0
			}
		} else {
			daysLeft = 9999
		}

		trafficLimitStr := common.FormatTraffic(0)
		if totalLimit > 0 {
			trafficLimitStr = common.FormatTraffic(totalLimit)
		} else {
			trafficLimitStr = "∞"
		}

		var cfgParsed any
		if err := json.Unmarshal([]byte(cfgRow.ConfigJSON), &cfgParsed); err != nil {
			cfgParsed = cfgRow.ConfigJSON
		}

		var vpnOnline bool
		inboundSvc := service.InboundService{}
		for _, e := range inboundSvc.GetOnlineClients() {
			if strings.EqualFold(strings.TrimSpace(e), client.Email) {
				vpnOnline = true
				break
			}
		}

		out := gin.H{
			"config":              cfgParsed,
			"configUuid":          cfgRow.UUID,
			"subscriptionUrl":     feedURL,
			"subscriptionJsonUrl": jsonURL,
			"links":               subs,
			"user": gin.H{
				"shortUuid":                subID,
				"username":                 client.Email,
				"daysLeft":                 daysLeft,
				"trafficUsed":              common.FormatTraffic(client.Up + client.Down),
				"trafficLimit":             trafficLimitStr,
				"lifetimeTrafficUsed":      common.FormatTraffic(client.AllTime),
				"trafficUsedBytes":         strconv.FormatInt(client.Up+client.Down, 10),
				"trafficLimitBytes":        strconv.FormatInt(totalLimit, 10),
				"lifetimeTrafficUsedBytes": strconv.FormatInt(client.AllTime, 10),
				"expiresAt":                expiresAt,
				"isActive":                 isActive,
				"userStatus":               userStatus,
				"isOnline":                 vpnOnline,
			},
		}
		if pageURL != "" && pageURL != feedURL {
			out["subscriptionPageUrl"] = pageURL
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "obj": out})
	}
}
