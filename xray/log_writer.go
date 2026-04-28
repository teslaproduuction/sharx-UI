package xray

import (
	"net"
	"regexp"
	"runtime"
	"strings"

	"github.com/konstpic/sharx-code/v2/logger"
)

// NewLogWriter returns a new LogWriter for processing Xray log output.
func NewLogWriter() *LogWriter {
	return &LogWriter{}
}

// LogWriter processes and filters log output from the Xray process, handling crash detection and message filtering.
type LogWriter struct {
	lastLine string
}

var (
	xrayStructuredLineRegex = regexp.MustCompile(`^(\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}\.\d{6}) \[([^\]]+)\] (.+)$`)
	xrayFromRegex           = regexp.MustCompile(`(?i)\sfrom\s+([^\s]+)`)
	xrayEmailRegex          = regexp.MustCompile(`(?i)\bemail:\s*([^\s]+)`)
)

func normalizeXrayInfoMessage(msg string) (string, bool) {
	raw := strings.TrimSpace(msg)
	if raw == "" {
		return raw, false
	}
	fromMatch := xrayFromRegex.FindStringSubmatch(raw)
	emailMatch := xrayEmailRegex.FindStringSubmatch(raw)
	if len(fromMatch) < 2 || len(emailMatch) < 2 {
		return raw, false
	}
	ip := strings.TrimSpace(strings.TrimPrefix(fromMatch[1], "/"))
	if host, _, err := net.SplitHostPort(ip); err == nil {
		ip = host
	}
	ip = strings.Trim(ip, "[]")
	email := strings.TrimSpace(emailMatch[1])
	if ip == "" || email == "" {
		return raw, false
	}
	return "user-connected email=" + email + " ip=" + ip, true
}

// Write processes and filters log output from the Xray process, handling crash detection and message filtering.
func (lw *LogWriter) Write(m []byte) (n int, err error) {
	crashRegex := regexp.MustCompile(`(?i)(panic|exception|stack trace|fatal error)`)

	// Convert the data to a string
	message := strings.TrimSpace(string(m))
	msgLowerAll := strings.ToLower(message)

	// Suppress noisy Windows process-kill signal that surfaces as exit status 1
	if runtime.GOOS == "windows" && strings.Contains(msgLowerAll, "exit status 1") {
		return len(m), nil
	}

	// Check if the message contains a crash
	if crashRegex.MatchString(message) {
		logger.Debug("Core crash detected:\n", message)
		lw.lastLine = message
		err1 := writeCrashReport(m)
		if err1 != nil {
			logger.Error("Unable to write crash report:", err1)
		}
		return len(m), nil
	}

	messages := strings.SplitSeq(message, "\n")

	for msg := range messages {
		matches := xrayStructuredLineRegex.FindStringSubmatch(msg)

		if len(matches) > 3 {
			level := matches[2]
			msgBody := matches[3]
			msgBodyLower := strings.ToLower(msgBody)
			normalizedMsg, hasUserConn := normalizeXrayInfoMessage(msgBody)

			if strings.Contains(msgBodyLower, "tls handshake error") ||
				strings.Contains(msgBodyLower, "connection ends") {
				logger.Emit(logger.Entry{
					Level:     "debug",
					Source:    "xray",
					Msg:       msgBody,
					Channel:   "access",
					Component: "xray",
				})
				lw.lastLine = ""
				continue
			}

			// Determine log level for xray
			var logLevel string
			if hasUserConn {
				logLevel = "info"
				logger.Emit(logger.Entry{
					Level:     logLevel,
					Source:    "xray",
					Msg:       normalizedMsg,
					Channel:   "access",
					Component: "xray",
				})
				logger.PushLogToLokiWithComponent(logLevel, normalizedMsg, "xray", "")
				lw.lastLine = ""
				continue
			}
			if strings.Contains(msgBodyLower, "failed") {
				logLevel = "error"
				logger.Emit(logger.Entry{
					Level:     logLevel,
					Source:    "xray",
					Msg:       msgBody,
					Channel:   "access",
					Component: "xray",
				})
			} else {
				switch level {
				case "Debug":
					logLevel = "debug"
					logger.Emit(logger.Entry{
						Level:     logLevel,
						Source:    "xray",
						Msg:       msgBody,
						Channel:   "access",
						Component: "xray",
					})
				case "Info":
					logLevel = "info"
					logger.Emit(logger.Entry{
						Level:     logLevel,
						Source:    "xray",
						Msg:       msgBody,
						Channel:   "access",
						Component: "xray",
					})
				case "Warning":
					logLevel = "warn"
					logger.Emit(logger.Entry{
						Level:     logLevel,
						Source:    "xray",
						Msg:       msgBody,
						Channel:   "access",
						Component: "xray",
					})
				case "Error":
					logLevel = "error"
					logger.Emit(logger.Entry{
						Level:     logLevel,
						Source:    "xray",
						Msg:       msgBody,
						Channel:   "access",
						Component: "xray",
					})
				default:
					logLevel = "debug"
					logger.Emit(logger.Entry{
						Level:     logLevel,
						Source:    "xray",
						Msg:       msg,
						Channel:   "access",
						Component: "xray",
					})
				}
			}
			// Also send directly to Loki with xray component
			logger.PushLogToLokiWithComponent(logLevel, msgBody, "xray", "")
			lw.lastLine = ""
		} else if msg != "" {
			msgLower := strings.ToLower(msg)
			normalizedMsg, hasUserConn := normalizeXrayInfoMessage(msg)

			if strings.Contains(msgLower, "tls handshake error") ||
				strings.Contains(msgLower, "connection ends") {
				logger.Emit(logger.Entry{
					Level:     "debug",
					Source:    "xray",
					Msg:       msg,
					Channel:   "access",
					Component: "xray",
				})
				lw.lastLine = msg
				continue
			}

			var logLevel string
			if hasUserConn {
				logLevel = "info"
				logger.Emit(logger.Entry{
					Level:     logLevel,
					Source:    "xray",
					Msg:       normalizedMsg,
					Channel:   "access",
					Component: "xray",
				})
				logger.PushLogToLokiWithComponent(logLevel, normalizedMsg, "xray", "")
				lw.lastLine = msg
				continue
			}
			if strings.Contains(msgLower, "failed") {
				logLevel = "error"
				logger.Emit(logger.Entry{
					Level:     logLevel,
					Source:    "xray",
					Msg:       msg,
					Channel:   "access",
					Component: "xray",
				})
			} else {
				logLevel = "debug"
				logger.Emit(logger.Entry{
					Level:     logLevel,
					Source:    "xray",
					Msg:       msg,
					Channel:   "access",
					Component: "xray",
				})
			}
			// Also send directly to Loki with xray component
			logger.PushLogToLokiWithComponent(logLevel, msg, "xray", "")
			lw.lastLine = msg
		}
	}

	return len(m), nil
}
