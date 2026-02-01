package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type TransactionType string

const (
	Buy  TransactionType = "BUY"
	Sell TransactionType = "SELL"
)

type Transaction struct {
	gorm.Model
	ID       string          `gorm:"primaryKey" json:"ID"`
	Symbol   string          `json:"symbol" gorm:"index"`
	Type     TransactionType `json:"type"`
	Quantity int             `json:"quantity"`
	Price    float64         `json:"price"`
	Date     time.Time       `json:"date"`
	Note     string          `json:"note"` // Added field for custom user notes
}

func (t *Transaction) BeforeCreate(tx *gorm.DB) (err error) {
	// Se não vier ID, gera um novo UUID v4
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return
}
