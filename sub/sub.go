// Package sub provides subscription server functionality for the SharX panel,
// including HTTP/HTTPS servers for serving subscription links and JSON configurations.
package sub

import (
	"context"
	"crypto/tls"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"

	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/util/common"
	"github.com/konstpic/sharx-code/v2/web/locale"
	"github.com/konstpic/sharx-code/v2/web/middleware"
	"github.com/konstpic/sharx-code/v2/web/network"
	"github.com/konstpic/sharx-code/v2/web/service"

	"github.com/gin-gonic/gin"
)

// Server represents the subscription server that serves subscription links and JSON configurations.
type Server struct {
	httpServer *http.Server
	listener   net.Listener

	sub            *SUBController
	settingService service.SettingService

	ctx    context.Context
	cancel context.CancelFunc
}

// NewServer creates a new subscription server instance with a cancellable context.
func NewServer() *Server {
	ctx, cancel := context.WithCancel(context.Background())
	return &Server{
		ctx:    ctx,
		cancel: cancel,
	}
}

// initRouter configures the subscription server's Gin engine, middleware,
// templates and static assets and returns the ready-to-use engine.
func (s *Server) initRouter() (*gin.Engine, error) {
	// Always run in release mode for the subscription server
	gin.DefaultWriter = io.Discard
	gin.DefaultErrorWriter = io.Discard
	gin.SetMode(gin.ReleaseMode)

	engine := gin.Default()

	subDomain, err := s.settingService.GetSubDomain()
	if err != nil {
		return nil, err
	}

	if subDomain != "" {
		engine.Use(middleware.DomainValidatorMiddleware(subDomain))
	}

	LinksPath, err := s.settingService.GetSubPath()
	if err != nil {
		return nil, err
	}

	JsonPath, err := s.settingService.GetSubJsonPath()
	if err != nil {
		return nil, err
	}

	// Determine if JSON subscription endpoint is enabled
	subJsonEnable, err := s.settingService.GetSubJsonEnable()
	if err != nil {
		return nil, err
	}

	// Set base_path based on LinksPath for template rendering
	// Ensure LinksPath ends with "/" for proper asset URL generation
	basePath := LinksPath
	if basePath != "/" && !strings.HasSuffix(basePath, "/") {
		basePath += "/"
	}
	// logger.Debug("sub: Setting base_path to:", basePath)
	engine.Use(func(c *gin.Context) {
		c.Set("base_path", basePath)
	})

	RemarkModel, err := s.settingService.GetRemarkModel()
	if err != nil {
		RemarkModel = "-ieo"
	}

	engine.Use(locale.LocalizerMiddleware())

	// register i18n function similar to web server
	i18nWebFunc := func(key string, params ...string) string {
		return locale.I18n(locale.Web, key, params...)
	}
	engine.SetFuncMap(map[string]any{"i18n": i18nWebFunc})

	// Legacy subpage.html and legacy assets were removed:
	// browser requests are redirected to the React public subscription page.

	g := engine.Group("/")

	s.sub = NewSUBController(g, LinksPath, JsonPath, subJsonEnable, RemarkModel)

	return engine, nil
}

// Start initializes and starts the subscription server with configured settings.
func (s *Server) Start() (err error) {
	// This is an anonymous function, no function name
	defer func() {
		if err != nil {
			s.Stop()
		}
	}()

	subEnable, err := s.settingService.GetSubEnable()
	if err != nil {
		return err
	}
	if !subEnable {
		return nil
	}

	engine, err := s.initRouter()
	if err != nil {
		return err
	}

	certFile, err := s.settingService.GetSubCertFile()
	if err != nil {
		return err
	}
	keyFile, err := s.settingService.GetSubKeyFile()
	if err != nil {
		return err
	}
	listen, err := s.settingService.GetSubListen()
	if err != nil {
		return err
	}
	port, err := s.settingService.GetSubPort()
	if err != nil {
		return err
	}

	listenAddr := net.JoinHostPort(listen, strconv.Itoa(port))
	listener, err := net.Listen("tcp", listenAddr)
	if err != nil {
		return err
	}

	if certFile != "" || keyFile != "" {
		cert, err := tls.LoadX509KeyPair(certFile, keyFile)
		if err == nil {
			c := &tls.Config{
				Certificates: []tls.Certificate{cert},
			}
			listener = network.NewAutoHttpsListener(listener)
			listener = tls.NewListener(listener, c)
			logger.Info("Sub server running HTTPS on", listener.Addr())
		} else {
			logger.Error("Error loading certificates:", err)
			logger.Info("Sub server running HTTP on", listener.Addr())
		}
	} else {
		logger.Info("Sub server running HTTP on", listener.Addr())
	}
	s.listener = listener

	s.httpServer = &http.Server{
		Handler: engine,
	}

	go func() {
		s.httpServer.Serve(listener)
	}()

	return nil
}

// Stop gracefully shuts down the subscription server and closes the listener.
func (s *Server) Stop() error {
	s.cancel()

	var err1 error
	var err2 error
	if s.httpServer != nil {
		err1 = s.httpServer.Shutdown(s.ctx)
	}
	if s.listener != nil {
		err2 = s.listener.Close()
	}
	return common.Combine(err1, err2)
}

// GetCtx returns the server's context for cancellation and deadline management.
func (s *Server) GetCtx() context.Context {
	return s.ctx
}
