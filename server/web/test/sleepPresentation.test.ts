import assert from "node:assert/strict";
import test from "node:test";
import {
  hasDetailedSleepData,
  previousSleepMedian,
} from "../src/utils/sleepPresentation.ts";

const durationOnlySession = {
  Date: "2026-09-20",
  TotalSleep: 7.5,
  Core: 0,
  Deep: 0,
  REM: 0,
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
      { ...durationOnlySession, Date: "2026-09-19", TotalSleep: 6 },
      { ...durationOnlySession, Date: "2026-09-18", TotalSleep: 8 },
      { ...durationOnlySession, Date: "2026-09-17", TotalSleep: 12 },
    ],
    durationOnlySession.Date,
  );
  assert.deepEqual(result, { hours: 8, nights: 3 });
});
