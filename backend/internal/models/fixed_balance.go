package models

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// LegacySymbolsMigratedToFixed are symbols that used to be fake BUY@1
// transactions and are now FixedBalance rows.
var LegacySymbolsMigratedToFixed = []string{
	"INTER", "NUBANK", "PGBL", "FGTS", "MPAGO",
}

// IsLegacyFixedSymbol reports whether symbol is a migrated fixed balance name.
func IsLegacyFixedSymbol(symbol string) bool {
	for _, s := range LegacySymbolsMigratedToFixed {
		if s == symbol {
			return true
		}
	}
	return false
}

// FixedBalance is a static holding (renda fixa / cash-like) edited by amount only.
type FixedBalance struct {
	gorm.Model
	ID       string  `gorm:"primaryKey" json:"ID"`
	Name     string  `json:"name" gorm:"uniqueIndex;size:64"`
	Amount   float64 `json:"amount"`
	Currency string  `json:"currency" gorm:"default:BRL"`
	Category string  `json:"category" gorm:"default:FIXA"`
	Note     string  `json:"note"`
}

func (f *FixedBalance) BeforeCreate(tx *gorm.DB) (err error) {
	if f.ID == "" {
		f.ID = uuid.New().String()
	}
	return
}
