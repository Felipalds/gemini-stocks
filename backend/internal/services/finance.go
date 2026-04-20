package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"go.uber.org/zap"
)

type FinanceService struct {
	Logger          *zap.SugaredLogger
	alphaApiBaseUrl string
	alphaApiKey     string
}

func NewFinanceService(logger *zap.SugaredLogger) *FinanceService {
	return &FinanceService{
		Logger:          logger,
		alphaApiBaseUrl: os.Getenv("ALPHA_API_BASE_URL"),
		alphaApiKey:     os.Getenv("ALPHA_API_KEY"),
	}
}

type apiResponse struct {
	GlobalQuote struct {
		Price            string `json:"05. price"`
		DayChangePercent string `json:"10. change percent"`
	} `json:"Global Quote"`

	Information string `json:"Information"`
}

// buildAlphaSymbol converts our internal symbol to the Alpha Vantage query symbol.
// BRL stocks get .SAO appended. Symbols with "/" (e.g. BTC/USD) become BTCUSD.
// TODO: Implement unit functions for this function
func buildAlphaSymbol(symbol string, currency string) string {
	// Remove slash for crypto pairs like BTC/USD -> BTCUSD
	alphaSymbol := strings.ReplaceAll(symbol, "/", "")

	// Brazilian stocks need .SAO suffix
	if currency == "BRL" && !strings.HasSuffix(alphaSymbol, ".SAO") {
		alphaSymbol = alphaSymbol + ".SAO"
	}

	return alphaSymbol
}

// UpdateTickerFromAPI updates some infos about the ticker
func (s *FinanceService) UpdateTickerFromAPI(symbol string, currency string) (models.Ticker, error) {
	var updatedTicker models.Ticker
	if s.alphaApiKey == "" {
		return updatedTicker, fmt.Errorf("API key is missing")
	}

	alphaSymbol := buildAlphaSymbol(symbol, currency)

	url := fmt.Sprintf(s.alphaApiBaseUrl+"/query?function=GLOBAL_QUOTE&symbol=%s&apikey=%s", alphaSymbol, s.alphaApiKey)
	s.Logger.Infof("Fetching price for %s (query: %s, url: %s)", symbol, alphaSymbol, url)

	resp, err := http.Get(url)
	if err != nil {
		return updatedTicker, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return updatedTicker, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	var data apiResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return updatedTicker, err
	}

	s.Logger.Debug("Data received: ", data)

	if strings.Contains(data.Information, "rate limit") {
		return updatedTicker, fmt.Errorf("rate limit exceeded")
	}

	if data.GlobalQuote.Price == "" && resp.StatusCode != 200 {
		return updatedTicker, fmt.Errorf("no price data returned for %s", alphaSymbol)
	}

	price, err := strconv.ParseFloat(data.GlobalQuote.Price, 64)
	if err != nil {
		return updatedTicker, err
	}

	dayChangePercent, err := strconv.ParseFloat(strings.Replace(data.GlobalQuote.DayChangePercent, "%", "", -1), 64)
	if err != nil {
		return updatedTicker, err
	}

	s.Logger.Infof("Price for %s: %.2f", symbol, price)
	updatedTicker.Price = price
	updatedTicker.DayChangePercent = dayChangePercent
	return updatedTicker, nil
}

type currencyExchangeResponse struct {
	RealtimeCurrencyExchangeRate struct {
		ExchangeRate string `json:"5. Exchange Rate"`
	} `json:"Realtime Currency Exchange Rate"`
}

// GetExchangeRate fetches the exchange rate from one currency to another (e.g., USD to BRL)
func (s *FinanceService) GetExchangeRate(fromCurrency, toCurrency string) (float64, error) {
	if s.alphaApiKey == "" {
		return 0, fmt.Errorf("API key is missing")
	}

	url := fmt.Sprintf(s.alphaApiBaseUrl+"/query?function=CURRENCY_EXCHANGE_RATE&from_currency=%s&to_currency=%s&apikey=%s",
		fromCurrency, toCurrency, s.alphaApiKey)
	s.Logger.Infof("Fetching exchange rate %s to %s", fromCurrency, toCurrency)

	resp, err := http.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return 0, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	var data currencyExchangeResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, err
	}

	if data.RealtimeCurrencyExchangeRate.ExchangeRate == "" {
		return 0, fmt.Errorf("no exchange rate data returned for %s/%s", fromCurrency, toCurrency)
	}

	rate, err := strconv.ParseFloat(data.RealtimeCurrencyExchangeRate.ExchangeRate, 64)
	if err != nil {
		return 0, err
	}

	s.Logger.Infof("Exchange rate %s to %s: %.4f", fromCurrency, toCurrency, rate)
	return rate, nil
}
