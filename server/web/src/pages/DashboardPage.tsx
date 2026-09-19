import { useQuery } from "@tanstack/react-query";
import { useMemo, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchFrontPage,
  fetchSleep,
  type FrontPageMetric,
  type SleepSession,
} from "../api";
import { formatTimeAgo } from "../utils/format";

const DAY_MS = 86_400_000;
const CORE_METRICS = [
  { name: "step_count", label: "Steps" },
  { name: "distance_walking_running", label: "Distance" },
  { name: "active_energy", label: "Active energy" },
  { name: "flights_climbed", label: "Flights climbed" },
  { name: "walking_speed", label: "Walking speed" },
] as const;

type DailyMetric = {
  meta: FrontPageMetric;
  value: number | null;
  baseline: number | null;
  change: number | null;
  history: (number | null)[];
};

function localDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateFromKey(key: string) {
  return new Date(`${key}T12:00:00`);
}

function moveDay(key: string, amount: number) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

function dayIndex(windowStart: string, selected: string) {
  const start = Date.parse(`${windowStart.slice(0, 10)}T00:00:00Z`);
  const day = Date.parse(`${selected}T00:00:00Z`);
  return Math.round((day - start) / DAY_MS);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function metricForDay(meta: FrontPageMetric, index: number): DailyMetric {
  const raw = index >= 0 && index < meta.series.length ? meta.series[index] : null;
  const prior = meta.series
    .slice(Math.max(0, index - 28), Math.max(0, index))
    .filter((value): value is number => value != null);
  const rawBaseline = median(prior);
  // Older servers label HealthKit's metre values as km without setting the
  // display multiplier. Keep the preview correct while migration 000029 rolls
  // out; migrated servers already provide 0.001 here.
  const multiplier =
    meta.metric_name === "distance_walking_running" &&
    meta.unit === "km" &&
    meta.multiplier === 1
      ? 0.001
      : meta.multiplier || 1;
  const value = raw == null ? null : raw * multiplier;
  const baseline = rawBaseline == null ? null : rawBaseline * multiplier;
  return {
    meta,
    value,
    baseline,
    change:
      value != null && baseline != null && baseline !== 0
        ? (value - baseline) / Math.abs(baseline)
        : null,
    history: meta.series.map((point) =>
      point == null ? null : point * multiplier,
    ),
  };
}

function formatValue(metric: DailyMetric | undefined, compact = false) {
  if (!metric || metric.value == null) return "—";
  const { value, meta } = metric;
  if (meta.metric_name === "step_count") return Math.round(value).toLocaleString();
  if (meta.metric_name === "distance_walking_running") return `${value.toFixed(1)} ${meta.unit}`;
  if (meta.metric_name === "walking_speed") return `${value.toFixed(2)} ${meta.unit}`;
  const shown = Math.round(value).toLocaleString();
  return compact ? shown : `${shown} ${meta.unit}`.trim();
}

function comparison(change: number | null) {
  if (change == null) return "Not enough history";
  if (Math.abs(change) < 0.06) return "Close to your usual";
  return `${Math.abs(Math.round(change * 100))}% ${change > 0 ? "above" : "below"} usual`;
}

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const today = localDateKey(new Date());
  const requested = params.get("date");
  const selected = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const query = useQuery({
    queryKey: ["daily-overview", timezone],
    queryFn: () => fetchFrontPage("2y", timezone),
    staleTime: 60_000,
  });
  // Include the evening before the selected wake date so overnight stages are
  // present alongside the session that HealthKit assigns to this day.
  const sleepQuery = useQuery({
    queryKey: ["overview-sleep", selected],
    queryFn: () => fetchSleep(moveDay(selected, -1), moveDay(selected, 1)),
    staleTime: 60_000,
  });

  const metrics = useMemo(() => {
    if (!query.data) return new Map<string, DailyMetric>();
    const index = dayIndex(query.data.window_start, selected);
    return new Map(
      query.data.metrics.map((metric) => [metric.metric_name, metricForDay(metric, index)]),
    );
  }, [query.data, selected]);

  const steps = metrics.get("step_count");
  const distance = metrics.get("distance_walking_running");
  const active = metrics.get("active_energy");
  const basal = metrics.get("basal_energy_burned");
  const walkingSpeed = metrics.get("walking_speed");
  const heartRate = metrics.get("heart_rate");
  const sleep = sleepQuery.data?.sessions.find(
    (session) => session.Date.slice(0, 10) === selected,
  ) ?? null;
  const selectedDate = dateFromKey(selected);
  const isToday = selected === today;
  const hasAny = [...metrics.values()].some((metric) => metric.value != null);
  const setDate = (date: string) => {
    const next = new URLSearchParams(params);
    if (date === today) next.delete("date");
    else next.set("date", date);
    setParams(next, { replace: true });
  };

  const headline = !hasAny
    ? "No movement was recorded"
    : steps?.change == null
      ? "A day in motion"
      : steps.change > 0.15
        ? "More active than usual"
        : steps.change < -0.15
          ? "A lighter day"
          : "A typical day for you";

  const selectedIndex = query.data
    ? dayIndex(query.data.window_start, selected)
    : -1;
  const recordedDays = steps?.history
    .slice(Math.max(0, selectedIndex - 27), selectedIndex + 1)
    .filter((value) => value != null).length ?? 0;

  return (
    <div className="daily-page">
      <header className="overview-header page-x">
        <div>
          <p className="live-label"><i /> Health live stream · movement telemetry</p>
          <h1>{isToday ? "Today / Overview" : selectedDate.toLocaleDateString(undefined, { weekday: "long" })}</h1>
          <p className="overview-subtitle">
            {selectedDate.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
            {isToday ? " · activity so far" : " · complete day"}
          </p>
        </div>
        <div className="date-control" aria-label="Choose day">
          <button onClick={() => setDate(moveDay(selected, -1))} aria-label="Previous day">←</button>
          <input type="date" value={selected} max={today} min={query.data?.window_start.slice(0, 10)} onChange={(event) => event.target.value && setDate(event.target.value)} aria-label="Selected date" />
          <button onClick={() => setDate(moveDay(selected, 1))} disabled={isToday} aria-label="Next day">→</button>
        </div>
      </header>

      {query.isLoading ? <DashboardSkeleton /> : query.isError ? (
        <div className="empty-state page-x">Perseus could not load this day. Check the local data connection and try again.</div>
      ) : (
        <>
          <section className="insight-ribbon page-x">
            <span className="insight-icon">✦</span>
            <div>
              <p className="eyebrow">Perseus daily read</p>
              <strong>{headline}</strong>
              <p>{storySentence(steps, distance, active, isToday)}</p>
            </div>
            {query.data?.last_sync ? <span className="freshness"><i /> Synced {formatTimeAgo(query.data.last_sync)}</span> : null}
          </section>

          <section className="telemetry-grid page-x" aria-label="Daily movement details">
            <article className="telemetry-card activity-card">
              <CardHeading label="Daily activity" meta={comparison(steps?.change ?? null)} />
              <div className="activity-card-body">
                <ActivityDial steps={steps} />
                <div className="activity-breakdown">
                  <ActivityRow label="Steps" value={steps ? `${formatValue(steps, true)}` : "—"} accent="#a3ff6b" />
                  <ActivityRow label="Distance" value={formatValue(distance)} accent="#4fe3c1" />
                  <ActivityRow label="Active energy" value={active ? `${formatValue(active, true)} kcal` : "—"} accent="#5cb6ff" />
                </div>
              </div>
            </article>

            <article className="telemetry-card metric-summary-card">
              <CardHeading label="Movement quality" meta="Today" />
              <div className="summary-metrics">
                <SummaryMetric label="Walking speed" metric={walkingSpeed} />
                <SummaryMetric label="Basal energy" metric={basal} />
                <SummaryMetric label="Distance" metric={distance} />
                <SummaryMetric label="Active burn" metric={active} />
              </div>
            </article>

            <article className="telemetry-card baseline-card">
              <CardHeading label="Personal baseline" meta="28 days" />
              <div className="baseline-hero">
                <span>Usual daily steps</span>
                <strong>{steps?.baseline == null ? "—" : Math.round(steps.baseline).toLocaleString()}</strong>
              </div>
              <div className="baseline-facts">
                <div><span>Today vs usual</span><strong>{steps?.change == null ? "—" : `${steps.change >= 0 ? "+" : ""}${Math.round(steps.change * 100)}%`}</strong></div>
                <div><span>Recorded days</span><strong>{recordedDays} / 28</strong></div>
              </div>
              <p>Your baseline is your median, so unusually high or low days do not distort it.</p>
            </article>
          </section>

          <RecoveryVitals
            sleep={sleep}
            heartRate={heartRate}
            selected={selected}
            loading={sleepQuery.isLoading}
          />

          <section className="analytics-grid page-x">
            {steps ? <MovementHistory metric={steps} selected={selected} windowStart={query.data!.window_start} /> : null}
            <aside className="telemetry-card day-facts-card">
              <CardHeading label="Day facts" meta={isToday ? "Live" : "Archive"} />
              {CORE_METRICS.map(({ name, label }) => {
                const metric = metrics.get(name);
                if (!metric || metric.value == null) return null;
                return (
                  <div className="day-fact" key={name}>
                    <span>{label}</span>
                    <strong>{formatValue(metric)}</strong>
                    <small>{comparison(metric.change)}</small>
                  </div>
                );
              })}
              <Link to="/metrics" className="facts-link">Open all health metrics →</Link>
            </aside>
          </section>

          <footer className="daily-footer page-x">
            <div><p className="eyebrow">Built from your history</p><p>Baselines use the median of up to 28 recorded days before the selected date.</p></div>
            <Link to="/metrics">Explore every metric <span>↗</span></Link>
          </footer>
        </>
      )}
    </div>
  );
}

function CardHeading({ label, meta }: { label: string; meta: string }) {
  return <div className="card-heading"><span><i />{label}</span><small>{meta}</small></div>;
}

function ActivityRow({ label, value, accent }: { label: string; value: string; accent: string }) {
  return <div className="activity-row"><span><i style={{ background: accent }} />{label}</span><strong>{value}</strong></div>;
}

function SummaryMetric({ label, metric }: { label: string; metric?: DailyMetric }) {
  return <div className="summary-metric"><span>{label}</span><strong>{formatValue(metric)}</strong><small>{metric ? comparison(metric.change) : "No reading"}</small></div>;
}

function RecoveryVitals({
  sleep,
  heartRate,
  selected,
  loading,
}: {
  sleep: SleepSession | null;
  heartRate?: DailyMetric;
  selected: string;
  loading: boolean;
}) {
  const hasHeartReading = heartRate?.value != null;
  if (!sleep && !hasHeartReading && !loading) {
    return (
      <section className="incoming-data page-x">
        <span>◌</span>
        <div><strong>Recovery data is ready to arrive</strong><p>Sleep and manual heart-rate readings will appear here automatically after Health syncs them.</p></div>
      </section>
    );
  }

  return (
    <section className="recovery-grid page-x" aria-label="Recovery and heart rate">
      {sleep ? <SleepOverview session={sleep} /> : loading ? <article className="telemetry-card recovery-loading"><span className="skel" /></article> : null}
      {hasHeartReading ? <HeartRateOverview metric={heartRate!} selected={selected} /> : null}
    </section>
  );
}

function SleepOverview({ session }: { session: SleepSession }) {
  const hours = session.Asleep || session.TotalSleep;
  const efficiency = session.InBed > 0 ? Math.round((session.Asleep / session.InBed) * 100) : null;
  const stages = [
    { label: "Deep", value: session.Deep, color: "#245a45" },
    { label: "REM", value: session.REM, color: "#a3ff6b" },
    { label: "Core", value: session.Core, color: "#4f7569" },
  ].filter((stage) => stage.value > 0);
  const stageTotal = stages.reduce((sum, stage) => sum + stage.value, 0);

  return (
    <article className="telemetry-card sleep-overview-card">
      <CardHeading label="Sleep & recovery" meta={efficiency == null ? "Synced" : `${efficiency}% efficiency`} />
      <div className="sleep-main"><strong>{formatSleepDuration(hours)}</strong><span>{formatClockRange(session.SleepStart, session.SleepEnd)}</span></div>
      {stages.length ? (
        <>
          <div className="sleep-stage-bar">
            {stages.map((stage) => <i key={stage.label} title={`${stage.label}: ${formatSleepDuration(stage.value)}`} style={{ width: `${(stage.value / stageTotal) * 100}%`, background: stage.color }} />)}
          </div>
          <div className="sleep-stage-legend">
            {stages.map((stage) => <div key={stage.label}><span>{stage.label}</span><strong>{formatSleepDuration(stage.value)}</strong></div>)}
          </div>
        </>
      ) : <p className="sleep-note">Total sleep is available; detailed stages have not arrived yet.</p>}
    </article>
  );
}

function HeartRateOverview({ metric, selected }: { metric: DailyMetric; selected: string }) {
  const latestIsSelectedDay = metric.meta.time && localDateKey(new Date(metric.meta.time)) === selected;
  const latest = latestIsSelectedDay && metric.meta.latest != null
    ? metric.meta.latest * (metric.meta.multiplier || 1)
    : metric.value;
  const checkedAt = latestIsSelectedDay
    ? new Date(metric.meta.time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <article className="telemetry-card heart-overview-card">
      <CardHeading label="Heart rate" meta="Manual reading" />
      <div className="heart-reading"><strong>{latest == null ? "—" : Math.round(latest)}</strong><span>bpm</span></div>
      <p>{checkedAt ? `Latest check at ${checkedAt}` : "Daily average from recorded checks"}</p>
      <div className="heart-context">
        <div><span>Day average</span><strong>{metric.value == null ? "—" : `${Math.round(metric.value)} bpm`}</strong></div>
        <div><span>Compared with usual</span><strong>{comparison(metric.change)}</strong></div>
      </div>
    </article>
  );
}

function formatSleepDuration(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

function formatClockRange(start: string, end: string) {
  if (!start || !end) return "Overnight session";
  const format = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${format(start)} → ${format(end)}`;
}

function storySentence(steps: DailyMetric | undefined, distance: DailyMetric | undefined, active: DailyMetric | undefined, isToday: boolean) {
  if (steps?.value == null && distance?.value == null && active?.value == null) {
    return isToday ? "Your bridge has not sent movement for today yet." : "There is no movement data for this date.";
  }
  const parts: string[] = [];
  if (steps?.value != null) parts.push(`${formatValue(steps, true)} steps`);
  if (distance?.value != null) parts.push(formatValue(distance));
  if (active?.value != null) parts.push(`${formatValue(active, true)} active kcal`);
  return `You recorded ${parts.join(", ")}${isToday ? " so far" : ""}.`;
}

function ActivityDial({ steps }: { steps?: DailyMetric }) {
  const ratio = steps?.value != null && steps.baseline ? steps.value / steps.baseline : 0;
  const angle = Math.min(Math.max(ratio, 0), 1) * 300;
  return (
    <div className="activity-dial" style={{ "--dial-angle": `${angle}deg` } as CSSProperties}>
      <div><strong>{steps?.value == null ? "—" : Math.round(steps.value).toLocaleString()}</strong><span>steps</span></div>
      <small>{steps?.baseline ? `${Math.round(ratio * 100)}% of usual` : "building baseline"}</small>
    </div>
  );
}

function MovementHistory({ metric, selected, windowStart }: { metric: DailyMetric; selected: string; windowStart: string }) {
  const index = dayIndex(windowStart, selected);
  const bars = metric.history.slice(Math.max(0, index - 13), index + 1);
  const max = Math.max(...bars.filter((value): value is number => value != null), metric.baseline ?? 1);
  return (
    <section className="telemetry-card history-section">
      <div className="section-heading"><div><p className="eyebrow">Recent rhythm</p><h2>Your last 14 days</h2></div><p>The dotted line is your 28-day median.</p></div>
      <div className="history-chart" role="img" aria-label="Steps over the last fourteen days">
        {metric.baseline != null ? <div className="baseline-line" style={{ bottom: `${Math.min(92, (metric.baseline / max) * 82 + 8)}%` }} /> : null}
        {bars.map((value, offset) => {
          const key = moveDay(selected, offset - bars.length + 1);
          return <div className="day-bar" key={key} title={`${key}: ${value == null ? "no data" : Math.round(value).toLocaleString() + " steps"}`}><i className={offset === bars.length - 1 ? "selected" : ""} style={{ height: value == null ? 2 : `${Math.max(4, (value / max) * 82)}%` }} /><span>{dateFromKey(key).toLocaleDateString(undefined, { weekday: "narrow" })}</span></div>;
        })}
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return <div className="dashboard-skeleton page-x"><span /><span /><span /></div>;
}
