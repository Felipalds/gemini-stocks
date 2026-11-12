package handlers

import (
	"math"
	"testing"

	"github.com/Felipalds/gemini-stocks/internal/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func openMemoryDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	if err := db.AutoMigrate(&models.Setting{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func approx(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

func TestIOFFor(t *testing.T) {
	s := models.Setting{IOFBuyRate: 0.0038, IOFSellRate: 0.011}
	if got := IOFFor(s, models.Buy); !approx(got, 0.0038) {
		t.Errorf("buy IOF: got %v want 0.0038", got)
	}
	if got := IOFFor(s, models.Sell); !approx(got, 0.011) {
		t.Errorf("sell IOF: got %v want 0.011", got)
	}
}

func TestEffectiveRate(t *testing.T) {
	s := models.Setting{IOFBuyRate: 0.0038, IOFSellRate: 0.011}
	cases := []struct {
		name   string
		market float64
		typ    models.TransactionType
		want   float64
	}{
		{"buy applies buy IOF", 5.0, models.Buy, 5.0 * 1.0038},
		{"sell applies sell IOF", 5.0, models.Sell, 5.0 * 1.011},
		{"zero IOF is identity", 5.3, models.Buy, 5.3},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s := s
			if c.name == "zero IOF is identity" {
				s = models.Setting{}
			}
			if got := EffectiveRate(c.market, s, c.typ); !approx(got, c.want) {
				t.Fatalf("got %v want %v", got, c.want)
			}
		})
	}
}

func TestGetSettings_CreatesSingletonAndIsIdempotent(t *testing.T) {
	db := openMemoryDB(t)

	s := GetSettings(db)
	if s.ID != settingsID {
		t.Fatalf("expected singleton id %d, got %d", settingsID, s.ID)
	}
	if s.IOFBuyRate != 0 || s.IOFSellRate != 0 {
		t.Fatalf("expected zero default IOF, got buy=%v sell=%v", s.IOFBuyRate, s.IOFSellRate)
	}

	// Calling again must not create a second row.
	_ = GetSettings(db)
	var count int64
	db.Model(&models.Setting{}).Count(&count)
	if count != 1 {
		t.Fatalf("expected exactly 1 settings row, got %d", count)
	}
}
