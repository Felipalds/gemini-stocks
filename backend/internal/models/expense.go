package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Recurring values. Empty string means a one-off expense.
const (
	RecurringNone     = ""
	RecurringMonthly  = "monthly"
	RecurringAnnually = "annually"
)

type Expense struct {
	gorm.Model
	ID        string    `gorm:"primaryKey" json:"ID"`
	Name      string    `json:"name"`
	Category  string    `json:"category" gorm:"index"`
	Value     float64   `json:"value"`
	Currency  string    `json:"currency" gorm:"default:BRL"`
	Date      time.Time `json:"date" gorm:"index"`
	Note      string    `json:"note"`
	Recurring string    `json:"recurring" gorm:"default:''"`
}

func (e *Expense) BeforeCreate(tx *gorm.DB) (err error) {
	if e.ID == "" {
		e.ID = uuid.New().String()
	}
	return
}

// Budget is a monthly spending target. An empty Category means the overall
// monthly budget; a non-empty value scopes the budget to that category.
type Budget struct {
	gorm.Model
	ID        string  `gorm:"primaryKey" json:"ID"`
	Category  string  `json:"category" gorm:"index"`
	AmountBRL float64 `json:"amount_brl"`
}

func (b *Budget) BeforeCreate(tx *gorm.DB) (err error) {
	if b.ID == "" {
		b.ID = uuid.New().String()
	}
	return
}
