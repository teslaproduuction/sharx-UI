package job

import "testing"

func TestHealthPollIntervalSec(t *testing.T) {
	if got := HealthPollIntervalSec("online", 15, 5); got != 15 {
		t.Fatalf("online: got %d want 15", got)
	}
	if got := HealthPollIntervalSec("error", 15, 5); got != 5 {
		t.Fatalf("error: got %d want 5", got)
	}
	if got := HealthPollIntervalSec("offline", 15, 5); got != 5 {
		t.Fatalf("offline: got %d want 5", got)
	}
}
