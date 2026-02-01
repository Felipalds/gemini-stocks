package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"github.com/Felipalds/gemini-stocks/internal/services"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// TransactionHandler holds dependencies for transaction logic
type TransactionHandler struct {
	DB      *gorm.DB
	Logger  *zap.SugaredLogger
	Finance *services.FinanceService
}

type TransactionResponse struct {
	models.Transaction
	CurrentPrice float64 `json:"current_price"` // Explicit JSON tag
	MarketValue  float64 `json:"market_value"`
	PnL          float64 `json:"pnl"`
	PnLPercent   float64 `json:"pnl_percent"`
}

// NewTransactionHandler is the constructor
func NewTransactionHandler(db *gorm.DB, logger *zap.SugaredLogger, financeService *services.FinanceService) *TransactionHandler {
	return &TransactionHandler{
		DB:      db,
		Logger:  logger,
		Finance: financeService,
	}
}

// Create handles POST /transactions
func (h *TransactionHandler) Create(w http.ResponseWriter, r *http.Request) {
	var tx models.Transaction

	// 1. Decode JSON Body
	if err := json.NewDecoder(r.Body).Decode(&tx); err != nil {
		h.Logger.Error("Failed to decode JSON body", zap.Error(err))
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	// 2. Basic Validation
	if tx.Symbol == "" || tx.Quantity <= 0 || tx.Price <= 0 {
		http.Error(w, "Symbol, quantity, and price are required", http.StatusBadRequest)
		return
	}

	// Default currency to USD if not provided
	if tx.Currency == "" {
		tx.Currency = "USD"
	}

	// --- NEW LOGIC START ---
	// 3. Ensure the Stock Ticker exists in our Price Cache table
	var stock models.StockPrice
	// Check if we already have this symbol
	if err := h.DB.First(&stock, "symbol = ?", tx.Symbol).Error; err != nil {
		// If NOT found (error is not nil), we need to create it
		h.Logger.Infof("New stock symbol detected: %s. Fetching initial price...", tx.Symbol)

		// A. Fetch real-time price immediately
		currentPrice, err := h.Finance.GetPriceFromAPI(tx.Symbol)
		if err != nil {
			h.Logger.Warn("Could not fetch initial price from API", zap.Error(err))
			currentPrice = 0 // Save as 0 so the background worker can try again later
		}

		// B. Save to stock_prices table
		newStock := models.StockPrice{
			Symbol:   tx.Symbol,
			Price:    currentPrice,
			Currency: tx.Currency,
		}
		if err := h.DB.Create(&newStock).Error; err != nil {
			h.Logger.Error("Failed to save new stock ticker", zap.Error(err))
			// We continue anyway, so we don't block the transaction
		}
	}
	// --- NEW LOGIC END ---

	// 4. Save Transaction to Database
	if err := h.DB.Create(&tx).Error; err != nil {
		h.Logger.Error("Failed to create transaction in DB", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	h.Logger.Infow("Transaction created successfully",
		"symbol", tx.Symbol,
		"type", tx.Type,
		"id", tx.ID,
	)

	// 5. Return Response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(tx)
}

// GetAll handles GET /transactions
// Complexity: O(N) - Linear time, very fast.
func (h *TransactionHandler) GetAll(w http.ResponseWriter, r *http.Request) {
	// 1. Fetch ALL transactions (Query #1)
	var transactions []models.Transaction
	if err := h.DB.Find(&transactions).Error; err != nil {
		h.Logger.Error("Failed to fetch transactions", zap.Error(err))
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// 2. Fetch ALL cached prices (Query #2)
	// We get everything in one shot instead of querying inside the loop
	var stockPrices []models.StockPrice
	if err := h.DB.Find(&stockPrices).Error; err != nil {
		h.Logger.Warn("Failed to fetch stock prices", zap.Error(err))
		// We continue; we just won't have price data
	}

	// 3. Create a Lookup Map (O(M))
	// This allows O(1) access time later
	priceMap := make(map[string]float64)
	for _, s := range stockPrices {
		priceMap[s.Symbol] = s.Price
	}

	// 4. Merge Data (O(N))
	var response []TransactionResponse
	for _, t := range transactions {
		// O(1) Lookup
		currentPrice := priceMap[t.Symbol]

		// Calculate PnL
		marketValue := 0.0
		pnl := 0.0
		pnlPercent := 0.0

		// Only calculate if we have a valid price > 0
		if currentPrice > 0 {
			marketValue = currentPrice * float64(t.Quantity)
			costBasis := t.Price * float64(t.Quantity)
			pnl = marketValue - costBasis

			if costBasis > 0 {
				pnlPercent = (pnl / costBasis) * 100
			}
		}

		response = append(response, TransactionResponse{
			Transaction:  t,
			CurrentPrice: currentPrice,
			MarketValue:  marketValue,
			PnL:          pnl,
			PnLPercent:   pnlPercent,
		})
	}

	// 5. Return JSON
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Delete handles DELETE /transactions/{id}
func (h *TransactionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Correção: Usar .Where("id = ?", id) explicitamente
	// Isso garante que o GORM nunca tente rodar um DELETE sem cláusula WHERE
	result := h.DB.Where("id = ?", id).Delete(&models.Transaction{})

	if result.Error != nil {
		h.Logger.Error("Failed to delete transaction", zap.Error(result.Error))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	if result.RowsAffected == 0 {
		http.Error(w, "Transaction not found", http.StatusNotFound)
		return
	}

	h.Logger.Infof("Transaction %s deleted successfully", id)
	w.WriteHeader(http.StatusNoContent) // 204 No Content
}
