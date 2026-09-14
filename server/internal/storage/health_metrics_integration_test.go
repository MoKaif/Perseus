//go:build integration

// Package storage's integration tests run against a disposable TimescaleDB
// database because metric conflict behavior is enforced by PostgreSQL. Run
// with:
//
//	FREEREPS_TEST_DSN=postgres://user:pass@host:port/db?sslmode=disable \
//	  go test -tags integration ./internal/storage/
package storage

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/claude/freereps/internal/models"
	"github.com/google/uuid"
)

func healthMetricTestDB(t *testing.T) *DB {
	t.Helper()
	dsn := os.Getenv("FREEREPS_TEST_DSN")
	if dsn == "" {
		t.Skip("FREEREPS_TEST_DSN not set")
	}

	migrations, err := filepath.Abs("../../migrations")
	if err != nil {
		t.Fatalf("resolving migrations path: %v", err)
	}
	if err := RunMigrations(dsn, migrations); err != nil {
		t.Fatalf("running migrations: %v", err)
	}

	ctx := context.Background()
	db, err := New(ctx, dsn)
	if err != nil {
		t.Fatalf("connecting: %v", err)
	}
	t.Cleanup(db.Close)

	var dbName string
	if err := db.Pool.QueryRow(ctx, `SELECT current_database()`).Scan(&dbName); err != nil {
		t.Fatalf("reading database name: %v", err)
	}
	if strings.EqualFold(dbName, "freereps") || strings.EqualFold(dbName, "perseus") {
		t.Fatalf("refusing to truncate the deployed database %q", dbName)
	}
	if _, err := db.Pool.Exec(ctx, `TRUNCATE health_metrics`); err != nil {
		t.Fatalf("truncating health_metrics: %v", err)
	}
	return db
}

func float64Pointer(v float64) *float64 { return &v }

// TestCorrectedAggregateReplacesPartialBucket prevents the data-loss regression
// found on 2026-09-14: an observer sync stored the current partial step-count
// hour, and every later HealthKit total for that natural key was discarded.
func TestCorrectedAggregateReplacesPartialBucket(t *testing.T) {
	db := healthMetricTestDB(t)
	ctx := context.Background()
	bucket := time.Date(2026, 9, 13, 4, 30, 0, 0, time.UTC)

	partial := models.HealthMetricRow{
		Time: bucket, UserID: 1, MetricName: "step_count", Units: "count",
		Qty: float64Pointer(21),
	}
	corrected := partial
	corrected.Qty = float64Pointer(1821)

	if got, err := db.InsertHealthMetrics(ctx, []models.HealthMetricRow{partial}); err != nil || got != 1 {
		t.Fatalf("inserting partial bucket: affected %d rows, error %v; want 1, nil", got, err)
	}
	if got, err := db.InsertHealthMetrics(ctx, []models.HealthMetricRow{corrected}); err != nil || got != 1 {
		t.Fatalf("correcting bucket: affected %d rows, error %v; want 1, nil", got, err)
	}
	if got, err := db.InsertHealthMetrics(ctx, []models.HealthMetricRow{corrected}); err != nil || got != 0 {
		t.Fatalf("repeating corrected bucket: affected %d rows, error %v; want 0, nil", got, err)
	}

	var rows int
	var qty float64
	if err := db.Pool.QueryRow(ctx,
		`SELECT count(*), max(qty) FROM health_metrics
		 WHERE user_id = 1 AND metric_name = 'step_count' AND time = $1`, bucket,
	).Scan(&rows, &qty); err != nil {
		t.Fatalf("reading corrected bucket: %v", err)
	}
	if rows != 1 || qty != 1821 {
		t.Errorf("stored %d rows with qty %v, want one row with qty 1821", rows, qty)
	}
}

// TestDifferentSourceUUIDDoesNotOverwriteImmutableSample prevents an upsert
// from turning two HealthKit samples at the same timestamp into whichever one
// happened to arrive last; their UUIDs say they are different source facts.
func TestDifferentSourceUUIDDoesNotOverwriteImmutableSample(t *testing.T) {
	db := healthMetricTestDB(t)
	ctx := context.Background()
	at := time.Date(2026, 9, 13, 6, 0, 0, 0, time.UTC)
	firstID := uuid.New()
	secondID := uuid.New()

	first := models.HealthMetricRow{
		Time: at, UserID: 1, MetricName: "resting_heart_rate", Units: "bpm",
		Qty: float64Pointer(55), SourceUUID: &firstID,
	}
	second := first
	second.Qty = float64Pointer(72)
	second.SourceUUID = &secondID

	if got, err := db.InsertHealthMetrics(ctx, []models.HealthMetricRow{first}); err != nil || got != 1 {
		t.Fatalf("inserting first sample: affected %d rows, error %v; want 1, nil", got, err)
	}
	if got, err := db.InsertHealthMetrics(ctx, []models.HealthMetricRow{second}); err != nil || got != 0 {
		t.Fatalf("inserting colliding sample: affected %d rows, error %v; want 0, nil", got, err)
	}

	var qty float64
	var storedID uuid.UUID
	if err := db.Pool.QueryRow(ctx,
		`SELECT qty, source_uuid FROM health_metrics
		 WHERE user_id = 1 AND metric_name = 'resting_heart_rate' AND time = $1`, at,
	).Scan(&qty, &storedID); err != nil {
		t.Fatalf("reading immutable sample: %v", err)
	}
	if qty != 55 || storedID != firstID {
		t.Errorf("stored qty %v and UUID %s, want 55 and %s", qty, storedID, firstID)
	}
}
