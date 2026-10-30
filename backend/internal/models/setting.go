package models

import "time"

// Setting is a singleton (ID = 1) holding app-wide configuration the owner can
// edit from the Settings page. It is deliberately a single row (not one row per
// key) so it can grow typed fields (profile, preferences, …) over time.
type Setting struct {
	ID uint `gorm:"primaryKey" json:"id"`
	// IOF rates as fractions, e.g. 0.0038 = 0.38%. Buy and sell differ and change
	// when the government changes them; editing here only affects FUTURE
	// transactions because the effective rate is snapshotted onto each one.
	IOFBuyRate  float64   `json:"iof_buy_rate" gorm:"default:0"`
	IOFSellRate float64   `json:"iof_sell_rate" gorm:"default:0"`
	UpdatedAt   time.Time `json:"updated_at"`
}
