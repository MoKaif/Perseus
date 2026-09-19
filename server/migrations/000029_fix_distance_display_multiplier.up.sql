-- HealthKit stores walking/running and cycling distance in metres. The UI
-- labels these allowlist entries as kilometres, so display values need ÷1000.
UPDATE metric_allowlist
SET display_multiplier = 0.001
WHERE metric_name IN ('distance_walking_running', 'distance_cycling');
