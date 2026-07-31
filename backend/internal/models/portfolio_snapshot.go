package models

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// PortfolioSnapshot is a point-in-time capture of portfolio totals (manual "Take snapshot").
type PortfolioSnapshot struct {
	gorm.Model
	ID             string  `gorm:"primaryKey" json:"ID"`
	TotalValueBRL  float64 `json:"total_value_brl"`
	TotalValueUSD  float64 `json:"total_value_usd"`
	TotalPnlBRL    float64 `json:"total_pnl_brl"`
	DollarRate     float64 `json:"dollar_rate"`
	HoldingsJSON   string  `json:"holdings_json" gorm:"type:text"`
	Note           string  `json:"note"`
}

func (s *PortfolioSnapshot) BeforeCreate(tx *gorm.DB) (err error) {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}
	return
}
