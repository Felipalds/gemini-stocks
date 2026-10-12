package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Dividend kinds. An empty value is treated as a plain dividend.
const (
	DividendKindDividend = "dividend"
	DividendKindJCP      = "jcp"
	DividendKindProfit   = "profit"
)

// Dividend is a single income event (dividend, JCP, or realized profit) linked
// to a ticker by symbol — the same soft relationship Transaction has with the
// Ticker price cache. Registering one for an unknown symbol is allowed.
type Dividend struct {
	gorm.Model
	ID       string    `gorm:"primaryKey" json:"ID"`
	Symbol   string    `json:"symbol" gorm:"index"`
	Kind     string    `json:"kind" gorm:"default:'dividend'"`
	Amount   float64   `json:"amount"`
	// Tax paid on this income event, in the same Currency as Amount. The net
	// (Amount - Tax) is what gets converted to BRL for reporting.
	Tax      float64   `json:"tax" gorm:"default:0"`
	Currency string    `json:"currency" gorm:"default:USD"`
	// DollarRate is the USD→BRL rate entered manually for this income event, used
	// to convert the amount to BRL. Captured at record time so past totals stay
	// fixed when the live rate moves. Ignored for BRL rows; 0 means "not set"
	// (falls back to the current cached rate).
	DollarRate float64   `json:"dollar_rate"`
	// Source records how the row was created: "manual" (default) or "yahoo" when
	// imported by the dividend sync.
	Source string    `json:"source" gorm:"default:'manual'"`
	Date   time.Time `json:"date" gorm:"index"`
	Note   string    `json:"note"`
}

func (d *Dividend) BeforeCreate(tx *gorm.DB) (err error) {
	if d.ID == "" {
		d.ID = uuid.New().String()
	}
	return
}
