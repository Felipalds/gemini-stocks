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
	h.respondWithRate(w, "USD", 5.50)
}

// GetBTCRate handles GET /currencies/btc
func (h *CurrencyHandler) GetBTCRate(w http.ResponseWriter, r *http.Request) {
	h.respondWithRate(w, "BTC", 0)
}

func (h *CurrencyHandler) respondWithRate(w http.ResponseWriter, code string, fallback float64) {
	var currency models.Currency
	if err := h.DB.First(&currency, "code = ?", code).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			currency = models.Currency{
				Code:      code,
				Rate:      fallback,
				UpdatedAt: time.Now(),
			}
		} else {
			h.Logger.Error("Failed to fetch rate", zap.String("code", code), zap.Error(err))
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(currency)
}

// RefreshUSDRate handles POST /currencies/refresh
func (h *CurrencyHandler) RefreshUSDRate(w http.ResponseWriter, r *http.Request) {
	h.refreshAndRespond(w, "USD")
}

// RefreshBTCRate handles POST /currencies/btc/refresh
func (h *CurrencyHandler) RefreshBTCRate(w http.ResponseWriter, r *http.Request) {
	h.refreshAndRespond(w, "BTC")
}

func (h *CurrencyHandler) refreshAndRespond(w http.ResponseWriter, code string) {
	h.Logger.Infof("Fetching %s/BRL exchange rate...", code)

	rate, err := h.Finance.GetExchangeRate(code, "BRL")
	if err != nil {
		h.Logger.Error("Failed to fetch rate", zap.String("code", code), zap.Error(err))
		http.Error(w, "Failed to fetch exchange rate: "+err.Error(), http.StatusInternalServerError)
		return
	}

	currency := models.Currency{
		Code:      code,
		Rate:      rate,
		UpdatedAt: time.Now(),
	}

	if err := h.DB.Save(&currency).Error; err != nil {
		h.Logger.Error("Failed to save rate", zap.String("code", code), zap.Error(err))
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	h.Logger.Infof("%s/BRL rate updated: %.4f", code, rate)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(currency)
}
