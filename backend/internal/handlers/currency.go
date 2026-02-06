package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"github.com/Felipalds/gemini-stocks/internal/services"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type CurrencyHandler struct {
	DB      *gorm.DB
	Logger  *zap.SugaredLogger
	Finance *services.FinanceService
}

func NewCurrencyHandler(db *gorm.DB, logger *zap.SugaredLogger, finance *services.FinanceService) *CurrencyHandler {
	return &CurrencyHandler{
		DB:      db,
		Logger:  logger,
		Finance: finance,
	}
}

// GetCurrencies handles GET /currencies
func (h *CurrencyHandler) GetCurrencies(w http.ResponseWriter, r *http.Request) {
	var currencies []models.Currency
	if err := h.DB.Find(&currencies).Error; err != nil {
		h.Logger.Error("Failed to fetch currencies", zap.Error(err))
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(currencies)
}

// GetUSDRate handles GET /currencies/usd
func (h *CurrencyHandler) GetUSDRate(w http.ResponseWriter, r *http.Request) {
	var currency models.Currency
	if err := h.DB.First(&currency, "code = ?", "USD").Error; err != nil {
		// If not found, return default rate
		if err == gorm.ErrRecordNotFound {
			currency = models.Currency{
				Code:      "USD",
				Rate:      5.50, // Default fallback
				UpdatedAt: time.Now(),
			}
		} else {
			h.Logger.Error("Failed to fetch USD rate", zap.Error(err))
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(currency)
}

// RefreshUSDRate handles POST /currencies/refresh
func (h *CurrencyHandler) RefreshUSDRate(w http.ResponseWriter, r *http.Request) {
	h.Logger.Info("Fetching USD/BRL exchange rate...")

	rate, err := h.Finance.GetExchangeRate("USD", "BRL")
	if err != nil {
		h.Logger.Error("Failed to fetch USD/BRL rate", zap.Error(err))
		http.Error(w, "Failed to fetch exchange rate: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Upsert the USD currency
	currency := models.Currency{
		Code:      "USD",
		Rate:      rate,
		UpdatedAt: time.Now(),
	}

	if err := h.DB.Save(&currency).Error; err != nil {
		h.Logger.Error("Failed to save USD rate", zap.Error(err))
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	h.Logger.Infof("USD/BRL rate updated: %.4f", rate)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(currency)
}
