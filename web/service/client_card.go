// Package service — client card DTO helpers for the panel API.
package service

import (
	"errors"
	"fmt"
	"strings"

	"github.com/konstpic/sharx-code/v2/database/model"
)

// FirstPartySubPageURL builds the public subscription page URL (Next static /panel/sub/?id=).
// Uses panel webDomain + webPort when configured; otherwise falls back to requestHost (e.g. sub server redirect).
func FirstPartySubPageURL(settingService SettingService, subID, requestHost string, requestTLS bool) string {
	if strings.TrimSpace(subID) == "" {
		return ""
	}
	bp, _ := settingService.GetBasePath()
	scheme := "http"
	if cf, _ := settingService.GetCertFile(); cf != "" {
		if kf, _ := settingService.GetKeyFile(); kf != "" {
			scheme = "https"
		}
	} else if requestTLS {
		scheme = "https"
	}
	tls := scheme == "https"
	port, _ := settingService.GetPort()
	path := strings.TrimSuffix(bp, "/") + "/panel/sub/?id=" + subID

	if wd, _ := settingService.GetWebDomain(); strings.TrimSpace(wd) != "" {
		hostPart := strings.TrimSpace(wd)
		if !((port == 443 && tls) || (port == 80 && !tls)) {
			hostPart = fmt.Sprintf("%s:%d", hostPart, port)
		}
		return scheme + "://" + hostPart + path
	}

	wh := strings.TrimSpace(requestHost)
	if wh == "" {
		return ""
	}
	hostPart := wh
	if !strings.Contains(wh, ":") {
		if !((port == 443 && tls) || (port == 80 && !tls)) {
			hostPart = fmt.Sprintf("%s:%d", wh, port)
		}
	}
	return scheme + "://" + hostPart + path
}

// SubscriptionURLsForClient builds plain and JSON subscription URLs for a client's subId.
// Uses configured subURI / subJsonURI when set; otherwise derives host from requestHost
// (panel Host header) and subPort/subPath from settings (same idea as SettingService all-settings).
// The plain URL is always overridden to the first-party subscription page when it can be resolved.
func SubscriptionURLsForClient(settingService SettingService, subID string, requestHost string, requestTLS bool) (plain string, jsonLink string) {
	if subID == "" {
		return "", ""
	}
	subURI, _ := settingService.GetSubURI()
	subJsonURI, _ := settingService.GetSubJsonURI()
	if subURI != "" {
		plain = strings.TrimRight(subURI, "/") + "/" + subID
	}
	if subJsonURI != "" {
		jsonLink = strings.TrimRight(subJsonURI, "/") + "/" + subID
	}

	if plain == "" || jsonLink == "" {
		subPort, _ := settingService.GetSubPort()
		subPath, _ := settingService.GetSubPath()
		jsonPath, _ := settingService.GetSubJsonPath()
		subDomain, _ := settingService.GetSubDomain()
		certFile, _ := settingService.GetSubCertFile()
		keyFile, _ := settingService.GetSubKeyFile()
		subTLS := certFile != "" && keyFile != ""
		scheme := "http"
		if subTLS || requestTLS {
			scheme = "https"
		}
		host := subDomain
		if host == "" && requestHost != "" {
			host = requestHost
			if i := strings.Index(host, ":"); i >= 0 {
				host = host[:i]
			}
		}
		if host != "" {
			base := scheme + "://"
			if (subPort == 443 && subTLS) || (subPort == 80 && !subTLS) {
				base += host
			} else {
				base += fmt.Sprintf("%s:%d", host, subPort)
			}
			if plain == "" {
				plain = strings.TrimRight(base+subPath, "/") + "/" + subID
			}
			jsonEnable, _ := settingService.GetSubJsonEnable()
			if jsonLink == "" && jsonEnable {
				jsonLink = strings.TrimRight(base+jsonPath, "/") + "/" + subID
			}
		}
	}

	if u := FirstPartySubPageURL(settingService, subID, requestHost, requestTLS); u != "" {
		plain = u
	}
	return plain, jsonLink
}

// ClientToCardView maps a loaded ClientEntity (with InboundIds, HWIDs) to ClientCardView.
func (s *ClientService) ClientToCardView(client *model.ClientEntity, inboundService InboundService, requestHost string, requestTLS bool, fillSubscription bool) (*model.ClientCardView, error) {
	if client == nil {
		return nil, errors.New("client is nil")
	}
	view := &model.ClientCardView{
		ClientEntity: *client,
		Inbounds:     nil,
	}
	for _, h := range client.HWIDs {
		if h != nil && h.IsActive {
			view.ActiveHwidCount++
		}
	}
	for _, iid := range client.InboundIds {
		if iid <= 0 {
			continue
		}
		inbound, err := inboundService.GetInbound(iid)
		if err != nil || inbound == nil {
			continue
		}
		view.Inbounds = append(view.Inbounds, model.ClientCardInboundBrief{
			Id:       inbound.Id,
			Remark:   inbound.Remark,
			Protocol: string(inbound.Protocol),
			Port:     inbound.Port,
			Tag:      inbound.Tag,
		})
	}
	if fillSubscription && client.SubID != "" {
		settingService := SettingService{}
		view.SubscriptionURL, view.SubscriptionJsonURL = SubscriptionURLsForClient(settingService, client.SubID, requestHost, requestTLS)
	}
	return view, nil
}
