package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/konstpic/sharx-code/v2/conndrop"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/xray"
)

// ClientSessionNodeResult is online IP sessions for one panel Xray (local) or one worker.
type ClientSessionNodeResult struct {
	NodeID        *int                   `json:"nodeId,omitempty"`
	NodeName      string                 `json:"nodeName"`
	Sessions      []xray.OnlineIPSession `json:"sessions"`
	DropAvailable bool                   `json:"dropAvailable"`
	Error         string                 `json:"error,omitempty"`
}

// ClientOnlineSessionsResponse aggregates results from local Xray and/or worker nodes.
type ClientOnlineSessionsResponse struct {
	Email   string                    `json:"email"`
	Results []ClientSessionNodeResult `json:"results"`
}

// ClientSessionService lists and drops per-IP client sessions (Xray user>>>email>>>online + conntrack).
type ClientSessionService struct{}

// GetOnlineSessionsForClient returns sessions for the client email on all relevant nodes (and local in single-mode).
func (s *ClientSessionService) GetOnlineSessionsForClient(userId, clientId int) (*ClientOnlineSessionsResponse, error) {
	cs := ClientService{}
	client, err := cs.GetClient(clientId)
	if err != nil {
		return nil, err
	}
	if client.UserId != userId {
		return nil, fmt.Errorf("client not found")
	}
	email := strings.TrimSpace(client.Email)
	if email == "" {
		return &ClientOnlineSessionsResponse{Email: email, Results: nil}, nil
	}

	ss := SettingService{}
	multi, _ := ss.GetMultiNodeMode()

	out := &ClientOnlineSessionsResponse{Email: email}

	if !multi {
		xs := XrayService{}
		if !xs.IsXrayRunning() {
			out.Results = append(out.Results, ClientSessionNodeResult{
				NodeName:      "Local",
				Sessions:      nil,
				DropAvailable: conndrop.Available(),
				Error:         "",
			})
			return out, nil
		}
		apiPort := xs.GetAPIPort()
		api, cleanup, err := xs.GetOrCreateAPI(apiPort)
		if err != nil {
			return nil, err
		}
		defer cleanup()
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		sessions, err := api.GetUserOnlineIPList(ctx, email, false)
		if err != nil {
			logger.Warningf("local user online IP list: %v", err)
			out.Results = append(out.Results, ClientSessionNodeResult{
				NodeName:      "Local",
				Sessions:      nil,
				DropAvailable: conndrop.Available(),
				Error:         err.Error(),
			})
			return out, nil
		}
		out.Results = append(out.Results, ClientSessionNodeResult{
			NodeName:      "Local",
			Sessions:      sessions,
			DropAvailable: conndrop.Available(),
		})
		return out, nil
	}

	// Multi-node: union of nodes assigned to this client's inbounds
	inboundIds, err := cs.GetInboundIdsForClient(clientId)
	if err != nil {
		return nil, err
	}
	nodeSvc := NodeService{}
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
			sess, err := nodeSvc.GetUserOnlineSessionsFromNode(n, email, false)
			if err != nil {
				nid := n.Id
				out.Results = append(out.Results, ClientSessionNodeResult{
					NodeID:   &nid,
					NodeName: n.Name,
					Error:    err.Error(),
				})
				continue
			}
			nid := n.Id
			out.Results = append(out.Results, ClientSessionNodeResult{
				NodeID:        &nid,
				NodeName:      n.Name,
				Sessions:      sess.Sessions,
				DropAvailable: sess.DropAvailable,
			})
		}
	}
	return out, nil
}

// DropAllSessionsForClient resolves IPs from Xray online map and drops conntrack entries on each target (local and/or workers).
func (s *ClientSessionService) DropAllSessionsForClient(userId, clientId int) error {
	resp, err := s.GetOnlineSessionsForClient(userId, clientId)
	if err != nil {
		return err
	}
	email := strings.TrimSpace(resp.Email)
	if email == "" {
		return nil
	}
	ss := SettingService{}
	multi, _ := ss.GetMultiNodeMode()
	if !multi {
		if !conndrop.Available() {
			return conndrop.ErrConntrackUnavailable
		}
		xs := XrayService{}
		if !xs.IsXrayRunning() {
			return fmt.Errorf("xray is not running")
		}
		apiPort := xs.GetAPIPort()
		api, cleanup, err := xs.GetOrCreateAPI(apiPort)
		if err != nil {
			return err
		}
		defer cleanup()
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		sessions, err := api.GetUserOnlineIPList(ctx, email, true)
		if err != nil {
			return err
		}
		ips := make([]string, 0, len(sessions))
		for _, se := range sessions {
			if se.IP != "" {
				ips = append(ips, se.IP)
			}
		}
		if len(ips) == 0 {
			return nil
		}
		return conndrop.DropIPs(ips)
	}

	// multi-node: call each worker's drop-connections
	nodeSvc := NodeService{}
	cs := ClientService{}
	inboundIds, _ := cs.GetInboundIdsForClient(clientId)
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
			if err := nodeSvc.PostDropConnectionsToNode(n, []string{email}); err != nil {
				return fmt.Errorf("node %s: %w", n.Name, err)
			}
		}
	}
	return nil
}

// DropSessionsByIPsForClient drops conntrack for specific IPs on nodes that have this client (multi) or local (single).
func (s *ClientSessionService) DropSessionsByIPsForClient(userId, clientId int, ips []string) error {
	if len(ips) == 0 {
		return nil
	}
	if !conndrop.Available() {
		return conndrop.ErrConntrackUnavailable
	}
	cs := ClientService{}
	client, err := cs.GetClient(clientId)
	if err != nil {
		return err
	}
	if client.UserId != userId {
		return fmt.Errorf("client not found")
	}
	ss := SettingService{}
	multi, _ := ss.GetMultiNodeMode()
	if !multi {
		return conndrop.DropIPs(ips)
	}
	nodeSvc := NodeService{}
	seen := make(map[int]struct{})
	inboundIds, _ := cs.GetInboundIdsForClient(clientId)
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
				return fmt.Errorf("node %s: %w", n.Name, err)
			}
		}
	}
	return nil
}
