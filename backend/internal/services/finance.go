package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"

	"go.uber.org/zap"
)

type FinanceService struct {
	Logger *zap.SugaredLogger
	ApiKey string
}

func NewFinanceService(logger *zap.SugaredLogger) *FinanceService {
	return &FinanceService{
		Logger: logger,
		ApiKey: os.Getenv("ALPHA_API_KEY"),
	}
}

type globalQuoteResponse struct {
	GlobalQuote struct {
		Price string `json:"05. price"`
	} `json:"Global Quote"`
}

// buildAlphaSymbol converts our internal symbol to the Alpha Vantage query symbol.
// BRL stocks get .SAO appended. Symbols with "/" (e.g. BTC/USD) become BTCUSD.
func buildAlphaSymbol(symbol string, currency string) string {
	// Remove slash for crypto pairs like BTC/USD -> BTCUSD
	alphaSymbol := strings.ReplaceAll(symbol, "/", "")

	// Brazilian stocks need .SAO suffix
	if currency == "BRL" && !strings.HasSuffix(alphaSymbol, ".SAO") {
		alphaSymbol = alphaSymbol + ".SAO"
	}

	return alphaSymbol
}

// GetPriceFromAPI fetches the real-time price from Alpha Vantage
func (s *FinanceService) GetPriceFromAPI(symbol string, currency string) (float64, error) {
	if s.ApiKey == "" {
		return 0, fmt.Errorf("API key is missing")
	}

	alphaSymbol := buildAlphaSymbol(symbol, currency)

	url := fmt.Sprintf("https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=%s&apikey=%s", alphaSymbol, s.ApiKey)
	s.Logger.Infof("Fetching price for %s (query: %s)", symbol, alphaSymbol)

	resp, err := http.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return 0, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	var data globalQuoteResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, err
	}

	if data.GlobalQuote.Price == "" {
		return 0, fmt.Errorf("no price data returned for %s", alphaSymbol)
	}

	price, err := strconv.ParseFloat(data.GlobalQuote.Price, 64)
	if err != nil {
		return 0, err
	}

	s.Logger.Infof("Price for %s: %.2f", symbol, price)
	return price, nil
}
