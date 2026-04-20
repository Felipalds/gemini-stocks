package database

import (
	"log"
	"os"
	"time"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func NewConnection() (*gorm.DB, error) {
	dbName := os.Getenv("DB_NAME")
	if dbName == "" {
		dbName = "stocks.db" // default fallback
	}

	// Configure GORM logger (less verbose in production)
	newLogger := logger.New(
		log.New(os.Stdout, "\r\n", log.LstdFlags), // io writer
		logger.Config{
			SlowThreshold:             time.Second, // Log slow SQL queries
			LogLevel:                  logger.Info, // Log level
			IgnoreRecordNotFoundError: true,        // Ignore ErrRecordNotFound error for logger
			Colorful:                  true,        // Enable color
		},
	)

	db, err := gorm.Open(sqlite.Open(dbName), &gorm.Config{
		Logger: newLogger,
	})

	// Verifique se a tabela antiga existe e renomeie
	if db.Migrator().HasTable("stock_prices") {
		// Renomeia 'stock_prices' para 'tickers' preservando os dados
		err := db.Migrator().RenameTable("stock_prices", "tickers")
		if err != nil {
			log.Fatal("Falha ao renomear tabela:", err)
		}
		log.Println("Tabela renomeada de stock_prices para tickers com sucesso!")
	}

	// Depois roda o AutoMigrate normal com a nova Struct
	db.AutoMigrate(&models.Ticker{}, &models.Transaction{})

	if err != nil {
		return nil, err
	}

	return db, nil
}
