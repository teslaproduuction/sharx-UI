package geoip

import (
	"encoding/json"
	"testing"
)

func TestParseJSONFloat(t *testing.T) {
	raw := json.RawMessage(`37.5`)
	v, ok := parseJSONFloat(raw)
	if !ok || v != 37.5 {
		t.Fatalf("got %v %v", v, ok)
	}
	raw = json.RawMessage(`"12.25"`)
	v, ok = parseJSONFloat(raw)
	if !ok || v != 12.25 {
		t.Fatalf("string form got %v %v", v, ok)
	}
}
