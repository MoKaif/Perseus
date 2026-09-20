export interface SleepStageLike {
  Stage: string;
}

export interface SleepSessionLike {
  Date: string;
  TotalSleep: number;
  Core: number;
  Deep: number;
  REM: number;
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
    .filter((session) => session.Date !== displayedDate && session.TotalSleep > 0)
    .slice(0, 28)
    .map((session) => session.TotalSleep)
    .sort((a, b) => a - b);

  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  const hours =
    values.length % 2 === 0
      ? (values[middle - 1] + values[middle]) / 2
      : values[middle];
  return { hours, nights: values.length };
}
