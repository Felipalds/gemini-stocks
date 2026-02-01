package database

import (
	"log"
	"os"
	"time"

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

	if err != nil {
		return nil, err
	}

	return db, nil
}
