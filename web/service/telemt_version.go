package service

// Telemt version management — list upstream releases and hot-swap the panel-host
// telemt binary, mirroring the Xray version switcher. The Telemt fork ships
// prebuilt tarballs (telemt-linux-<arch>.tar.gz) on GitHub releases, so unlike
// sing-box (built from source in the image) it can be swapped at runtime.
import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const telemtReleasesAPI = "https://api.github.com/repos/telemt/telemt/releases"

// telemtBinPath resolves the same binary location node/telemt.findTelemtBinary
// uses (TELEMT_BIN env, else /app/bin/telemt).
func telemtBinPath() string {
	if p := strings.TrimSpace(os.Getenv("TELEMT_BIN")); p != "" {
		return p
	}
	return "/app/bin/telemt"
}

func telemtAssetArch() (string, error) {
	switch runtime.GOARCH {
	case "amd64":
		return "linux-amd64", nil
	case "arm64":
		return "linux-arm64", nil
	default:
		return "", fmt.Errorf("telemt: unsupported arch %s", runtime.GOARCH)
	}
}

// TelemtVersions returns recent Telemt release tags (newest first, capped).
func TelemtVersions() ([]string, error) {
	req, _ := http.NewRequest(http.MethodGet, telemtReleasesAPI, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		var e struct {
			Message string `json:"message"`
		}
		if json.Unmarshal(body, &e) == nil && e.Message != "" {
			return nil, fmt.Errorf("GitHub API: %s", e.Message)
		}
		return nil, fmt.Errorf("GitHub API status %d", resp.StatusCode)
	}
	var releases []Release
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(releases))
	for _, r := range releases {
		if strings.TrimSpace(r.TagName) == "" {
			continue
		}
		out = append(out, r.TagName)
		if len(out) >= 30 {
			break
		}
	}
	return out, nil
}

// InstallTelemtVersion downloads the prebuilt tarball for the given release tag,
// extracts the `telemt` binary, atomically replaces the on-disk binary, and
// restarts the panel-host Telemt sidecars with the new build.
func InstallTelemtVersion(version string) error {
	version = strings.TrimSpace(version)
	if version == "" {
		return fmt.Errorf("telemt: empty version")
	}
	arch, err := telemtAssetArch()
	if err != nil {
		return err
	}
	asset := fmt.Sprintf("telemt-%s.tar.gz", arch)
	url := fmt.Sprintf("https://github.com/telemt/telemt/releases/download/%s/%s", version, asset)

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return fmt.Errorf("telemt download: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telemt download %s: status %d", url, resp.StatusCode)
	}

	gz, err := gzip.NewReader(resp.Body)
	if err != nil {
		return fmt.Errorf("telemt gunzip: %w", err)
	}
	defer gz.Close()

	binPath := telemtBinPath()
	tmpPath := binPath + ".new"
	tr := tar.NewReader(gz)
	found := false
	for {
		hdr, terr := tr.Next()
		if terr == io.EOF {
			break
		}
		if terr != nil {
			return fmt.Errorf("telemt untar: %w", terr)
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		// The tarball holds a single `telemt` binary (basename may be nested).
		if filepath.Base(hdr.Name) != "telemt" {
			continue
		}
		out, ferr := os.OpenFile(tmpPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
		if ferr != nil {
			return fmt.Errorf("telemt create %s: %w", tmpPath, ferr)
		}
		if _, cerr := io.Copy(out, tr); cerr != nil {
			out.Close()
			os.Remove(tmpPath)
			return fmt.Errorf("telemt write: %w", cerr)
		}
		out.Close()
		found = true
		break
	}
	if !found {
		os.Remove(tmpPath)
		return fmt.Errorf("telemt: no `telemt` binary in %s", asset)
	}

	// Stop running instances, swap the binary atomically, then re-apply so the
	// new build takes over.
	StopLocalTelemtStandalone()
	if err := os.Rename(tmpPath, binPath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("telemt swap: %w", err)
	}
	_ = os.Chmod(binPath, 0o755)
	TryApplyLocalTelemtStandalone(nil)
	return nil
}
