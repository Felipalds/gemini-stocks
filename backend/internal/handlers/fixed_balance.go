package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type FixedBalanceHandler struct {
	DB     *gorm.DB
	Logger *zap.SugaredLogger
}

func NewFixedBalanceHandler(db *gorm.DB, logger *zap.SugaredLogger) *FixedBalanceHandler {
	return &FixedBalanceHandler{DB: db, Logger: logger}
}

// MigrateLegacyFixedBalances seeds fixed_balances from fake BUY@1 transactions
// for INTER/NUBANK/PGBL/FGTS/MPAGO, then soft-deletes those transactions and
// removes their ticker rows. Idempotent per name.
func MigrateLegacyFixedBalances(db *gorm.DB, logger *zap.SugaredLogger) {
	for _, symbol := range models.LegacySymbolsMigratedToFixed {
		var existing models.FixedBalance
		err := db.Where("name = ?", symbol).First(&existing).Error
		if err == nil {
			continue
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			logger.Warnf("fixed balance lookup %s: %v", symbol, err)
			continue
		}

		var txs []models.Transaction
		if err := db.Where("symbol = ?", symbol).Find(&txs).Error; err != nil {
			logger.Warnf("load txs for %s: %v", symbol, err)
			continue
		}
		if len(txs) == 0 {
			continue
		}

		var buyQty, sellQty float64
		currency := "BRL"
		category := "FIXA"
		for _, t := range txs {
			if t.Currency != "" {
				currency = t.Currency
			}
			if t.Type == models.Buy {
				buyQty += float64(t.Quantity) * t.Price
			} else {
				sellQty += float64(t.Quantity) * t.Price
			}
		}
		amount := buyQty - sellQty
		if amount < 0 {
			amount = 0
		}

		var ticker models.Ticker
		if err := db.First(&ticker, "symbol = ?", symbol).Error; err == nil && ticker.Category != "" {
			category = ticker.Category
		}

		row := models.FixedBalance{
			Name:     symbol,
			Amount:   amount,
			Currency: currency,
			Category: category,
		}
		if err := db.Create(&row).Error; err != nil {
			logger.Warnf("create fixed balance %s: %v", symbol, err)
			continue
		}
		logger.Infof("Migrated fixed balance %s = %.2f %s", symbol, amount, currency)

		if err := db.Where("symbol = ?", symbol).Delete(&models.Transaction{}).Error; err != nil {
			logger.Warnf("delete txs for %s: %v", symbol, err)
		}
		if err := db.Where("symbol = ?", symbol).Delete(&models.Ticker{}).Error; err != nil {
			logger.Warnf("delete ticker %s: %v", symbol, err)
		}
	}
}

func (h *FixedBalanceHandler) List(w http.ResponseWriter, r *http.Request) {
	var rows []models.FixedBalance
	if err := h.DB.Order("name asc").Find(&rows).Error; err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rows)
}

func (h *FixedBalanceHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body models.FixedBalance
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}
	body.Name = strings.TrimSpace(strings.ToUpper(body.Name))
	if body.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if body.Amount < 0 {
		http.Error(w, "amount must be >= 0", http.StatusBadRequest)
		return
	}
	if body.Currency == "" {
		body.Currency = "BRL"
	}
	if body.Category == "" {
		body.Category = "FIXA"
	}
	if err := h.DB.Create(&body).Error; err != nil {
		http.Error(w, "Could not create fixed balance (name may already exist)", http.StatusConflict)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(body)
}

func (h *FixedBalanceHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var existing models.FixedBalance
	if err := h.DB.First(&existing, "id = ?", id).Error; err != nil {
		http.Error(w, "Fixed balance not found", http.StatusNotFound)
		return
	}
	var body struct {
		Amount *float64 `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}
	if body.Amount == nil {
		http.Error(w, "amount is required", http.StatusBadRequest)
		return
	}
	if *body.Amount < 0 {
		http.Error(w, "amount must be >= 0", http.StatusBadRequest)
		return
	}
	existing.Amount = *body.Amount
	if err := h.DB.Save(&existing).Error; err != nil {
		h.Logger.Error("Failed to update fixed balance", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(existing)
}

func (h *FixedBalanceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result := h.DB.Where("id = ?", id).Delete(&models.FixedBalance{})
	if result.Error != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	if result.RowsAffected == 0 {
		http.Error(w, "Fixed balance not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
