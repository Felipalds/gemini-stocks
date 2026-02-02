package models

import "gorm.io/gorm"

type PortfolioGoal struct {
	gorm.Model
	GoalTotal   float64          `json:"goal_total"`
	Allocations []GoalAllocation `json:"allocations" gorm:"foreignKey:PortfolioGoalID;constraint:OnDelete:CASCADE"`
}

type GoalAllocation struct {
	gorm.Model
	PortfolioGoalID uint    `json:"portfolio_goal_id"`
	Category        string  `json:"category"`
	Percentage      float64 `json:"percentage"`
}
