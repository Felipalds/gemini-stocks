package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
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

// SetUSDRate handles PUT /currencies/usd — manually set the USD/BRL rate from the
// Settings page (as opposed to fetching it live via /currencies/refresh).
func (h *CurrencyHandler) SetUSDRate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Rate float64 `json:"rate"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}
	if body.Rate <= 0 {
		http.Error(w, "Rate must be positive", http.StatusBadRequest)
		return
	}

	currency := models.Currency{Code: "USD", Rate: body.Rate, UpdatedAt: time.Now()}
	if err := h.DB.Save(&currency).Error; err != nil {
		h.Logger.Error("Failed to save manual USD rate", zap.Error(err))
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	h.Logger.Infof("USD/BRL rate manually set to %.4f", body.Rate)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(currency)
}

// GetEffectiveRate handles GET /currencies/rate?from=USD&date=YYYY-MM-DD&type=BUY
// It returns the historical market rate for the date, the applicable IOF, and the
// effective all-in rate (market × (1 + IOF)) used to pre-fill the transaction form.
func (h *CurrencyHandler) GetEffectiveRate(w http.ResponseWriter, r *http.Request) {
	from := normalizeCurrency(r.URL.Query().Get("from"))
	dateStr := r.URL.Query().Get("date")
	txType := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("type")))

	date := time.Now()
	if dateStr != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			date = parsed
		} else if parsed, err := time.Parse(time.RFC3339, dateStr); err == nil {
			date = parsed
		}
	}

	market, err := h.Finance.GetHistoricalRate(from, "BRL", date)
	if err != nil || market <= 0 {
		h.Logger.Warn("Failed to fetch historical rate", zap.Error(err))
		http.Error(w, "Could not fetch historical rate", http.StatusBadGateway)
		return
	}

	s := GetSettings(h.DB)
	iof := s.IOFBuyRate
	if txType == "SELL" {
		iof = s.IOFSellRate
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]float64{
		"market": market,
		"iof":    iof,
		"rate":   market * (1 + iof),
	})
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
