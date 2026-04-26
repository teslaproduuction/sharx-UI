package service

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/konstpic/sharx-code/v2/config"
	"github.com/konstpic/sharx-code/v2/logger"

	"golang.org/x/mod/semver"
)

const (
	githubReleasesLatestAPI = "https://api.github.com/repos/konstpic/sharx-code/releases/latest"
	appMetaCacheTTL         = 15 * time.Minute
)

// AppMeta is returned by the public appMeta endpoint (version + optional update hint).
type AppMeta struct {
	Version         string `json:"version"`
	LatestVersion   string `json:"latestVersion,omitempty"`
	UpdateAvailable bool   `json:"updateAvailable"`
	ReleaseURL      string `json:"releaseUrl,omitempty"`
}

type githubRelease struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
}

var appMetaCache struct {
	mu       sync.Mutex
	fetched  time.Time
	tag      string
	release  string
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

func fetchLatestReleaseFromGitHub() (tag, url string, err error) {
	client := &http.Client{Timeout: 12 * time.Second}
	req, err := http.NewRequest(http.MethodGet, githubReleasesLatestAPI, nil)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "SharX-Panel/"+strings.TrimSpace(config.GetVersion()))
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", "", fmt.Errorf("github status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var rel githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return "", "", err
	}
	tag = strings.TrimSpace(rel.TagName)
	url = strings.TrimSpace(rel.HTMLURL)
	if tag == "" {
		return "", "", fmt.Errorf("empty tag_name")
	}
	return tag, url, nil
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
		tag, url, err := fetchLatestReleaseFromGitHub()
		appMetaCache.fetched = time.Now()
		appMetaCache.tag = tag
		appMetaCache.release = url
		appMetaCache.fetchErr = err
		if err != nil {
			logger.Debugf("app meta: github release fetch: %v", err)
		}
	}
	latest := appMetaCache.tag
	releaseURL := appMetaCache.release
	appMetaCache.mu.Unlock()

	if latest != "" {
		out.LatestVersion = strings.TrimPrefix(latest, "v")
		if releaseURL != "" {
			out.ReleaseURL = releaseURL
		}
		if semverLess(current, latest) {
			out.UpdateAvailable = true
		}
	}

	return out
}
