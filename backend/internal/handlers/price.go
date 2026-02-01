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

// RefreshPrices handles POST /prices/refresh
// It iterates over all known stocks and updates their prices from the API
func (h *PriceHandler) RefreshPrices(w http.ResponseWriter, r *http.Request) {
	h.Logger.Info("Starting manual price update...")

	// 1. Get all unique stocks from the StockPrice table
	var stocks []models.StockPrice
	if err := h.DB.Find(&stocks).Error; err != nil {
		h.Logger.Error("Failed to fetch stocks", zap.Error(err))
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// 2. Iterate and Update
	updatedCount := 0
	for _, stock := range stocks {
		// Call your existing finance service
		newPrice, err := h.Finance.GetPriceFromAPI(stock.Symbol)
		if err != nil {
			h.Logger.Warnf("Failed to update %s: %v", stock.Symbol, err)
			continue
		}

		// Update DB
		stock.Price = newPrice
		h.DB.Save(&stock)
		updatedCount++

		// IMPORTANT: Sleep to respect API rate limits (8 requests/minute on free tier)
		time.Sleep(8 * time.Second)
	}

	h.Logger.Infof("Updated %d stocks successfully", updatedCount)
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Prices updated successfully"))
}

// GetAll handles GET /prices
func (h *PriceHandler) GetAll(w http.ResponseWriter, r *http.Request) {
	var prices []models.StockPrice
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

	var stock models.StockPrice
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
