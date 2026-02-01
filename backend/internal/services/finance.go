package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"

	"go.uber.org/zap"
)

type FinanceService struct {
	Logger *zap.SugaredLogger
	ApiKey string
}

func NewFinanceService(logger *zap.SugaredLogger) *FinanceService {
	return &FinanceService{
		Logger: logger,
		ApiKey: os.Getenv("TWELVEDATA_API_KEY"),
	}
}

type priceResponse struct {
	Price string `json:"price"`
}

// GetPriceFromAPI fetches the real-time price from Twelvedata
func (s *FinanceService) GetPriceFromAPI(symbol string) (float64, error) {
	fmt.Println(s.ApiKey)
	if s.ApiKey == "" {
		return 0, fmt.Errorf("API key is missing")
	}

	fmt.Print(symbol)

	url := fmt.Sprintf("https://api.twelvedata.com/price?symbol=%s&apikey=%s", symbol, s.ApiKey)
	resp, err := http.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return 0, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	var data priceResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, err
	}

	price, err := strconv.ParseFloat(data.Price, 64)
	if err != nil {
		return 0, err
	}

	s.Logger.Info("Prices updated?")

	return price, nil
}
