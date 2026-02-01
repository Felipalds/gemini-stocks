package main

import (
	"fmt"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
	"go.uber.org/zap"

	"github.com/Felipalds/gemini-stocks/internal/database" // Update with your actual module path
	"github.com/Felipalds/gemini-stocks/internal/handlers" // Update with your actual module path
	"github.com/Felipalds/gemini-stocks/internal/models"   // Update with your actual module path
	"github.com/Felipalds/gemini-stocks/internal/services" // Update with your actual module path
)

func main() {
	// 1. Initialize Logger (Zap)
	// In production, use zap.NewProduction()
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()
	sugar := logger.Sugar()

	// 2. Load environment variables
	if err := godotenv.Load(); err != nil {
		sugar.Warn(".env file not found, using system environment variables")
	}

	// 3. Connect to Database
	db, err := database.NewConnection()
	if err != nil {
		sugar.Fatalf("Failed to connect to database: %v", err)
	}

	// Auto-Migrate Models
	// This will create the "transactions" table in SQLite automatically
	if err := db.AutoMigrate(&models.Transaction{}, &models.StockPrice{}); err != nil {
		sugar.Fatalf("Database migration failed: %v", err)
	}

	sugar.Info("Database migrations completed successfully")

	sugar.Info("SQLite connection established successfully!")

	// 4. Configure Router (Chi)
	r := chi.NewRouter()
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://*", "http://*"}, // Allow localhost
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	//services
	financeService := services.NewFinanceService(sugar)

	//handlers
	transactionHandler := handlers.NewTransactionHandler(db, sugar, financeService)
	priceHandler := handlers.NewPriceHandler(db, sugar, financeService)

	// Basic Middleware
	r.Use(middleware.RequestID) // Unique ID for each request
	r.Use(middleware.RealIP)    // Get real client IP
	r.Use(middleware.Logger)    // Log API requests
	r.Use(middleware.Recoverer) // Recover from panics without crashing

	// 5. Routes (Health Check)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("API is running 🚀"))
	})

	r.Route("/transactions", func(r chi.Router) {
		r.Post("/", transactionHandler.Create)
		r.Get("/", transactionHandler.GetAll)
		r.Delete("/{id}", transactionHandler.Delete)
	})

	r.Post("/prices/refresh", priceHandler.RefreshPrices)

	// 6. Start Server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	sugar.Infof("Server running on port %s", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%s", port), r); err != nil {
		sugar.Fatalf("Error starting server: %s", err)
	}
}
