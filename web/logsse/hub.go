// Package logsse provides a Server-Sent Events hub for real-time log streaming.
// It replaces the previous WebSocket log_stream channel to avoid flooding the shared
// WebSocket connection with high-frequency log lines (Xray access logs, node push-logs).
//
// Design:
//   - Each SSE client connection registers a subscriber with an optional min-level filter.
//   - Emitted log entries are placed in a single shared channel (non-blocking, drops on overflow).
//   - A dispatcher goroutine batches entries for 250 ms (or up to batchSize entries) before
//     flushing to each subscriber, applying per-client level and source filters.
package logsse

import (
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/konstpic/sharx-code/v2/logger"
)

const (
	batchInterval = 250 * time.Millisecond
	batchSize     = 50
	inChanCap     = 4096
	clientChanCap = 64
)

// levelOrder maps level string → numeric priority (higher = more severe).
var levelOrder = map[string]int{
	"debug":   0,
	"info":    1,
	"notice":  2,
	"warn":    3,
	"warning": 3,
	"error":   4,
}

func levelInt(level string) int {
	if v, ok := levelOrder[strings.ToLower(level)]; ok {
		return v
	}
	return 1 // default: info
}

// Entry is the wire format sent to the frontend over SSE.
type Entry struct {
	Source   string `json:"source"`
	Channel  string `json:"channel,omitempty"`
	Level    string `json:"level"`
	Message  string `json:"message"`
	Ts       int64  `json:"ts"`
	NodeID   string `json:"nodeId,omitempty"`
	NodeName string `json:"nodeName,omitempty"`
}

// subscriber represents one active SSE connection.
type subscriber struct {
	ch       chan []Entry
	minLevel int    // minimum level int to pass through
	source   string // "all" or specific source filter
}

// Hub is the central log SSE dispatcher. Use the package-level singleton via Default().
type Hub struct {
	in          chan Entry
	mu          sync.RWMutex
	subscribers map[*subscriber]struct{}
	stopCh      chan struct{}
	once        sync.Once
}

var defaultHub = &Hub{
	in:          make(chan Entry, inChanCap),
	subscribers: make(map[*subscriber]struct{}),
	stopCh:      make(chan struct{}),
}

func init() {
	go defaultHub.run()
}

// Default returns the package-level singleton hub.
func Default() *Hub { return defaultHub }

// Emit converts a logger.Entry and dispatches it to all subscribers (non-blocking).
func Emit(e logger.Entry) {
	defaultHub.Emit(e)
}

// Emit sends one log entry into the hub's input channel.
// If the channel is full it drops the entry rather than blocking the caller.
func (h *Hub) Emit(e logger.Entry) {
	ts := e.TsUnixMs
	if ts == 0 {
		ts = time.Now().UnixMilli()
	}
	src := strings.ToLower(strings.TrimSpace(e.Source))
	if src == "" {
		src = "panel"
	}
	lvl := strings.ToLower(strings.TrimSpace(e.Level))
	if lvl == "" {
		lvl = "info"
	}
	entry := Entry{
		Source:   src,
		Channel:  strings.TrimSpace(e.Channel),
		Level:    lvl,
		Message:  strings.TrimSpace(e.Msg),
		Ts:       ts,
		NodeID:   strings.TrimSpace(e.NodeID),
		NodeName: strings.TrimSpace(e.NodeName),
	}
	if entry.Message == "" {
		return
	}
	select {
	case h.in <- entry:
	default:
		// drop — better to lose a log line than to block the caller
	}
}

// Subscribe registers a new SSE subscriber. minLevel and source are optional filters;
// pass "" to accept all. Returns the subscriber and a cancel func.
func Subscribe(minLevel, source string) (*subscriber, func()) {
	return defaultHub.Subscribe(minLevel, source)
}

// Subscribe registers a new SSE subscriber on this hub.
func (h *Hub) Subscribe(minLevel, source string) (*subscriber, func()) {
	sub := &subscriber{
		ch:       make(chan []Entry, clientChanCap),
		minLevel: levelInt(minLevel),
		source:   strings.ToLower(strings.TrimSpace(source)),
	}
	h.mu.Lock()
	h.subscribers[sub] = struct{}{}
	h.mu.Unlock()

	cancel := func() {
		h.mu.Lock()
		delete(h.subscribers, sub)
		h.mu.Unlock()
		// drain to unblock any blocked sender
		for {
			select {
			case <-sub.ch:
			default:
				return
			}
		}
	}
	return sub, cancel
}

// Chan returns the subscriber's receive channel (read-only).
func (s *subscriber) Chan() <-chan []Entry { return s.ch }

// run is the dispatcher loop: accumulates entries from in, flushes every batchInterval
// or when batchSize is reached, then fans out to all matching subscribers.
func (h *Hub) run() {
	ticker := time.NewTicker(batchInterval)
	defer ticker.Stop()

	batch := make([]Entry, 0, batchSize)

	flush := func() {
		if len(batch) == 0 {
			return
		}
		toSend := batch
		batch = make([]Entry, 0, batchSize)

		h.mu.RLock()
		subs := make([]*subscriber, 0, len(h.subscribers))
		for s := range h.subscribers {
			subs = append(subs, s)
		}
		h.mu.RUnlock()

		if len(subs) == 0 {
			return
		}

		for _, sub := range subs {
			filtered := filterBatch(toSend, sub.minLevel, sub.source)
			if len(filtered) == 0 {
				continue
			}
			select {
			case sub.ch <- filtered:
			default:
				// subscriber is slow — drop batch for this client
			}
		}
	}

	for {
		select {
		case <-h.stopCh:
			return
		case e := <-h.in:
			batch = append(batch, e)
			if len(batch) >= batchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

func filterBatch(batch []Entry, minLevel int, source string) []Entry {
	out := make([]Entry, 0, len(batch))
	for _, e := range batch {
		if levelInt(e.Level) < minLevel {
			continue
		}
		if source != "" && source != "all" && e.Source != source {
			continue
		}
		out = append(out, e)
	}
	return out
}

// MarshalSSEBatch serializes a batch of entries to the SSE data line format.
// Format: "data: <json-array>\n\n"
func MarshalSSEBatch(entries []Entry) ([]byte, error) {
	data, err := json.Marshal(entries)
	if err != nil {
		return nil, err
	}
	out := make([]byte, 0, len(data)+10)
	out = append(out, "data: "...)
	out = append(out, data...)
	out = append(out, '\n', '\n')
	return out, nil
}
