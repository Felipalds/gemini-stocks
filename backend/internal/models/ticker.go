package models

import (
	"time"
)

// Ticker acts as a cache for the latest market price
type Ticker struct {
	Symbol           string    `gorm:"primaryKey" json:"symbol"`
	Price            float64   `json:"price"`
	DayChangePercent float64   `json:"day_change_percent"`
	Tags             string    `json:"tags"`
	Category         string    `json:"category"`
	Currency         string    `json:"currency" gorm:"default:USD"`
	UpdatedAt        time.Time `json:"updated_at"`
}
