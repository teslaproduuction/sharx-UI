package service

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/konstpic/sharx-code/v2/config"
	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/util/common"
)

const (
	defaultGeoipURL   = "https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat"
	defaultGeositeURL = "https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat"
)

func geofileTypeFromName(fileName string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(fileName)) {
	case "geoip.dat":
		return "geoip", nil
	case "geosite.dat":
		return "geosite", nil
	default:
		return "", common.NewErrorf("unsupported geofile name: %s", fileName)
	}
}

func geofileNameFromType(fileType string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(fileType)) {
	case "geoip":
		return "geoip.dat", nil
	case "geosite":
		return "geosite.dat", nil
	default:
		return "", common.NewErrorf("unsupported geofile type: %s", fileType)
	}
}

func GeofileNameFromType(fileType string) (string, error) {
	return geofileNameFromType(fileType)
}

func geofileAssetsDir(fileType string) string {
	return filepath.Join(config.GetDataFolderPath(), "geofile-assets", fileType)
}

func (s *ServerService) geofileAssetData(fileName string, data io.Reader) ([]byte, string, error) {
	if !s.IsValidGeofileName(fileName) || !isUserGeofileAllowed(fileName) {
		return nil, "", common.NewErrorf("invalid geofile name: %s", fileName)
	}
	fileType, err := geofileTypeFromName(fileName)
	if err != nil {
		return nil, "", err
	}
	limited := io.LimitReader(data, maxGeoFileUploadSize+1)
	content, err := io.ReadAll(limited)
	if err != nil {
		return nil, "", common.NewErrorf("read geofile upload: %v", err)
	}
	if len(content) == 0 {
		return nil, "", common.NewError("empty geofile upload")
	}
	if len(content) > maxGeoFileUploadSize {
		return nil, "", common.NewErrorf("geofile too large: max %d bytes", maxGeoFileUploadSize)
	}
	return content, fileType, nil
}

func (s *ServerService) saveGeofileAssetFile(fileType string, content []byte) (string, error) {
	targetDir := geofileAssetsDir(fileType)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return "", common.NewErrorf("create geofile asset folder: %v", err)
	}
	fileName := fmt.Sprintf("%d-%s.dat", time.Now().UnixNano(), fileType)
	destPath := filepath.Join(targetDir, fileName)
	tmpPath := destPath + ".tmp"
	if err := os.WriteFile(tmpPath, content, 0644); err != nil {
		return "", common.NewErrorf("write geofile asset temp file: %v", err)
	}
	if err := os.Rename(tmpPath, destPath); err != nil {
		_ = os.Remove(tmpPath)
		return "", common.NewErrorf("store geofile asset: %v", err)
	}
	return destPath, nil
}

func geofileDisplayName(input string, fallback string) string {
	name := strings.TrimSpace(input)
	if name == "" {
		return fallback
	}
	return name
}

func defaultSourceURLByType(fileType string) string {
	switch strings.ToLower(strings.TrimSpace(fileType)) {
	case "geoip":
		return defaultGeoipURL
	case "geosite":
		return defaultGeositeURL
	default:
		return ""
	}
}

func geofileDefaultSourcePath(fileName string) string {
	dataPath := filepath.Join(config.GetDataFolderPath(), filepath.Base(fileName))
	if st, err := os.Stat(dataPath); err == nil && !st.IsDir() {
		return dataPath
	}
	binPath := filepath.Join(config.GetBinFolderPath(), filepath.Base(fileName))
	if st, err := os.Stat(binPath); err == nil && !st.IsDir() {
		return binPath
	}
	return ""
}

func (s *ServerService) ensureDefaultGeofileAsset(userId int, fileType string) error {
	db := database.GetDB()
	var count int64
	if err := db.Model(&model.GeofileAsset{}).
		Where("user_id = ? AND file_type = ?", userId, fileType).
		Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	fileName, err := geofileNameFromType(fileType)
	if err != nil {
		return err
	}
	srcPath := geofileDefaultSourcePath(fileName)
	if srcPath == "" {
		return nil
	}
	content, err := os.ReadFile(srcPath)
	if err != nil || len(content) == 0 {
		return err
	}
	storedPath, err := s.saveGeofileAssetFile(fileType, content)
	if err != nil {
		return err
	}
	sum := sha256.Sum256(content)
	row := &model.GeofileAsset{
		UserId:      userId,
		FileType:    fileType,
		DisplayName: "default-" + fileName,
		SourceURL:   defaultSourceURLByType(fileType),
		FilePath:    storedPath,
		SizeBytes:   int64(len(content)),
		Sha256:      hex.EncodeToString(sum[:]),
		IsActive:    true,
		CreatedAt:   time.Now().Unix(),
	}
	if err := db.Create(row).Error; err != nil {
		_ = os.Remove(storedPath)
		return err
	}
	return nil
}

func (s *ServerService) ListGeofileAssets(userId int, fileName string) ([]*model.GeofileAsset, error) {
	fileType, err := geofileTypeFromName(fileName)
	if err != nil {
		return nil, err
	}
	if err := s.ensureDefaultGeofileAsset(userId, fileType); err != nil {
		return nil, err
	}
	db := database.GetDB()
	var rows []*model.GeofileAsset
	if err := db.Where("user_id = ? AND file_type = ?", userId, fileType).Order("created_at DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	if rows == nil {
		return []*model.GeofileAsset{}, nil
	}
	return rows, nil
}

func (s *ServerService) UploadGeofileAsset(userId int, fileName string, data io.Reader, displayName string, sourceURL string) (*model.GeofileAsset, error) {
	content, fileType, err := s.geofileAssetData(fileName, data)
	if err != nil {
		return nil, err
	}
	path, err := s.saveGeofileAssetFile(fileType, content)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(content)
	row := &model.GeofileAsset{
		UserId:      userId,
		FileType:    fileType,
		DisplayName: geofileDisplayName(displayName, filepath.Base(path)),
		SourceURL:   strings.TrimSpace(sourceURL),
		FilePath:    path,
		SizeBytes:   int64(len(content)),
		Sha256:      hex.EncodeToString(sum[:]),
		IsActive:    false,
		CreatedAt:   time.Now().Unix(),
	}
	db := database.GetDB()
	if err := db.Create(row).Error; err != nil {
		_ = os.Remove(path)
		return nil, err
	}
	return row, nil
}

func (s *ServerService) DownloadGeofileAssetFromURL(userId int, fileName string, rawURL string, displayName string) (*model.GeofileAsset, error) {
	parsedURL, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsedURL == nil || parsedURL.Host == "" {
		return nil, common.NewError("invalid source URL")
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return nil, common.NewError("source URL must use http or https")
	}
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(parsedURL.String())
	if err != nil {
		return nil, common.NewErrorf("download failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, common.NewErrorf("download failed with status %d", resp.StatusCode)
	}
	var out bytes.Buffer
	limited := io.LimitReader(resp.Body, maxGeoFileUploadSize+1)
	if _, err := io.Copy(&out, limited); err != nil {
		return nil, common.NewErrorf("download stream failed: %v", err)
	}
	if out.Len() > maxGeoFileUploadSize {
		return nil, common.NewErrorf("geofile too large: max %d bytes", maxGeoFileUploadSize)
	}
	return s.UploadGeofileAsset(userId, fileName, bytes.NewReader(out.Bytes()), displayName, parsedURL.String())
}

func (s *ServerService) ApplyGeofileAsset(userId int, id int) (*GeofileApplyResult, *model.GeofileAsset, error) {
	db := database.GetDB()
	var row model.GeofileAsset
	if err := db.Where("id = ? AND user_id = ?", id, userId).First(&row).Error; err != nil {
		return nil, nil, err
	}
	content, err := os.ReadFile(row.FilePath)
	if err != nil {
		return nil, &row, common.NewErrorf("read stored geofile: %v", err)
	}
	fileName, err := geofileNameFromType(row.FileType)
	if err != nil {
		return nil, &row, err
	}
	res, applyErr := s.UploadGeofile(fileName, bytes.NewReader(content))
	if applyErr != nil {
		return res, &row, applyErr
	}
	if err := db.Model(&model.GeofileAsset{}).
		Where("user_id = ? AND file_type = ?", userId, row.FileType).
		Update("is_active", false).Error; err != nil {
		return res, &row, err
	}
	if err := db.Model(&model.GeofileAsset{}).
		Where("id = ?", row.Id).
		Update("is_active", true).Error; err != nil {
		return res, &row, err
	}
	row.IsActive = true
	return res, &row, nil
}

func (s *ServerService) DeleteGeofileAsset(userId int, id int) error {
	db := database.GetDB()
	var row model.GeofileAsset
	if err := db.Where("id = ? AND user_id = ?", id, userId).First(&row).Error; err != nil {
		return err
	}
	if err := db.Delete(&row).Error; err != nil {
		return err
	}
	_ = os.Remove(row.FilePath)
	return nil
}
