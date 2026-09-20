# Changelog

Notable changes to Perseus are recorded here.

## 2026-09-20

### Added

- Redesigned the daily dashboard around a clearer, denser overview of activity,
  sleep, and available health readings.
- Added adaptive sleep and manual heart-rate cards to the overview.
- Added a duration-only sleep presentation for devices that report generic
  `Asleep` samples without Core, Deep, or REM stages.
- Added personal sleep-duration baselines using the median of up to 28 previous
  nights.
- Added frontend and storage regression tests for empty sleep data, generic
  sleep duration, future staged data, and overlapping sleep samples.

### Changed

- Sleep pages now automatically reveal stage composition and hypnograms only
  when the source provides real sleep-stage data.
- Duration-only nights emphasize total sleep, the sleep window, timing history,
  and baseline comparison without estimating unavailable stages.
- The overview labels non-staged sleep as `Duration only` instead of presenting
  an unsupported efficiency percentage.
- Frontend production builds now run the sleep-presentation regression tests.

### Fixed

- Corrected HealthKit cumulative metric updates so revised daily values replace
  stale values instead of being silently discarded.
- Handled `null` sleep-session arrays returned before the first sleep record.
- Counted generic `Asleep` samples when creating sleep-session totals, fixing
  zero-hour nights with valid start and end times.
- Added an idempotent startup repair for previously stored zero-duration sleep
  sessions.
- Prevented overlapping records from the same sleep source from double-counting
  total sleep.
- Bounded repaired duration to the canonical sleep window; the 2026-09-20
  01:08–07:58 session now resolves deterministically to 6h50m.
