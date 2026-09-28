package models

import (
	"strings"
	"unicode"
)

// NormalizeMerchantKey builds a stable lookup key for statement merchant names.
func NormalizeMerchantKey(name string) string {
	fields := strings.FieldsFunc(strings.ToLower(strings.TrimSpace(name)), func(r rune) bool {
		return unicode.IsSpace(r)
	})
	return strings.Join(fields, " ")
}
