package service

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/konstpic/sharx-code/v2/config"
	"github.com/konstpic/sharx-code/v2/logger"

	"golang.org/x/mod/semver"
)

const (
	githubReleasesLatestAPI = "https://api.github.com/repos/konstpic/SharX/releases/latest"
	appMetaCacheTTL         = 15 * time.Minute
	maxReleaseNotesBytes    = 196608 // ~192 KiB raw UTF-8 from GitHub release body
)

// AppMeta is returned by the public appMeta endpoint (version + optional update hint).
type AppMeta struct {
	Version              string `json:"version"`
	LatestVersion        string `json:"latestVersion,omitempty"`
	UpdateAvailable      bool   `json:"updateAvailable"`
	ReleaseURL           string `json:"releaseUrl,omitempty"`
	ReleaseNotesMarkdown string `json:"releaseNotesMarkdown,omitempty"`
	PanelLang            string `json:"panelLang,omitempty"`
	PanelTheme           string `json:"panelTheme,omitempty"`
}

type githubRelease struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
	Body    string `json:"body"`
}

var appMetaCache struct {
	mu       sync.Mutex
	fetched  time.Time
	tag      string
	release  string
	body     string
	fetchErr error
}

func normalizeSemver(v string) string {
	v = strings.TrimSpace(strings.TrimPrefix(v, "v"))
	if v == "" {
		return ""
	}
	canon := "v" + v
	if semver.IsValid(canon) {
		return semver.Canonical(canon)
	}
	return ""
}

func semverLess(a, b string) bool {
	ca, cb := normalizeSemver(a), normalizeSemver(b)
	if ca == "" || cb == "" {
		return false
	}
	return semver.Compare(ca, cb) < 0
}

func truncateReleaseBody(s string, maxBytes int) string {
	s = strings.TrimSpace(s)
	if s == "" || maxBytes <= 0 {
		return ""
	}
	if len(s) <= maxBytes {
		return s
	}
	s = s[:maxBytes]
	// avoid cutting mid-rune
	for !utf8.ValidString(s) {
		s = s[:len(s)-1]
	}
	return strings.TrimSpace(s) + "\n\n…"
}

func fetchLatestReleaseFromGitHub() (tag, url, body string, err error) {
	client := &http.Client{Timeout: 12 * time.Second}
	req, err := http.NewRequest(http.MethodGet, githubReleasesLatestAPI, nil)
	if err != nil {
		return "", "", "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "SharX-Panel/"+strings.TrimSpace(config.GetVersion()))
	resp, err := client.Do(req)
	if err != nil {
		return "", "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", "", "", fmt.Errorf("github status %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var rel githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return "", "", "", err
	}
	tag = strings.TrimSpace(rel.TagName)
	url = strings.TrimSpace(rel.HTMLURL)
	body = truncateReleaseBody(rel.Body, maxReleaseNotesBytes)
	if tag == "" {
		return "", "", "", fmt.Errorf("empty tag_name")
	}
	return tag, url, body, nil
}

// GetPublicAppMeta returns the running panel version and (cached) latest GitHub release info.
func GetPublicAppMeta() AppMeta {
	current := strings.TrimSpace(config.GetVersion())
	out := AppMeta{
		Version: current,
	}

	appMetaCache.mu.Lock()
	needFetch := time.Since(appMetaCache.fetched) > appMetaCacheTTL || appMetaCache.fetched.IsZero()
	if needFetch {
		tag, url, body, err := fetchLatestReleaseFromGitHub()
		appMetaCache.fetched = time.Now()
		appMetaCache.tag = tag
		appMetaCache.release = url
		appMetaCache.body = body
		appMetaCache.fetchErr = err
		if err != nil {
			logger.Debugf("app meta: github release fetch: %v", err)
		}
	}
	latest := appMetaCache.tag
	releaseURL := appMetaCache.release
	notesMD := appMetaCache.body
	appMetaCache.mu.Unlock()

	if latest != "" {
		out.LatestVersion = strings.TrimPrefix(latest, "v")
		if releaseURL != "" {
			out.ReleaseURL = releaseURL
		}
		if notesMD != "" {
			out.ReleaseNotesMarkdown = notesMD
		}
		if semverLess(current, latest) {
			out.UpdateAvailable = true
		}
	}

	return out
}
