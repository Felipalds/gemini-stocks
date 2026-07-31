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

type PriceHandler struct {
	DB      *gorm.DB
	Logger  *zap.SugaredLogger
	Finance *services.FinanceService
}

func NewPriceHandler(db *gorm.DB, logger *zap.SugaredLogger, finance *services.FinanceService) *PriceHandler {
	return &PriceHandler{
		DB:      db,
		Logger:  logger,
		Finance: finance,
	}
}

// updatedToday reports whether t falls on the current local calendar day.
// Used to avoid spending Alpha Vantage credits on a second fetch the same day.
func updatedToday(t time.Time) bool {
	if t.IsZero() {
		return false
	}
	now := time.Now()
	y1, m1, d1 := t.In(now.Location()).Date()
	y2, m2, d2 := now.Date()
	return y1 == y2 && m1 == m2 && d1 == d2
}

// RefreshPrices handles POST /prices/refresh
// It iterates over all known stocks and updates their prices from the API
// Also updates the USD/BRL exchange rate.
// Tickers and FX rates already updated today (UpdatedAt) are skipped — at most one Alpha fetch per symbol/day.
func (h *PriceHandler) RefreshPrices(w http.ResponseWriter, r *http.Request) {
	h.Logger.Info("Starting manual price update...")

	fxUpdated := 0
	fxSkipped := 0

	// 1. First, refresh fiat / crypto rates against BRL (once per day each)
	for _, code := range []string{"USD", "BTC"} {
		var existing models.Currency
		if err := h.DB.First(&existing, "code = ?", code).Error; err == nil && updatedToday(existing.UpdatedAt) {
			h.Logger.Infof("Skipping %s/BRL — already updated today (%s)", code, existing.UpdatedAt.Format(time.RFC3339))
			fxSkipped++
			continue
		}

		h.Logger.Infof("Fetching %s/BRL exchange rate...", code)
		rate, err := h.Finance.GetExchangeRate(code, "BRL")
		if err != nil {
			h.Logger.Warnf("Failed to fetch %s/BRL rate: %v", code, err)
			continue
		}
		currency := models.Currency{
			Code:      code,
			Rate:      rate,
			UpdatedAt: time.Now(),
		}
		if err := h.DB.Save(&currency).Error; err != nil {
			h.Logger.Warnf("Failed to save %s rate: %v", code, err)
		} else {
			h.Logger.Infof("%s/BRL rate updated: %.4f", code, rate)
			fxUpdated++
		}
	}

	// 2. Get all unique stocks from the StockPrice table
	var stocks []models.Ticker
	if err := h.DB.Find(&stocks).Error; err != nil {
		h.Logger.Error("Failed to fetch stocks", zap.Error(err))
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// 3. Iterate and Update (skip symbols already refreshed today)
	updatedCount := 0
	skippedCount := 0
	failedCount := 0
	for _, stock := range stocks {
		if models.IsLegacyFixedSymbol(stock.Symbol) {
			continue
		}
		if updatedToday(stock.UpdatedAt) {
			h.Logger.Infof("Skipping %s — already updated today (%s)", stock.Symbol, stock.UpdatedAt.Format(time.RFC3339))
			skippedCount++
			continue
		}

		newTicker, err := h.Finance.UpdateTickerFromAPI(stock.Symbol, stock.Currency)
		if err != nil {
			h.Logger.Warnf("Failed to update %s: %v", stock.Symbol, err)
			failedCount++
			continue
		}

		stock.Price = newTicker.Price
		stock.DayChangePercent = newTicker.DayChangePercent
		stock.UpdatedAt = time.Now()
		if err := h.DB.Save(&stock).Error; err != nil {
			h.Logger.Warnf("Failed to save %s: %v", stock.Symbol, err)
			failedCount++
			continue
		}
		updatedCount++
	}

	h.Logger.Infof("Price refresh done: updated=%d skipped=%d failed=%d fx_updated=%d fx_skipped=%d",
		updatedCount, skippedCount, failedCount, fxUpdated, fxSkipped)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"updated":    updatedCount,
		"skipped":    skippedCount,
		"failed":     failedCount,
		"fx_updated": fxUpdated,
		"fx_skipped": fxSkipped,
		"message":    "Prices refreshed (same-day Alpha cache: at most one fetch per symbol per day)",
	})
}

// RefreshOne handles POST /prices/refresh-one?symbol=BTC/USD
// Forces an Alpha fetch for a single ticker and bypasses the same-day cache.
// Symbol is a query param (not a path segment) so pairs like BTC/USD decode correctly
// — Chi leaves %2F undecoded in path params, which broke DB lookup as "BTC%2FUSD".
func (h *PriceHandler) RefreshOne(w http.ResponseWriter, r *http.Request) {
	symbol := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("symbol")))
	if symbol == "" {
		http.Error(w, "Symbol is required (query param: symbol)", http.StatusBadRequest)
		return
	}
	if models.IsLegacyFixedSymbol(symbol) {
		http.Error(w, "Fixed balances are not priced via Alpha Vantage", http.StatusBadRequest)
		return
	}

	var stock models.Ticker
	if err := h.DB.First(&stock, "symbol = ?", symbol).Error; err != nil {
		http.Error(w, "Stock not found", http.StatusNotFound)
		return
	}

	h.Logger.Infof("Force-refreshing %s (bypassing same-day cache)...", symbol)
	newTicker, err := h.Finance.UpdateTickerFromAPI(stock.Symbol, stock.Currency)
	if err != nil {
		h.Logger.Warnf("Failed to force-refresh %s: %v", symbol, err)
		http.Error(w, "Failed to fetch price from Alpha Vantage", http.StatusBadGateway)
		return
	}

	stock.Price = newTicker.Price
	stock.DayChangePercent = newTicker.DayChangePercent
	stock.UpdatedAt = time.Now()
	if err := h.DB.Save(&stock).Error; err != nil {
		h.Logger.Error("Failed to save forced price refresh", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stock)
}

// GetAll handles GET /prices
func (h *PriceHandler) GetAll(w http.ResponseWriter, r *http.Request) {
	var prices []models.Ticker
	if err := h.DB.Find(&prices).Error; err != nil {
		h.Logger.Error("Failed to fetch stock prices", zap.Error(err))
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(prices)
}

// UpdatePrice handles PUT /prices
func (h *PriceHandler) UpdatePrice(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Symbol   string   `json:"symbol"`
		Price    *float64 `json:"price"`
		Tags     *string  `json:"tags"`
		Category *string  `json:"category"`
		Currency *string  `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	if body.Symbol == "" {
		http.Error(w, "Symbol is required", http.StatusBadRequest)
		return
	}

	var stock models.Ticker
	if err := h.DB.First(&stock, "symbol = ?", body.Symbol).Error; err != nil {
		http.Error(w, "Stock not found", http.StatusNotFound)
		return
	}

	if body.Tags != nil {
		tags := strings.TrimSpace(*body.Tags)
		if tags != "" {
			parts := strings.Split(tags, ",")
			if len(parts) > 5 {
				http.Error(w, "Maximum of 5 tags allowed", http.StatusBadRequest)
				return
			}
		}
		stock.Tags = tags
	}

	if body.Price != nil {
		stock.Price = *body.Price
	}

	if body.Category != nil {
		stock.Category = strings.TrimSpace(*body.Category)
	}

	if body.Currency != nil {
		stock.Currency = strings.TrimSpace(*body.Currency)
	}

	if err := h.DB.Save(&stock).Error; err != nil {
		h.Logger.Error("Failed to update stock price", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	h.Logger.Infof("Stock %s updated: price=%.2f, tags=%s", stock.Symbol, stock.Price, stock.Tags)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stock)
}
