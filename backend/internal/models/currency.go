package models

import (
	"time"
)

// Currency stores exchange rates (e.g., USD to BRL)
type Currency struct {
	Code      string    `gorm:"primaryKey" json:"code"` // e.g., "USD"
	Rate      float64   `json:"rate"`                   // Rate to BRL (e.g., 5.50 means 1 USD = 5.50 BRL)
	UpdatedAt time.Time `json:"updated_at"`
}
