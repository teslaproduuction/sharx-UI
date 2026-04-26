package service

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/web/session"
	"gorm.io/gorm"
)

const (
	apiTokenJWTIssuer   = "sharx-panel"
	apiTokenJWTAudience = "sharx-panel-api"
	apiTokenHMACLabel   = "sharx|api_token|hmac|v1"
)

// APITokenService issues and validates long-lived API JWTs for the panel API.
type APITokenService struct {
	settingService SettingService
}

func (s *APITokenService) signingKeyBytes(secret []byte) []byte {
	h := hmac.New(sha256.New, secret)
	h.Write([]byte(apiTokenHMACLabel))
	return h.Sum(nil)
}

func audienceOK(v any) bool {
	switch x := v.(type) {
	case string:
		return x == apiTokenJWTAudience
	case []any:
		for _, e := range x {
			if s, ok := e.(string); ok && s == apiTokenJWTAudience {
				return true
			}
		}
	}
	return false
}

// TryAttachUserFromBearer validates Authorization: Bearer <JWT> and sets the request user (no cookie session).
// If a session cookie is already present, the session takes precedence and the header is not used.
func (s *APITokenService) TryAttachUserFromBearer(c *gin.Context) {
	if session.GetLoginUser(c) != nil {
		return
	}
	authz := strings.TrimSpace(c.GetHeader("Authorization"))
	if len(authz) < 8 || !strings.EqualFold(authz[:7], "Bearer ") {
		return
	}
	raw := strings.TrimSpace(authz[7:])
	if raw == "" {
		return
	}
	secret, err := s.settingService.GetSecret()
	if err != nil {
		return
	}
	key := s.signingKeyBytes(secret)
	keyFunc := func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return key, nil
	}
	tok, err := jwt.Parse(raw, keyFunc)
	if err != nil || !tok.Valid {
		return
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return
	}
	if iss, _ := claims["iss"].(string); iss != apiTokenJWTIssuer {
		return
	}
	if !audienceOK(claims["aud"]) {
		return
	}
	jti, _ := claims["jti"].(string)
	if jti == "" {
		return
	}
	sub, _ := claims["sub"].(string)
	uid, err := strconv.Atoi(sub)
	if err != nil || uid < 1 {
		return
	}

	var row model.APIToken
	err = database.GetDB().Where("jti = ? AND user_id = ? AND revoked_at IS NULL", jti, uid).First(&row).Error
	if err != nil {
		return
	}

	now := time.Now().Unix()
	_ = database.GetDB().Model(&model.APIToken{}).Where("id = ?", row.Id).Update("last_used_at", now).Error

	var user model.User
	if err := database.GetDB().Where("id = ?", uid).First(&user).Error; err != nil {
		return
	}
	user.Password = ""
	session.SetRequestLoginUser(c, &user)
}

func randomJTI() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// CreateAPIToken inserts a new token record and returns the full JWT (shown only once) plus the row.
func (s *APITokenService) CreateAPIToken(userID int, name string) (string, *model.APIToken, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "API token"
	}
	secret, err := s.settingService.GetSecret()
	if err != nil {
		return "", nil, err
	}
	jti, err := randomJTI()
	if err != nil {
		return "", nil, err
	}
	now := time.Now().Unix()
	row := &model.APIToken{
		UserId:    userID,
		Jti:       jti,
		Name:      name,
		CreatedAt: now,
	}
	if err := database.GetDB().Create(row).Error; err != nil {
		return "", nil, err
	}
	key := s.signingKeyBytes(secret)
	mc := jwt.MapClaims{
		"iss": apiTokenJWTIssuer,
		"aud": apiTokenJWTAudience,
		"sub": strconv.Itoa(userID),
		"jti": jti,
		"iat": now,
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, mc).SignedString(key)
	if err != nil {
		return "", nil, err
	}
	return signed, row, nil
}

// ListAPITokens returns non-revoked tokens for the user (no JWT value).
func (s *APITokenService) ListAPITokens(userID int) ([]model.APIToken, error) {
	var list []model.APIToken
	err := database.GetDB().Where("user_id = ? AND revoked_at IS NULL", userID).
		Order("id desc").
		Find(&list).Error
	return list, err
}

// RevokeAPITokenByID revokes a token by primary key for the given user.
func (s *APITokenService) RevokeAPITokenByID(userID, id int) error {
	now := time.Now().Unix()
	r := database.GetDB().Model(&model.APIToken{}).
		Where("user_id = ? AND id = ? AND revoked_at IS NULL", userID, id).
		Update("revoked_at", now)
	if r.Error != nil {
		return r.Error
	}
	if r.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
