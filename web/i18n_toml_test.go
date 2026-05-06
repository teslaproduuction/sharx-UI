package web

import (
	"testing"

	"github.com/konstpic/sharx-code/v2/web/locale"
)

type mockI18nSettings struct{}

func (mockI18nSettings) GetTgLang() (string, error)             { return "en", nil }
func (mockI18nSettings) GetUIPreference(string) (string, error) { return "en", nil }

// TestI18nTranslationTOML ensures embedded TOML is valid for go-i18n (e.g. reserved
// keys like "description" must not be mixed with message keys in the same table).
func TestI18nTranslationTOML(t *testing.T) {
	if err := locale.InitLocalizer(i18nFS, mockI18nSettings{}); err != nil {
		t.Fatal(err)
	}
}
