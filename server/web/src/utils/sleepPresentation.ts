export interface SleepStageLike {
  Stage: string;
}

export interface SleepSessionLike {
  Date: string;
  TotalSleep: number;
  Asleep: number;
  Core: number;
  Deep: number;
  REM: number;
  SleepStart: string;
  SleepEnd: string;
}

/**
 * Return the recorded duration, falling back to the sleep window for legacy
 * zero-value aggregates created from generic Asleep samples.
 */
export function effectiveSleepHours(
  session: Pick<
    SleepSessionLike,
    "TotalSleep" | "Asleep" | "Core" | "Deep" | "REM" | "SleepStart" | "SleepEnd"
  >,
): number {
  const start = new Date(session.SleepStart).getTime();
  const end = new Date(session.SleepEnd).getTime();
  const windowHours =
    Number.isFinite(start) && Number.isFinite(end) && end > start
      ? (end - start) / 3_600_000
      : 0;
  const recorded = session.Asleep > 0 ? session.Asleep : session.TotalSleep;
  if (recorded > 0) {
    return windowHours > 0 && recorded > windowHours ? windowHours : recorded;
  }
  const detailed = session.Core + session.Deep + session.REM;
  if (detailed > 0) {
    return windowHours > 0 && detailed > windowHours ? windowHours : detailed;
  }

  return windowHours;
}

const DETAILED_STAGES = new Set(["Core", "Deep", "REM"]);

/**
 * Generic Asleep and Awake samples describe duration, not a sleep-stage model.
 * Only expose stage analysis when the provider supplied a real sleep stage.
 */
export function hasDetailedSleepData(
  stages: SleepStageLike[],
  session: Pick<SleepSessionLike, "Core" | "Deep" | "REM">,
): boolean {
  return (
    session.Core > 0 ||
    session.Deep > 0 ||
    session.REM > 0 ||
    stages.some((stage) => DETAILED_STAGES.has(stage.Stage))
  );
}

/** Median duration from up to 28 previous nights, excluding the displayed night. */
export function previousSleepMedian(
  sessions: SleepSessionLike[],
  displayedDate: string,
): { hours: number; nights: number } | null {
  const values = sessions
    .filter((session) => session.Date !== displayedDate)
    .slice(0, 28)
    .map(effectiveSleepHours)
    .filter((hours) => hours > 0)
    .sort((a, b) => a - b);

  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  const hours =
    values.length % 2 === 0
      ? (values[middle - 1] + values[middle]) / 2
      : values[middle];
  return { hours, nights: values.length };
}
