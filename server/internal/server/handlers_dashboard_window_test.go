package server

import (
	"testing"
	"time"
)

// TestDashboardWindowUsesLocalCalendarBoundaries prevents HealthKit samples
// near midnight from being attributed to the adjacent UTC calendar day.
func TestDashboardWindowUsesLocalCalendarBoundaries(t *testing.T) {
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, time.September, 14, 20, 0, 0, 0, time.UTC)
	start, end, label := dashboardWindow(now, loc, 2)

	if got := start.In(loc).Format("2006-01-02 15:04"); got != "2026-09-14 00:00" {
		t.Fatalf("start = %s, want local midnight on Sep 14", got)
	}
	if got := end.In(loc).Format("2006-01-02 15:04"); got != "2026-09-16 00:00" {
		t.Fatalf("end = %s, want local midnight on Sep 16", got)
	}
	if got := label.Format("2006-01-02 15:04 -07:00"); got != "2026-09-14 00:00 +00:00" {
		t.Fatalf("series label = %s, want the local date represented at UTC midnight", got)
	}
}
