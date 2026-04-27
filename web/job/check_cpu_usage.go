package job

import (
	"strconv"
	"sync"
	"time"

	"github.com/konstpic/sharx-code/v2/web/service"

	"github.com/shirou/gopsutil/v4/cpu"
)

// Sampling window for CPU% (gopsutil blocks for this duration per check).
const cpuCheckSampleDuration = 5 * time.Second

// Minimum time between Telegram CPU alerts while load stays above threshold (avoid spam).
const cpuAlertCooldown = 5 * time.Minute

var (
	cpuAlertMu       sync.Mutex
	lastCPUAlertTime time.Time
)

// CheckCpuJob monitors CPU usage and sends Telegram notifications when usage exceeds the configured threshold.
type CheckCpuJob struct {
	tgbotService   service.Tgbot
	settingService service.SettingService
}

// NewCheckCpuJob creates a new CPU monitoring job instance.
func NewCheckCpuJob() *CheckCpuJob {
	return new(CheckCpuJob)
}

// Run samples CPU usage and sends a Telegram alert if it reaches or exceeds the threshold.
func (j *CheckCpuJob) Run() {
	threshold, err := j.settingService.GetTgCpu()
	if err != nil || threshold <= 0 {
		// If threshold cannot be retrieved or is not set, skip sending notifications
		return
	}

	pct, err := cpu.Percent(cpuCheckSampleDuration, false)
	if err != nil || len(pct) == 0 {
		return
	}
	if pct[0] < float64(threshold) {
		return
	}

	cpuAlertMu.Lock()
	if !lastCPUAlertTime.IsZero() && time.Since(lastCPUAlertTime) < cpuAlertCooldown {
		cpuAlertMu.Unlock()
		return
	}
	lastCPUAlertTime = time.Now()
	cpuAlertMu.Unlock()

	msg := j.tgbotService.I18nBot("tgbot.messages.cpuThreshold",
		"Percent=="+strconv.FormatFloat(pct[0], 'f', 2, 64),
		"Threshold=="+strconv.Itoa(threshold))
	if msg == "" {
		return
	}
	j.tgbotService.SendMsgToTgbotAdmins(msg)
}
