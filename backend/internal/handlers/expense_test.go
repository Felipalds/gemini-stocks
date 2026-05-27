package handlers

import (
	"testing"
	"time"

	"github.com/Felipalds/gemini-stocks/internal/models"
)

func date(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestExpandRecurringDates_NonRecurring_InsideWindow(t *testing.T) {
	got := expandRecurringDates(date("2026-03-15"), models.RecurringNone, date("2026-01-01"), date("2026-12-31"))
	if len(got) != 1 || !got[0].Equal(date("2026-03-15")) {
		t.Fatalf("expected single 2026-03-15, got %v", got)
	}
}

func TestExpandRecurringDates_NonRecurring_OutsideWindow(t *testing.T) {
	got := expandRecurringDates(date("2025-12-31"), models.RecurringNone, date("2026-01-01"), date("2026-12-31"))
	if len(got) != 0 {
		t.Fatalf("expected no instances, got %v", got)
	}
}

func TestExpandRecurringDates_Monthly(t *testing.T) {
	got := expandRecurringDates(date("2026-01-15"), models.RecurringMonthly, time.Time{}, date("2026-06-20"))
	// Expected: Jan 15, Feb 15, Mar 15, Apr 15, May 15, Jun 15
	if len(got) != 6 {
		t.Fatalf("expected 6 monthly instances, got %d (%v)", len(got), got)
	}
	for i, want := range []string{
		"2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15", "2026-05-15", "2026-06-15",
	} {
		if got[i].Format("2006-01-02") != want {
			t.Errorf("instance %d: want %s, got %s", i, want, got[i].Format("2006-01-02"))
		}
	}
}

func TestExpandRecurringDates_Monthly_StartsBeforeWindow(t *testing.T) {
	// Started Jan 10 2025 but window is only March–May 2026; should yield Mar 10, Apr 10, May 10.
	got := expandRecurringDates(date("2025-01-10"), models.RecurringMonthly, date("2026-03-01"), date("2026-05-31"))
	if len(got) != 3 {
		t.Fatalf("expected 3 instances in window, got %d (%v)", len(got), got)
	}
	wantFirst := date("2026-03-10")
	if !got[0].Equal(wantFirst) {
		t.Errorf("first instance: want %v, got %v", wantFirst, got[0])
	}
}

func TestExpandRecurringDates_Annually(t *testing.T) {
	got := expandRecurringDates(date("2023-06-10"), models.RecurringAnnually, time.Time{}, date("2026-06-15"))
	// Expected: 2023, 2024, 2025, 2026 — all on June 10 (June 15 cutoff includes 2026-06-10).
	if len(got) != 4 {
		t.Fatalf("expected 4 annual instances, got %d (%v)", len(got), got)
	}
	for i, want := range []string{"2023-06-10", "2024-06-10", "2025-06-10", "2026-06-10"} {
		if got[i].Format("2006-01-02") != want {
			t.Errorf("instance %d: want %s, got %s", i, want, got[i].Format("2006-01-02"))
		}
	}
}

func TestExpandRecurringDates_Annually_CutoffBeforeAnniversary(t *testing.T) {
	// `to` is 2026-06-09, one day before the 2026 anniversary — should yield only 2023, 2024, 2025.
	got := expandRecurringDates(date("2023-06-10"), models.RecurringAnnually, time.Time{}, date("2026-06-09"))
	if len(got) != 3 {
		t.Fatalf("expected 3 annual instances, got %d (%v)", len(got), got)
	}
}

func TestExpandRecurringDates_FutureDateReturnsNothing(t *testing.T) {
	got := expandRecurringDates(date("2099-01-01"), models.RecurringMonthly, time.Time{}, date("2026-12-31"))
	if len(got) != 0 {
		t.Fatalf("expected no instances for future-dated recurring, got %v", got)
	}
}
