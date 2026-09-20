package storage

import (
	"testing"

	"github.com/claude/freereps/internal/models"
)

// TestSleepDurationsUsesGenericAsleep prevents duration-only devices from
// producing zero-hour sessions when they do not provide Core, Deep, or REM.
func TestSleepDurationsUsesGenericAsleep(t *testing.T) {
	total, core, deep, rem := sleepDurations([]models.SleepStageRow{
		{Stage: models.SleepStageAsleep, DurationHr: 6.5},
		{Stage: models.SleepStageAwake, DurationHr: 0.25},
	})
	if total != 6.5 || core != 0 || deep != 0 || rem != 0 {
		t.Fatalf("sleepDurations() = %.2f, %.2f, %.2f, %.2f; want 6.5, 0, 0, 0", total, core, deep, rem)
	}
}

// TestSleepDurationsPrefersDetailedStages prevents overlapping generic and
// detailed samples from being added together and doubling total sleep.
func TestSleepDurationsPrefersDetailedStages(t *testing.T) {
	total, core, deep, rem := sleepDurations([]models.SleepStageRow{
		{Stage: models.SleepStageAsleep, DurationHr: 7},
		{Stage: models.SleepStageCore, DurationHr: 4},
		{Stage: models.SleepStageDeep, DurationHr: 1},
		{Stage: models.SleepStageREM, DurationHr: 2},
	})
	if total != 7 || core != 4 || deep != 1 || rem != 2 {
		t.Fatalf("sleepDurations() = %.2f, %.2f, %.2f, %.2f; want 7, 4, 1, 2", total, core, deep, rem)
	}
}
