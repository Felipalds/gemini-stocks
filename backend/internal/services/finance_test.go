package services

import (
	"testing"
	"time"
)

func day(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestPickHistoricalClose(t *testing.T) {
	ts := func(s string) int64 { return day(s).Unix() }

	// A Mon–Fri daily series.
	timestamps := []int64{
		ts("2026-01-05"), ts("2026-01-06"), ts("2026-01-07"),
		ts("2026-01-08"), ts("2026-01-09"),
	}
	closes := []float64{5.00, 5.10, 5.20, 5.30, 5.40}

	cases := []struct {
		name   string
		target string
		closes []float64
		want   float64
	}{
		{"exact day", "2026-01-07", closes, 5.20},
		{"last day", "2026-01-09", closes, 5.40},
		{"weekend falls back to Friday", "2026-01-10", closes, 5.40},
		{"before series falls back to latest", "2026-01-01", closes, 5.40},
		{"zero on target day picks prior non-zero", "2026-01-06",
			[]float64{5.00, 0, 5.20, 5.30, 5.40}, 5.00},
		{"all zero yields zero", "2026-01-07",
			[]float64{0, 0, 0, 0, 0}, 0},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := pickHistoricalClose(timestamps, c.closes, day(c.target))
			if got != c.want {
				t.Fatalf("target %s: got %.2f want %.2f", c.target, got, c.want)
			}
		})
	}
}

func TestPickHistoricalClose_EmptyAndRagged(t *testing.T) {
	if got := pickHistoricalClose(nil, nil, day("2026-01-01")); got != 0 {
		t.Fatalf("empty series: got %.2f want 0", got)
	}
	// More timestamps than closes: must not panic and should use what it can.
	tsx := []int64{day("2026-01-05").Unix(), day("2026-01-06").Unix()}
	if got := pickHistoricalClose(tsx, []float64{5.5}, day("2026-01-10")); got != 5.5 {
		t.Fatalf("ragged series: got %.2f want 5.5", got)
	}
}
