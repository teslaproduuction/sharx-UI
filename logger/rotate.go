package logger

import (
	"io"
	"sync"

	"gopkg.in/natefinch/lumberjack.v2"
)

// RotateConfig controls on-disk log retention (panel and node workers).
type RotateConfig struct {
	MaxSizeMB  int  // Megabytes before rotation (default 50)
	MaxAgeDays int  // Days to retain old files (default 14)
	MaxBackups int  // Number of rotated files to keep (default 5)
	Compress   bool // Gzip rotated files (default true)
}

var (
	rotateMu     sync.RWMutex
	rotateConfig = RotateConfig{
		MaxSizeMB:  50,
		MaxAgeDays: 14,
		MaxBackups: 5,
		Compress:   true,
	}
	fileRotator *lumberjack.Logger
)

func normalizeRotateConfig(c RotateConfig) RotateConfig {
	if c.MaxSizeMB <= 0 {
		c.MaxSizeMB = 50
	}
	if c.MaxAgeDays <= 0 {
		c.MaxAgeDays = 14
	}
	if c.MaxBackups <= 0 {
		c.MaxBackups = 5
	}
	return c
}

// ConfigureRotate updates log rotation settings and reopens the file backend if active.
func ConfigureRotate(c RotateConfig) {
	c = normalizeRotateConfig(c)
	rotateMu.Lock()
	rotateConfig = c
	if fileRotator != nil {
		fileRotator.MaxSize = c.MaxSizeMB
		fileRotator.MaxAge = c.MaxAgeDays
		fileRotator.MaxBackups = c.MaxBackups
		fileRotator.Compress = c.Compress
	}
	rotateMu.Unlock()
}

func getRotateConfig() RotateConfig {
	rotateMu.RLock()
	defer rotateMu.RUnlock()
	return rotateConfig
}

func newFileRotator(logPath string) *lumberjack.Logger {
	c := getRotateConfig()
	return &lumberjack.Logger{
		Filename:   logPath,
		MaxSize:    c.MaxSizeMB,
		MaxAge:     c.MaxAgeDays,
		MaxBackups: c.MaxBackups,
		Compress:   c.Compress,
	}
}

// fileWriter returns the active rotating file writer (for tests / advanced use).
func fileWriter() io.Writer {
	rotateMu.RLock()
	defer rotateMu.RUnlock()
	if fileRotator != nil {
		return fileRotator
	}
	return nil
}
