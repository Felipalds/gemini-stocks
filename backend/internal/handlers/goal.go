package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type GoalHandler struct {
	DB     *gorm.DB
	Logger *zap.SugaredLogger
}

func NewGoalHandler(db *gorm.DB, logger *zap.SugaredLogger) *GoalHandler {
	return &GoalHandler{DB: db, Logger: logger}
}

func (h *GoalHandler) GetGoal(w http.ResponseWriter, r *http.Request) {
	var goal models.PortfolioGoal
	result := h.DB.Preload("Allocations").Order("created_at desc").First(&goal)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "no goal found"})
			return
		}
		h.Logger.Errorw("failed to fetch goal", "error", result.Error)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(goal)
}

type saveGoalRequest struct {
	GoalTotal   float64 `json:"goal_total"`
	Allocations []struct {
		Category   string  `json:"category"`
		Percentage float64 `json:"percentage"`
	} `json:"allocations"`
}

func (h *GoalHandler) SaveGoal(w http.ResponseWriter, r *http.Request) {
	var req saveGoalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.GoalTotal <= 0 {
		http.Error(w, "goal_total must be positive", http.StatusBadRequest)
		return
	}

	tx := h.DB.Begin()

	// Delete existing allocations and goals
	tx.Where("1 = 1").Delete(&models.GoalAllocation{})
	tx.Where("1 = 1").Delete(&models.PortfolioGoal{})

	goal := models.PortfolioGoal{
		GoalTotal: req.GoalTotal,
	}

	if err := tx.Create(&goal).Error; err != nil {
		tx.Rollback()
		h.Logger.Errorw("failed to create goal", "error", err)
		http.Error(w, "failed to save goal", http.StatusInternalServerError)
		return
	}

	for _, a := range req.Allocations {
		if a.Percentage <= 0 {
			continue
		}
		alloc := models.GoalAllocation{
			PortfolioGoalID: goal.ID,
			Category:        a.Category,
			Percentage:      a.Percentage,
		}
		if err := tx.Create(&alloc).Error; err != nil {
			tx.Rollback()
			h.Logger.Errorw("failed to create allocation", "error", err)
			http.Error(w, "failed to save allocation", http.StatusInternalServerError)
			return
		}
	}

	tx.Commit()

	// Reload with allocations
	h.DB.Preload("Allocations").First(&goal, goal.ID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(goal)
}
