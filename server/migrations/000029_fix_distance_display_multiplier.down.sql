UPDATE metric_allowlist
SET display_multiplier = 1
WHERE metric_name IN ('distance_walking_running', 'distance_cycling');
