package service

import "testing"

func TestNodeHealthTgHysteresis(t *testing.T) {
	const id = 424242
	resetNodeHealthTgHysteresis(id)

	d, u, from := nodeHealthTgHysteresisAfterCheck(id, true, "online")
	if d || u {
		t.Fatalf("first fail: should not notify, got down=%v up=%v", d, u)
	}

	d, u, from = nodeHealthTgHysteresisAfterCheck(id, true, "error")
	if !d || u || from != "online" {
		t.Fatalf("second fail: want down, from=online, got down=%v up=%v from=%q", d, u, from)
	}

	d, u, from = nodeHealthTgHysteresisAfterCheck(id, true, "error")
	if d || u {
		t.Fatalf("third fail: should be suppressed, got down=%v up=%v", d, u)
	}

	d, u, _ = nodeHealthTgHysteresisAfterCheck(id, false, "error")
	if d || u {
		t.Fatalf("first success after down: no notify, got down=%v up=%v", d, u)
	}

	d, u, _ = nodeHealthTgHysteresisAfterCheck(id, false, "online")
	if u == false || d {
		t.Fatalf("second success: want recovery up, got down=%v up=%v", d, u)
	}

	d, u, from = nodeHealthTgHysteresisAfterCheck(id, true, "online")
	if d || u {
		t.Fatalf("after recovery: first fail, no down yet, got down=%v up=%v", d, u)
	}
	d, u, from = nodeHealthTgHysteresisAfterCheck(id, true, "error")
	if !d || u || from != "online" {
		t.Fatalf("new incident: want down from online, got down=%v up=%v from=%q", d, u, from)
	}
}

func TestNodeHealthTgHysteresisReset(t *testing.T) {
	const id = 11
	resetNodeHealthTgHysteresis(id)
	_, u, _ := nodeHealthTgHysteresisAfterCheck(id, true, "online")
	_, u, _ = nodeHealthTgHysteresisAfterCheck(id, true, "error")
	_, u, _ = nodeHealthTgHysteresisAfterCheck(id, false, "error")
	_, u, _ = nodeHealthTgHysteresisAfterCheck(id, false, "online")
	if !u {
		t.Fatal("expected recovery after 2+2 pattern")
	}
	resetNodeHealthTgHysteresis(id)
	_, u, _ = nodeHealthTgHysteresisAfterCheck(id, false, "online")
	if u {
		t.Fatal("after reset, single success should not report up")
	}
}
