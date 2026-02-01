package handlers

import (
	"net/http"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

type DataHandler struct {
	db     *gorm.DB
	logger *zap.SugaredLogger
}

func NewDataHandler(db *gorm.DB, logger *zap.SugaredLogger) *DataHandler {
	return &DataHandler{
		db:     db,
		logger: logger,
	}
}

func (dh *DataHandler) GetSummary(w http.ResponseWriter, r *http.Request) {
	dh.logger.Info("Getting data summary")
	// Implement logic to fetch and return data summary
	// get all transactions
	// compare all with the prices
	// give me total, profit, percentage of win or loss

}
