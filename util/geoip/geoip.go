// Package geoip resolves public egress IP and approximate lat/lon using public HTTP APIs (chain with fallbacks).
package geoip

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const defaultTimeout = 8 * time.Second

// Lookup holds the result of a full lookup (public IP + coordinates).
type Lookup struct {
	IP     string  `json:"ip"`
	Lat    float64 `json:"lat"`
	Lon    float64 `json:"lon"`
	Source string  `json:"source"`
}

// Client performs HTTP lookups with a bounded timeout.
type Client struct {
	HTTP *http.Client
}

func (c *Client) httpClient() *http.Client {
	if c != nil && c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: defaultTimeout}
}

func (c *Client) getString(url string) (string, error) {
	resp, err := c.httpClient().Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("geoip: %s status %d", url, resp.StatusCode)
	}
	return string(b), nil
}

// ResolvePublicIP returns this host's public IPv4/IPv6 as seen by the first working service.
func (c *Client) ResolvePublicIP() (ip string, err error) {
	s, err := c.getString("https://api.ipify.org?format=json")
	if err == nil {
		var v struct {
			IP string `json:"ip"`
		}
		if json.Unmarshal([]byte(s), &v) == nil && net.ParseIP(strings.TrimSpace(v.IP)) != nil {
			return strings.TrimSpace(v.IP), nil
		}
	}
	s, err = c.getString("https://ifconfig.me/ip")
	if err != nil {
		return "", err
	}
	ip = strings.TrimSpace(s)
	if net.ParseIP(ip) == nil {
		return "", fmt.Errorf("geoip: ifconfig.me returned non-IP %q", ip)
	}
	return ip, nil
}

// ResolveLatLon returns approximate coordinates for ip using RIPEstat first, then HTTPS fallbacks, then ip-api (HTTP).
func (c *Client) ResolveLatLon(ip string) (lat, lon float64, source string, err error) {
	ip = strings.TrimSpace(ip)
	if net.ParseIP(ip) == nil {
		return 0, 0, "", fmt.Errorf("geoip: invalid ip %q", ip)
	}
	if lat, lon, ok := c.tryRIPE(ip); ok {
		return lat, lon, "ripestat", nil
	}
	if lat, lon, ok := c.tryIPAPICo(ip); ok {
		return lat, lon, "ipapi.co", nil
	}
	if lat, lon, ok := c.tryIPAPICom(ip); ok {
		return lat, lon, "ip-api.com", nil
	}
	if lat, lon, ok := c.tryIPInfo(ip); ok {
		return lat, lon, "ipinfo.io", nil
	}
	return 0, 0, "", fmt.Errorf("geoip: all providers failed for %s", ip)
}

// LookupSelf resolves public IP and then lat/lon.
func (c *Client) LookupSelf() (Lookup, error) {
	ip, err := c.ResolvePublicIP()
	if err != nil {
		return Lookup{}, err
	}
	lat, lon, source, err := c.ResolveLatLon(ip)
	if err != nil {
		return Lookup{}, err
	}
	return Lookup{IP: ip, Lat: lat, Lon: lon, Source: source}, nil
}

func (c *Client) tryRIPE(ip string) (lat, lon float64, ok bool) {
	u := "https://stat.ripe.net/data/geoloc/data.json?resource=" + ip
	s, err := c.getString(u)
	if err != nil {
		return 0, 0, false
	}
	var wrap struct {
		Data struct {
			Locations []struct {
				Latitude  json.RawMessage `json:"latitude"`
				Longitude json.RawMessage `json:"longitude"`
			} `json:"locations"`
		} `json:"data"`
	}
	if json.Unmarshal([]byte(s), &wrap) != nil || len(wrap.Data.Locations) == 0 {
		return 0, 0, false
	}
	loc := wrap.Data.Locations[0]
	lat, latOK := parseJSONFloat(loc.Latitude)
	lon, lonOK := parseJSONFloat(loc.Longitude)
	if !latOK || !lonOK {
		return 0, 0, false
	}
	return lat, lon, true
}

func parseJSONFloat(raw json.RawMessage) (float64, bool) {
	if len(raw) == 0 {
		return 0, false
	}
	var f float64
	if json.Unmarshal(raw, &f) == nil {
		return f, true
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		f, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
		return f, err == nil
	}
	return 0, false
}

func (c *Client) tryIPAPICo(ip string) (lat, lon float64, ok bool) {
	s, err := c.getString("https://ipapi.co/" + ip + "/json/")
	if err != nil {
		return 0, 0, false
	}
	var v struct {
		Latitude  *float64 `json:"latitude"`
		Longitude *float64 `json:"longitude"`
		Error     bool     `json:"error"`
		Reason    string   `json:"reason"`
	}
	if json.Unmarshal([]byte(s), &v) != nil || v.Error || v.Latitude == nil || v.Longitude == nil {
		return 0, 0, false
	}
	return *v.Latitude, *v.Longitude, true
}

func (c *Client) tryIPAPICom(ip string) (lat, lon float64, ok bool) {
	s, err := c.getString("http://ip-api.com/json/" + ip)
	if err != nil {
		return 0, 0, false
	}
	var v struct {
		Status string  `json:"status"`
		Lat    float64 `json:"lat"`
		Lon    float64 `json:"lon"`
	}
	if json.Unmarshal([]byte(s), &v) != nil || v.Status != "success" {
		return 0, 0, false
	}
	return v.Lat, v.Lon, true
}

func (c *Client) tryIPInfo(ip string) (lat, lon float64, ok bool) {
	s, err := c.getString("https://ipinfo.io/" + ip + "/json")
	if err != nil {
		return 0, 0, false
	}
	var v struct {
		Loc string `json:"loc"`
	}
	if json.Unmarshal([]byte(s), &v) != nil || v.Loc == "" {
		return 0, 0, false
	}
	parts := strings.SplitN(v.Loc, ",", 3)
	if len(parts) < 2 {
		return 0, 0, false
	}
	lat, err1 := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
	lon, err2 := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	if err1 != nil || err2 != nil {
		return 0, 0, false
	}
	return lat, lon, true
}
