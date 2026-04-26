package service

import "sync"

// Telegram "node up/down" spam happens when /health flaps: DB is set to *online* on each
// success, so the next failure looks like online→error again. We debounce Tg only:
//   - "down" alert: after 2 consecutive failed health checks
//   - "up" alert:  after 2 consecutive successful checks while a "down" alert is pending

const (
	nodeHealthTgConsecutiveFailForDown = 2
	nodeHealthTgConsecutiveOKForUp     = 2
)

var (
	nodeHealthTgHystMu sync.Mutex
	nodeHealthTgHyst   = make(map[int]*nodeHealthTgHystState)
)

type nodeHealthTgHystState struct {
	failStreak    int
	okStreak      int
	hasOpenDown   bool
	firstFailFrom string
}

// resetNodeHealthTgHysteresis clears in-memory Tg state for a node (e.g. when disabled).
func resetNodeHealthTgHysteresis(nodeID int) {
	nodeHealthTgHystMu.Lock()
	defer nodeHealthTgHystMu.Unlock()
	delete(nodeHealthTgHyst, nodeID)
}

// nodeHealthTgHysteresisAfterCheck updates streaks from one CheckNodeStatus outcome and
// returns whether the caller should send a Telegram "down" or "up" notification.
// checkFailed is true when CheckNodeHealth's CheckNodeStatus returned a non-nil error.
// statusBeforeCheck is the node.Status in DB at the start of this check (for down message "previous").
func nodeHealthTgHysteresisAfterCheck(nodeID int, checkFailed bool, statusBeforeCheck string) (sendDown, sendUp bool, downFromStatus string) {
	nodeHealthTgHystMu.Lock()
	defer nodeHealthTgHystMu.Unlock()

	h, ok := nodeHealthTgHyst[nodeID]
	if !ok {
		h = &nodeHealthTgHystState{}
		nodeHealthTgHyst[nodeID] = h
	}

	if checkFailed {
		h.okStreak = 0
		if h.failStreak == 0 {
			h.firstFailFrom = statusBeforeCheck
		}
		h.failStreak++
		if h.failStreak < nodeHealthTgConsecutiveFailForDown {
			return false, false, ""
		}
		if h.hasOpenDown {
			return false, false, ""
		}
		h.hasOpenDown = true
		from := h.firstFailFrom
		h.firstFailFrom = ""
		if from == "" {
			from = statusBeforeCheck
		}
		return true, false, from
	}

	h.failStreak = 0
	if !h.hasOpenDown {
		h.firstFailFrom = ""
		h.okStreak = 0
		return false, false, ""
	}
	h.okStreak++
	if h.okStreak < nodeHealthTgConsecutiveOKForUp {
		return false, false, ""
	}
	h.hasOpenDown = false
	h.okStreak = 0
	h.firstFailFrom = ""
	return false, true, ""
}
