package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"go.uber.org/zap"
)

// FinanceService wraps the Yahoo Finance public chart endpoint
// (query1.finance.yahoo.com/v8/finance/chart). It is free and needs no API key;
// a browser-like User-Agent header is required or Yahoo answers 403.
type FinanceService struct {
	Logger  *zap.SugaredLogger
	baseURL string
	client  *http.Client
}

func NewFinanceService(logger *zap.SugaredLogger) *FinanceService {
	base := os.Getenv("YAHOO_API_BASE_URL")
	if base == "" {
		base = "https://query1.finance.yahoo.com"
	}
	return &FinanceService{
		Logger:  logger,
		baseURL: base,
		client:  &http.Client{Timeout: 15 * time.Second},
	}
}

// yahooChartResponse captures only the fields we need from the chart endpoint.
type yahooChartResponse struct {
	Chart struct {
		Result []struct {
			Meta struct {
				RegularMarketPrice         float64 `json:"regularMarketPrice"`
				RegularMarketChangePercent float64 `json:"regularMarketChangePercent"`
				Currency                   string  `json:"currency"`
			} `json:"meta"`
		} `json:"result"`
		Error *struct {
			Code        string `json:"code"`
			Description string `json:"description"`
		} `json:"error"`
	} `json:"chart"`
}

// buildYahooSymbol converts our internal symbol to the Yahoo query symbol.
// Crypto pairs like BTC/USD become BTC-USD; BRL stocks get a .SA suffix.
func buildYahooSymbol(symbol string, currency string) string {
	// Crypto pairs (e.g. BTC/USD) use a dash on Yahoo: BTC-USD.
	if strings.Contains(symbol, "/") {
		return strings.ReplaceAll(symbol, "/", "-")
	}

	// Brazilian stocks need the .SA suffix (e.g. GGBR4 -> GGBR4.SA).
	if strings.EqualFold(currency, "BRL") && !strings.HasSuffix(symbol, ".SA") {
		return symbol + ".SA"
	}

	return symbol
}

// fetchQuote hits the Yahoo chart endpoint for a ready-made Yahoo symbol and
// returns the latest price, day-change percent, and the currency it is quoted in.
func (s *FinanceService) fetchQuote(yahooSymbol string) (price float64, changePercent float64, currency string, err error) {
	// Our symbols only ever contain unreserved chars plus '-', '.', '=' after
	// mapping, all valid in a path segment, so no escaping is needed.
	url := fmt.Sprintf("%s/v8/finance/chart/%s?interval=1d&range=1d", s.baseURL, yahooSymbol)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return 0, 0, "", err
	}
	// Yahoo returns 403 without a browser-like User-Agent.
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := s.client.Do(req)
	if err != nil {
		return 0, 0, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return 0, 0, "", fmt.Errorf("rate limit exceeded for %s", yahooSymbol)
	}
	if resp.StatusCode != http.StatusOK {
		return 0, 0, "", fmt.Errorf("Yahoo returned status %d for %s", resp.StatusCode, yahooSymbol)
	}

	var data yahooChartResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, 0, "", err
	}

	if data.Chart.Error != nil {
		return 0, 0, "", fmt.Errorf("Yahoo error for %s: %s", yahooSymbol, data.Chart.Error.Description)
	}
	if len(data.Chart.Result) == 0 {
		return 0, 0, "", fmt.Errorf("no data returned for %s", yahooSymbol)
	}

	m := data.Chart.Result[0].Meta
	if m.RegularMarketPrice == 0 {
		return 0, 0, "", fmt.Errorf("no price data returned for %s", yahooSymbol)
	}

	return m.RegularMarketPrice, m.RegularMarketChangePercent, m.Currency, nil
}

// yahooHistoryResponse captures the fields needed for the monthly close series.
// close[] can contain nulls for months with no data; those decode to 0 and are
// skipped by FetchMonthlyHistory.
type yahooHistoryResponse struct {
	Chart struct {
		Result []struct {
			Meta struct {
				Currency string `json:"currency"`
			} `json:"meta"`
			Timestamp  []int64 `json:"timestamp"`
			Indicators struct {
				Quote []struct {
					Close []float64 `json:"close"`
				} `json:"quote"`
			} `json:"indicators"`
		} `json:"result"`
		Error *struct {
			Code        string `json:"code"`
			Description string `json:"description"`
		} `json:"error"`
	} `json:"chart"`
}

// FetchMonthlyHistory pulls the full monthly close-price series for a ticker in
// its native currency. Yahoo has no "since" parameter — one call always returns
// the entire series — so callers upsert only the periods they don't already have.
func (s *FinanceService) FetchMonthlyHistory(symbol string, currency string) ([]models.TickerHistory, error) {
	yahooSymbol := buildYahooSymbol(symbol, currency)
	s.Logger.Infof("Fetching monthly history for %s (yahoo: %s)", symbol, yahooSymbol)

	url := fmt.Sprintf("%s/v8/finance/chart/%s?interval=1mo&range=max", s.baseURL, yahooSymbol)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	// Yahoo returns 403 without a browser-like User-Agent.
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, fmt.Errorf("rate limit exceeded for %s", yahooSymbol)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Yahoo returned status %d for %s", resp.StatusCode, yahooSymbol)
	}

	var data yahooHistoryResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	if data.Chart.Error != nil {
		return nil, fmt.Errorf("Yahoo error for %s: %s", yahooSymbol, data.Chart.Error.Description)
	}
	if len(data.Chart.Result) == 0 {
		return nil, fmt.Errorf("no data returned for %s", yahooSymbol)
	}

	res := data.Chart.Result[0]
	if len(res.Indicators.Quote) == 0 {
		return nil, fmt.Errorf("no quote indicators returned for %s", yahooSymbol)
	}
	closes := res.Indicators.Quote[0].Close
	quoteCurrency := res.Meta.Currency

	history := make([]models.TickerHistory, 0, len(res.Timestamp))
	for i, ts := range res.Timestamp {
		if i >= len(closes) {
			break
		}
		c := closes[i]
		if c == 0 {
			continue // null / missing month
		}
		d := time.Unix(ts, 0).UTC()
		history = append(history, models.TickerHistory{
			Symbol:   symbol,
			Period:   d.Format("2006-01"),
			Date:     d,
			Close:    c,
			Currency: quoteCurrency,
		})
	}
	return history, nil
}

// UpdateTickerFromAPI updates some infos about the ticker
func (s *FinanceService) UpdateTickerFromAPI(symbol string, currency string) (models.Ticker, error) {
	var updatedTicker models.Ticker

	yahooSymbol := buildYahooSymbol(symbol, currency)
	s.Logger.Infof("Fetching price for %s (yahoo: %s)", symbol, yahooSymbol)

	price, changePercent, quoteCurrency, err := s.fetchQuote(yahooSymbol)
	if err != nil {
		return updatedTicker, err
	}

	s.Logger.Infof("Price for %s: %.2f %s", symbol, price, quoteCurrency)
	updatedTicker.Price = price
	updatedTicker.DayChangePercent = changePercent
	// Yahoo is authoritative on the currency the price is quoted in (e.g. BTC/USD
	// is always USD, GGBR4.SA is BRL). Callers persist this so the stored price
	// and its currency never drift apart.
	updatedTicker.Currency = quoteCurrency
	return updatedTicker, nil
}

// GetExchangeRate fetches the exchange rate from one currency to another (e.g., USD to BRL).
// Fiat pairs use Yahoo's "{FROM}{TO}=X" symbol. Crypto (e.g. BTC) has no direct
// Yahoo pair against BRL, so it is derived through the USD cross.
func (s *FinanceService) GetExchangeRate(fromCurrency, toCurrency string) (float64, error) {
	from := strings.ToUpper(strings.TrimSpace(fromCurrency))
	to := strings.ToUpper(strings.TrimSpace(toCurrency))

	if from == to {
		return 1, nil
	}

	s.Logger.Infof("Fetching exchange rate %s to %s", from, to)

	// Crypto: derive {CRYPTO}->{to} as (CRYPTO-USD) * (USD->to).
	if from == "BTC" {
		btcUSD, _, _, err := s.fetchQuote("BTC-USD")
		if err != nil {
			return 0, err
		}
		if to == "USD" {
			return btcUSD, nil
		}
		usdTo, _, _, err := s.fetchQuote(fmt.Sprintf("USD%s=X", to))
		if err != nil {
			return 0, err
		}
		rate := btcUSD * usdTo
		s.Logger.Infof("Exchange rate %s to %s: %.4f", from, to, rate)
		return rate, nil
	}

	// Fiat pair, e.g. USD->BRL = USDBRL=X.
	rate, _, _, err := s.fetchQuote(fmt.Sprintf("%s%s=X", from, to))
	if err != nil {
		return 0, err
	}

	s.Logger.Infof("Exchange rate %s to %s: %.4f", from, to, rate)
	return rate, nil
}
