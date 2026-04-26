package service

import (
	"encoding/json"
	"time"

	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/util/geoip"
)

const panelGeographyKey = "panelGeography"

// PanelGeographyRecord is stored as JSON in settings (key panelGeography).
type PanelGeographyRecord struct {
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	IP        string  `json:"ip"`
	Source    string  `json:"source"`
	UpdatedAt int64   `json:"updatedAt"`
}

// GetPanelGeography loads cached panel coordinates from settings (nil if never set).
func (s *SettingService) GetPanelGeography() (*PanelGeographyRecord, error) {
	setting, err := s.getSetting(panelGeographyKey)
	if database.IsNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var rec PanelGeographyRecord
	if err := json.Unmarshal([]byte(setting.Value), &rec); err != nil {
		return nil, err
	}
	return &rec, nil
}

// SavePanelGeography persists a successful IP geolocation lookup for the panel host.
func (s *SettingService) SavePanelGeography(l geoip.Lookup) error {
	rec := PanelGeographyRecord{
		Lat:       l.Lat,
		Lng:       l.Lon,
		IP:        l.IP,
		Source:    l.Source,
		UpdatedAt: time.Now().Unix(),
	}
	b, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	return s.saveSetting(panelGeographyKey, string(b))
}

// StartPanelGeographyRefresh runs egress IP geolocation in the background (non-blocking startup).
func StartPanelGeographyRefresh() {
	go func() {
		c := geoip.Client{}
		l, err := c.LookupSelf()
		if err != nil {
			logger.Warningf("panel geography lookup skipped: %v", err)
			return
		}
		ss := SettingService{}
		if err := ss.SavePanelGeography(l); err != nil {
			logger.Warningf("panel geography save failed: %v", err)
			return
		}
		logger.Infof("panel geography: %s → %.4f, %.4f (%s)", l.IP, l.Lat, l.Lon, l.Source)
	}()
}
