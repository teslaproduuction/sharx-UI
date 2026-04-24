package middleware

import (
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
)

// RedirectMiddleware returns a Gin middleware that handles URL redirections.
// It provides backward compatibility by redirecting old '/xui' paths to new '/panel' paths,
// including API endpoints. The middleware performs permanent redirects (301) for SEO purposes.
func RedirectMiddleware(basePath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Normalize path before matching. std path.Clean("") and path.Clean(".") return "."
		// (not "/"), so always special-case empty/single-dot before Clean.
		p := c.Request.URL.Path
		if p == "" || p == "." {
			p = "/"
		} else {
			p = path.Clean(p)
			if p == "." {
				p = "/"
			}
		}
		c.Request.URL.Path = p
		// Never apply legacy /xui → /panel 301s to the site root: avoids odd Location values and loops.
		if p == "/" {
			c.Next()
			return
		}

		// Redirect from old '/xui' path to new '/panel' paths
		redirects := map[string]string{
			"panel/API": "panel/api",
			"xui/API":   "panel/api",
			"xui":       "panel",
		}

		reqPath := c.Request.URL.Path
		for rFrom, rTo := range redirects {
			from, to := basePath+rFrom, basePath+rTo
			// Defensive: strings.HasPrefix(s, "") is always true, which would corrupt Location.
			if from == "" {
				continue
			}
			if !strings.HasPrefix(reqPath, from) {
				continue
			}
			newPath := to + reqPath[len(from):]
			if newPath == "" {
				newPath = "/"
			} else if newPath[0] != '/' {
				newPath = "/" + newPath
			}
			// net/http+Gin: relative "./" for GET path "." yields Location: ./ and an infinite 301 loop.
			if newPath == "./" || newPath == "." {
				newPath = "/"
			} else {
				cl := path.Clean(newPath)
				if cl == "." {
					newPath = "/"
				} else {
					newPath = cl
					if newPath[0] != '/' {
						newPath = "/" + newPath
					}
				}
			}

			c.Redirect(http.StatusMovedPermanently, newPath)
			c.Abort()
			return
		}

		c.Next()
	}
}
