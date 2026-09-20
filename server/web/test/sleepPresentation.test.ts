import assert from "node:assert/strict";
import test from "node:test";
import {
  effectiveSleepHours,
  hasDetailedSleepData,
  previousSleepMedian,
} from "../src/utils/sleepPresentation.ts";

const durationOnlySession = {
  Date: "2026-09-20",
  TotalSleep: 7.5,
  Asleep: 7.5,
  Core: 0,
  Deep: 0,
  REM: 0,
  SleepStart: "2026-09-20T01:08:00+05:30",
  SleepEnd: "2026-09-20T07:58:00+05:30",
};

// Prevents generic HealthKit Asleep samples from rendering as a staged hypnogram.
test("generic asleep and awake samples stay in duration-only mode", () => {
  assert.equal(
    hasDetailedSleepData(
      [{ Stage: "Asleep" }, { Stage: "Awake" }],
      durationOnlySession,
    ),
    false,
  );
});

// Keeps legacy zero-value aggregates useful until the idempotent backend repair runs.
test("duration falls back to the generic sleep window", () => {
  assert.equal(
    effectiveSleepHours({
      ...durationOnlySession,
      TotalSleep: 0,
      Asleep: 0,
    }),
    6 + 50 / 60,
  );
});

// Prevents duplicate generic samples from displaying more sleep than the session contains.
test("duration is capped by the sleep window", () => {
  assert.equal(
    effectiveSleepHours({
      ...durationOnlySession,
      TotalSleep: 14.22,
      Asleep: 14.22,
    }),
    6 + 50 / 60,
  );
});

// Preserves the richer UI when a future device supplies any real sleep stage.
test("a detailed sample or aggregate enables stage analysis", () => {
  assert.equal(hasDetailedSleepData([{ Stage: "REM" }], durationOnlySession), true);
  assert.equal(
    hasDetailedSleepData([], { ...durationOnlySession, Core: 5.8 }),
    true,
  );
});

// Keeps the baseline resistant to one unusual night and excludes the night being compared.
test("baseline uses the median of previous nights", () => {
  const result = previousSleepMedian(
    [
      durationOnlySession,
      {
        ...durationOnlySession,
        Date: "2026-09-19",
        TotalSleep: 6,
        Asleep: 6,
        SleepStart: "2026-09-20T01:58:00+05:30",
      },
      {
        ...durationOnlySession,
        Date: "2026-09-18",
        TotalSleep: 8,
        Asleep: 8,
        SleepStart: "2026-09-19T23:58:00+05:30",
      },
      {
        ...durationOnlySession,
        Date: "2026-09-17",
        TotalSleep: 12,
        Asleep: 12,
        SleepStart: "2026-09-19T19:58:00+05:30",
      },
    ],
    durationOnlySession.Date,
  );
  assert.deepEqual(result, { hours: 8, nights: 3 });
});
