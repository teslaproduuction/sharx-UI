// Package web provides the panel static filesystem and helpers for the Next.js export.
package web

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/konstpic/sharx-code/v2/config"
	"github.com/gin-gonic/gin"
)

//go:embed all:panel
var panelContent embed.FS

// panelRootHTTP is the http.FileSystem for the static export root.
var panelRootHTTP http.FileSystem

// panelFsys is the read-only fs.FS for the same tree (for fs.Sub: _next, locales).
var panelFsys fs.FS

func initPanelFileSystem() error {
	if config.IsDebug() {
		wd, _ := os.Getwd()
		d := path.Join(wd, "web", "panel")
		if st, err := os.Stat(d); err == nil && st.IsDir() {
			panelFsys = os.DirFS(d)
			panelRootHTTP = http.FS(panelFsys)
			return nil
		}
	}
	sub, err := fs.Sub(panelContent, "panel")
	if err != nil {
		return err
	}
	panelFsys = sub
	panelRootHTTP = http.FS(sub)
	return nil
}

// servePanelFile streams a file from panelRootHTTP using http.ServeContent.
// Do not use gin.Context.FileFromFS here: it sets Request.URL.Path to a path without
// a leading slash and delegates to http.FileServer, which can emit 301 with Location: ./
// for directory-style path handling.
func servePanelFile(c *gin.Context, name string) bool {
	f, err := panelRootHTTP.Open(name)
	if err != nil {
		return false
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil || st.IsDir() {
		return false
	}
	rs, ok := f.(io.ReadSeeker)
	if !ok {
		return false
	}
	http.ServeContent(c.Writer, c.Request, path.Base(name), st.ModTime(), rs)
	return true
}

// ServePanelLoginPage serves the root index.html of the static export (login).
func ServePanelLoginPage(c *gin.Context) {
	if !servePanelFile(c, "index.html") {
		c.String(http.StatusNotFound, "not found")
	}
}

// panelURLSubpath returns the path under /panel/ (e.g. "inbounds" for /panel/inbounds/).
// Uses the *filepath param when present; otherwise parses the request path (NoRoute / SPA fallback).
func normalizeWebBase(c *gin.Context) string {
	b := c.GetString("base_path")
	if b == "" {
		return "/"
	}
	if !strings.HasPrefix(b, "/") {
		b = "/" + b
	}
	if !strings.HasSuffix(b, "/") {
		b += "/"
	}
	return b
}

func panelURLSubpath(c *gin.Context) string {
	if fp := strings.Trim(c.Param("filepath"), "/"); fp != "" {
		return fp
	}
	base := normalizeWebBase(c)
	path := c.Request.URL.Path
	bt := strings.TrimSuffix(base, "/")
	panelRoot := bt + "/panel"
	if path == panelRoot || path == panelRoot+"/" {
		return ""
	}
	if strings.HasPrefix(path, panelRoot+"/") {
		return strings.Trim(strings.TrimPrefix(path, panelRoot+"/"), "/")
	}
	return ""
}

// ServePanelReactPage serves panel/* HTML from the Next static export.
func ServePanelReactPage(c *gin.Context) {
	p := panelURLSubpath(c)
	p = strings.Trim(p, "/")
	if p == "" {
		if !servePanelFile(c, "panel/index.html") {
			c.String(http.StatusNotFound, "not found")
		}
		return
	}
	rel := path.Clean("panel/" + p)
	candidates := []string{rel + "/index.html", rel + ".html"}
	for _, name := range candidates {
		if servePanelFile(c, name) {
			return
		}
	}
	if !servePanelFile(c, "panel/index.html") {
		c.String(http.StatusNotFound, "not found")
	}
}
