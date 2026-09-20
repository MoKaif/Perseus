import { useQuery } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchSleep, type SleepSession, type SleepStage } from "../api";
import PageHeader from "../components/PageHeader";
import RangeControl from "../components/RangeControl";
import Hypnogram, { hourTicks } from "../components/sleep/Hypnogram";
import NightsChart from "../components/sleep/NightsChart";
import StageComposition, {
  type StageTotals,
} from "../components/sleep/StageComposition";
import { useIsDesktop } from "../hooks/useMediaQuery";
import {
  formatClock,
  formatDayMonth,
  formatHoursMinutes,
} from "../utils/format";
import { stageColor } from "../utils/stageColors";
import {
  hasDetailedSleepData,
  previousSleepMedian,
} from "../utils/sleepPresentation";
import { queryMessage, queryState } from "../utils/queryState";

const RANGES = ["7d", "30d", "90d"] as const;
type Range = (typeof RANGES)[number];

const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };

export default function SleepPage() {
  const isDesktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const range = (params.get("range") as Range) ?? "30d";

  const days = RANGE_DAYS[range];
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const endISO = end.toISOString().split("T")[0];
  const startISO = start.toISOString().split("T")[0];

  const query = useQuery({
    queryKey: ["sleep", startISO, endISO],
    queryFn: () => fetchSleep(startISO, endISO),
  });
  const state = queryState(query);
  const message = queryMessage(state, query.error);

  const sessions = query.data?.sessions ?? [];
  const stages = query.data?.stages ?? [];

  // The API returns newest first; the last night is the summary's subject.
  const last = sessions.length > 0 ? sessions[0] : null;

  const lastNightStages = useMemo(
    () => (last ? stagesForSession(stages, last) : []),
    [stages, last],
  );

  const totals = useMemo(() => stageTotals(lastNightStages), [lastNightStages]);
  const hasStageDetail = last
    ? hasDetailedSleepData(lastNightStages, last)
    : false;
  const baseline = last ? previousSleepMedian(sessions, last.Date) : null;
  const sleepSource = useMemo(() => {
    const sources = [
      ...new Set(lastNightStages.map((stage) => stage.Source).filter(Boolean)),
    ];
    return sources.length === 1 ? sources[0] : null;
  }, [lastNightStages]);

  const setRange = (next: Range) => {
    const p = new URLSearchParams(params);
    p.set("range", next);
    setParams(p, { replace: true });
  };

  const averageHours =
    sessions.length > 0
      ? sessions.reduce((a, s) => a + s.TotalSleep, 0) / sessions.length
      : null;

  const awakenings = lastNightStages.filter((s) => s.Stage === "Awake").length;

  return (
    <>
      <PageHeader
        kicker={
          last
            ? `Last night — ${new Date(last.Date).toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}`
            : "No sleep recorded"
        }
        title="Sleep"
        actions={
          <RangeControl
            options={RANGES}
            value={range}
            onChange={setRange}
            name="sleep-range"
          />
        }
      />

      {message ? (
        <p
          className="page-x"
          style={{ color: "var(--color-neutral-600)", fontSize: 13 }}
        >
          {message}
        </p>
      ) : state === "loading" ? (
        <div
          className="page-x"
          style={{ borderTop: "2px solid var(--color-text)", paddingTop: 24 }}
        >
          <span className="skel" style={{ width: 180, height: 44 }} />
        </div>
      ) : !last ? (
        <p
          className="page-x"
          style={{ color: "var(--color-neutral-600)", fontSize: 13 }}
        >
          No sleep sessions in this window.
        </p>
      ) : isDesktop ? (
        <DesktopSleep
          session={last}
          stages={lastNightStages}
          totals={totals}
          sessions={sessions}
          allStages={stages}
          averageHours={averageHours}
          awakenings={awakenings}
          hasStageDetail={hasStageDetail}
          baseline={baseline}
          source={sleepSource}
        />
      ) : (
        <MobileSleep
          session={last}
          stages={lastNightStages}
          totals={totals}
          sessions={sessions}
          hasStageDetail={hasStageDetail}
          baseline={baseline}
          source={sleepSource}
        />
      )}
    </>
  );
}

function DesktopSleep({
  session,
  stages,
  totals,
  sessions,
  allStages,
  averageHours,
  awakenings,
  hasStageDetail,
  baseline,
  source,
}: {
  session: SleepSession;
  stages: SleepStage[];
  totals: StageTotals;
  sessions: SleepSession[];
  allStages: SleepStage[];
  averageHours: number | null;
  awakenings: number;
  hasStageDetail: boolean;
  baseline: { hours: number; nights: number } | null;
  source: string | null;
}) {
  if (!hasStageDetail) {
    return (
      <DurationOnlyDesktop
        session={session}
        sessions={sessions}
        stages={allStages}
        baseline={baseline}
        source={source}
      />
    );
  }

  const efficiency =
    session.InBed > 0 ? (session.Asleep / session.InBed) * 100 : null;
  const ticks = hourTicks(stages);

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          borderTop: "2px solid var(--color-text)",
          borderBottom: "2px solid var(--color-text)",
        }}
      >
        <HeroCell
          label="Total sleep"
          value={formatHoursMinutes(session.TotalSleep)}
          meta={
            averageHours != null
              ? `${formatHoursMinutes(averageHours)} on average`
              : ""
          }
        />
        <HeroCell
          label="Time in bed"
          value={formatHoursMinutes(session.InBed)}
          meta={`${formatClock(session.InBedStart)} → ${formatClock(session.InBedEnd)}`}
        />
        <HeroCell
          label="Efficiency"
          value={efficiency != null ? `${efficiency.toFixed(0)}%` : "—"}
          meta={`${formatHoursMinutes(totals.Awake)} awake`}
        />
        <HeroCell
          label="Deep"
          value={formatHoursMinutes(totals.Deep)}
          meta={pctOf(totals.Deep, session.TotalSleep)}
        />
        <HeroCell
          label="REM"
          value={formatHoursMinutes(totals.REM)}
          meta={pctOf(totals.REM, session.TotalSleep)}
        />
      </div>

      <Section title="Stage composition">
        <StageComposition totals={totals} />
      </Section>

      <Section
        title="Hypnogram"
        aside={`${formatClock(session.SleepStart)} → ${formatClock(session.SleepEnd)} · ${awakenings} awakening${awakenings === 1 ? "" : "s"}`}
      >
        <Hypnogram stages={stages} />
        <div style={{ position: "relative", height: 20, marginLeft: 52 }}>
          {ticks.map((t) => (
            <span
              key={t.pct}
              className="num"
              style={{
                position: "absolute",
                left: `${t.pct}%`,
                transform: "translateX(-50%)",
                font: "400 11px var(--font-body)",
                color: "var(--color-neutral-600)",
              }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </Section>

      <Section
        title={`Last ${sessions.length} nights`}
        aside={
          averageHours != null ? (
            <>
              {formatDayMonth(new Date(sessions[sessions.length - 1].Date))} –{" "}
              {formatDayMonth(new Date(sessions[0].Date))} · average{" "}
              <span style={{ fontWeight: 700, color: "var(--color-text)" }}>
                {formatHoursMinutes(averageHours)}
              </span>
            </>
          ) : null
        }
      >
        <NightsChart sessions={sessions} stages={allStages} />
      </Section>
    </>
  );
}

function MobileSleep({
  session,
  stages,
  totals,
  sessions,
  hasStageDetail,
  baseline,
  source,
}: {
  session: SleepSession;
  stages: SleepStage[];
  totals: StageTotals;
  sessions: SleepSession[];
  hasStageDetail: boolean;
  baseline: { hours: number; nights: number } | null;
  source: string | null;
}) {
  if (!hasStageDetail) {
    return (
      <DurationOnlyMobile
        session={session}
        sessions={sessions}
        baseline={baseline}
        source={source}
      />
    );
  }

  const efficiency =
    session.InBed > 0 ? (session.Asleep / session.InBed) * 100 : null;
  const latency =
    (new Date(session.SleepStart).getTime() -
      new Date(session.InBedStart).getTime()) /
    60000;

  return (
    <>
      <div className="page-x" style={{ paddingBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span
            className="num"
            style={{
              font: "800 44px/1 var(--font-heading)",
              letterSpacing: "-0.035em",
            }}
          >
            {formatHoursMinutes(session.TotalSleep)}
          </span>
          <span
            style={{
              font: "500 13px var(--font-body)",
              color: "var(--color-neutral-600)",
            }}
          >
            in bed {formatHoursMinutes(session.InBed)}
            {efficiency != null ? ` · ${efficiency.toFixed(0)}% eff.` : ""}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          borderTop: "2px solid var(--color-text)",
          borderBottom: "2px solid var(--color-text)",
        }}
      >
        <MobileStat label="Deep" value={formatHoursMinutes(totals.Deep)} />
        <MobileStat
          label="Efficiency"
          value={efficiency != null ? `${efficiency.toFixed(0)}%` : "—"}
        />
        <MobileStat
          label="Latency"
          value={latency > 0 ? `${Math.round(latency)}m` : "—"}
        />
      </div>

      <div className="kick page-x" style={{ paddingTop: 16, paddingBottom: 6 }}>
        Hypnogram · {formatClock(session.SleepStart)} →{" "}
        {formatClock(session.SleepEnd)}
      </div>
      <div className="page-x" style={{ paddingBottom: 14 }}>
        <Hypnogram stages={stages} compact />
      </div>

      <div className="page-x" style={{ paddingBottom: 16 }}>
        <StageComposition totals={totals} compact />
      </div>

      <div
        className="kick page-x"
        style={{
          borderTop: "2px solid var(--color-text)",
          paddingTop: 12,
          paddingBottom: 6,
        }}
      >
        Last {Math.min(sessions.length, 10)} nights
      </div>
      <div>
        {sessions.slice(0, 10).map((s) => (
          <NightRow key={s.Date} session={s} />
        ))}
      </div>
    </>
  );
}

function DurationOnlyDesktop({
  session,
  sessions,
  stages,
  baseline,
  source,
}: {
  session: SleepSession;
  sessions: SleepSession[];
  stages: SleepStage[];
  baseline: { hours: number; nights: number } | null;
  source: string | null;
}) {
  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          borderTop: "2px solid var(--color-text)",
          borderBottom: "2px solid var(--color-text)",
        }}
      >
        <HeroCell
          label="Total sleep"
          value={formatHoursMinutes(session.TotalSleep)}
          meta={baselineComparison(session.TotalSleep, baseline)}
        />
        <HeroCell
          label="Fell asleep"
          value={formatClock(session.SleepStart)}
          meta="sleep window start"
        />
        <HeroCell
          label="Woke up"
          value={formatClock(session.SleepEnd)}
          meta="sleep window end"
        />
        <HeroCell
          label="Typical night"
          value={baseline ? formatHoursMinutes(baseline.hours) : "—"}
          meta={
            baseline
              ? `median of ${baseline.nights} previous nights`
              : "building your baseline"
          }
        />
      </div>

      <DurationOnlyNotice source={source} />

      <Section
        title="Sleep window"
        aside={`${formatClock(session.SleepStart)} → ${formatClock(session.SleepEnd)}`}
      >
        <SleepWindow session={session} />
      </Section>

      <Section
        title={`Last ${sessions.length} nights`}
        aside={`${sessions.length} recorded night${sessions.length === 1 ? "" : "s"} · duration and schedule`}
      >
        <NightsChart sessions={sessions} stages={stages} />
      </Section>
    </>
  );
}

function DurationOnlyMobile({
  session,
  sessions,
  baseline,
  source,
}: {
  session: SleepSession;
  sessions: SleepSession[];
  baseline: { hours: number; nights: number } | null;
  source: string | null;
}) {
  return (
    <>
      <div className="page-x" style={{ paddingBottom: 16 }}>
        <div
          className="num"
          style={{
            font: "800 44px/1 var(--font-heading)",
            letterSpacing: "-0.035em",
          }}
        >
          {formatHoursMinutes(session.TotalSleep)}
        </div>
        <div
          style={{
            marginTop: 9,
            color: "var(--color-neutral-600)",
            font: "500 13px var(--font-body)",
          }}
        >
          {formatClock(session.SleepStart)} → {formatClock(session.SleepEnd)} ·{" "}
          {baselineComparison(session.TotalSleep, baseline)}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          borderTop: "2px solid var(--color-text)",
          borderBottom: "2px solid var(--color-text)",
        }}
      >
        <MobileStat label="Asleep" value={formatClock(session.SleepStart)} />
        <MobileStat label="Awake" value={formatClock(session.SleepEnd)} />
        <MobileStat
          label="Typical"
          value={baseline ? formatHoursMinutes(baseline.hours) : "—"}
        />
      </div>

      <DurationOnlyNotice source={source} compact />

      <div className="kick page-x" style={{ paddingTop: 8, paddingBottom: 8 }}>
        Sleep window
      </div>
      <div className="page-x" style={{ paddingBottom: 22 }}>
        <SleepWindow session={session} />
      </div>

      <div
        className="kick page-x"
        style={{
          borderTop: "2px solid var(--color-text)",
          paddingTop: 12,
          paddingBottom: 6,
        }}
      >
        Last {Math.min(sessions.length, 10)} nights · duration only
      </div>
      <div>
        {sessions.slice(0, 10).map((night) => (
          <NightRow key={night.Date} session={night} />
        ))}
      </div>
    </>
  );
}

function DurationOnlyNotice({
  source,
  compact = false,
}: {
  source: string | null;
  compact?: boolean;
}) {
  return (
    <div
      className="page-x"
      style={{
        marginTop: compact ? 14 : 18,
        marginBottom: compact ? 14 : 0,
      }}
    >
      <div
        style={{
          padding: compact ? "12px 14px" : "14px 16px",
          border: "1px solid var(--color-divider)",
          background: "var(--color-surface)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 9,
            height: 9,
            flex: "none",
            borderRadius: "50%",
            background: "var(--color-neutral-500)",
          }}
        />
        <div style={{ lineHeight: 1.45 }}>
          <strong style={{ fontSize: 12.5 }}>Duration only</strong>
          <span style={{ color: "var(--color-neutral-600)", fontSize: 12 }}>
            {" · "}
            {source ? `${source} did` : "This device did"} not provide Core,
            Deep, or REM stages. Perseus is tracking duration and schedule
            without estimating them.
          </span>
        </div>
      </div>
    </div>
  );
}

function SleepWindow({ session }: { session: SleepSession }) {
  return (
    <div>
      <div
        style={{
          height: 28,
          border: "2px solid var(--color-text)",
          background: "var(--color-neutral-700)",
        }}
        role="img"
        aria-label={`Asleep from ${formatClock(session.SleepStart)} until ${formatClock(
          session.SleepEnd,
        )}`}
        title={`${formatHoursMinutes(session.TotalSleep)} asleep · stages unavailable`}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
          color: "var(--color-neutral-600)",
          font: "500 11px var(--font-body)",
        }}
      >
        <span>{formatClock(session.SleepStart)}</span>
        <span>Asleep · stages unavailable</span>
        <span>{formatClock(session.SleepEnd)}</span>
      </div>
    </div>
  );
}

function baselineComparison(
  currentHours: number,
  baseline: { hours: number; nights: number } | null,
): string {
  if (!baseline) return "building your baseline";
  const minutes = Math.round((currentHours - baseline.hours) * 60);
  if (Math.abs(minutes) < 10) return "close to your recent baseline";
  return `${formatMinutes(Math.abs(minutes))} ${
    minutes > 0 ? "above" : "below"
  } your recent baseline`;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function NightRow({ session }: { session: SleepSession }) {
  const detailedSegments = (
    [
      ["Deep", session.Deep],
      ["REM", session.REM],
      ["Core", session.Core],
    ] as const
  ).filter(([, v]) => v > 0);
  const segments =
    detailedSegments.length > 0
      ? detailedSegments
      : [["Asleep", session.TotalSleep] as const];
  const total = segments.reduce((a, [, v]) => a + v, 0) || 1;

  return (
    <div className="row" style={{ paddingTop: 10, paddingBottom: 10 }}>
      <span style={{ font: "500 13px var(--font-body)", width: 44, flex: "none" }}>
        {new Date(session.Date).toLocaleDateString("en-GB", {
          weekday: "short",
        })}
      </span>
      <div style={{ flex: 1, display: "flex", height: 12 }}>
        {segments.map(([stage, value]) => (
          <div
            key={stage}
            style={{ flex: value / total, background: stageColor(stage) }}
          />
        ))}
      </div>
      <span
        className="num"
        style={{
          font: "600 13px var(--font-body)",
          width: 46,
          textAlign: "right",
          flex: "none",
        }}
      >
        {formatHoursMinutes(session.TotalSleep)}
      </span>
    </div>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ borderTop: "2px solid var(--color-text)", marginTop: 26 }}>
      <div
        className="flex items-baseline justify-between gap-5 page-x"
        style={{ paddingTop: 20, paddingBottom: 16 }}
      >
        <h2 style={{ fontSize: 19, fontWeight: 700 }}>{title}</h2>
        {aside ? (
          <span
            style={{
              font: "400 12px var(--font-body)",
              color: "var(--color-neutral-600)",
            }}
          >
            {aside}
          </span>
        ) : null}
      </div>
      <div className="page-x" style={{ paddingBottom: 30 }}>
        {children}
      </div>
    </div>
  );
}

function HeroCell({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <div
      className="page-x"
      style={{
        paddingTop: 24,
        paddingBottom: 22,
        borderRight: "1px solid var(--color-divider)",
      }}
    >
      <div className="kick">{label}</div>
      <div
        className="num"
        style={{
          font: "800 44px/1 var(--font-heading)",
          letterSpacing: "-0.035em",
          marginTop: 14,
        }}
      >
        {value}
      </div>
      <div
        style={{
          font: "400 12px var(--font-body)",
          color: "var(--color-neutral-600)",
          marginTop: 12,
        }}
      >
        {meta}
      </div>
    </div>
  );
}

function MobileStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="page-x"
      style={{
        paddingTop: 12,
        paddingBottom: 12,
        borderRight: "1px solid var(--color-divider)",
      }}
    >
      <div className="kick">{label}</div>
      <div
        className="num"
        style={{
          font: "700 22px/1 var(--font-heading)",
          letterSpacing: "-0.02em",
          marginTop: 8,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function pctOf(part: number, whole: number): string {
  if (whole <= 0) return "";
  return `${((part / whole) * 100).toFixed(0)}% of sleep`;
}

function stagesForSession(
  stages: SleepStage[],
  session: SleepSession,
): SleepStage[] {
  const from = new Date(session.SleepStart).getTime();
  const to = new Date(session.SleepEnd).getTime();
  return stages.filter((s) => {
    const t = new Date(s.StartTime).getTime();
    return t >= from && t < to;
  });
}

function stageTotals(stages: SleepStage[]): StageTotals {
  const totals: StageTotals = { Deep: 0, Core: 0, REM: 0, Awake: 0 };
  for (const s of stages) {
    if (s.Stage in totals) {
      totals[s.Stage as keyof StageTotals] += s.DurationHr;
    }
  }
  return totals;
}
