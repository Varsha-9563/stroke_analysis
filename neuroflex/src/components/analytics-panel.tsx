// Recovery report for a chosen period. Used on the patient's "Recovery analytics"
// page and on the doctor's patient profile.
import {
  Area, AreaChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, CalendarCheck, Download, Gauge, HeartPulse, Sparkles, TrendingDown, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";
import type { AxiosResponse } from "axios";
import { EmptyState, LoadingState } from "@/components/ui";
import { saveBlob } from "@/lib/api";

export const PERIODS = [
  { days: 1, label: "Today" },
  { days: 7, label: "1 week" },
  { days: 15, label: "15 days" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
];

type FingerRow = {
  finger: string; start_rom: number; end_rom: number; change: number; status?: string; pct_of_healthy?: number;
};
type Forecast = {
  method: string;
  fit_quality?: number;
  day_now?: number;
  predicted_in_30_days?: number;
  predicted_in_90_days?: number;
  plateau?: number | null;
  target?: number;
  target_day?: number | null;
  days_to_target?: number | null;
  target_date?: string | null;
  status?: string;
  message?: string;
  curve?: { day: number; date: string; predicted: number; future: boolean }[];
};
type HealthyRef = { people: number; recordings: number; based_on: string; recovery_score: number };
export type Analytics = {
  period_days: number;
  period_label: string;
  sessions_count: number;
  trend: { date: string; recovery_percent: number; day: number }[];
  days_since_first_session: number | null;
  rate_per_week: number | null;
  days_to_target: number | null;
  adherence: { days_done: number; days_in_period: number; percent: number; exercises_done: number };
  first_score: number | null;
  last_score: number | null;
  score_change: number | null;
  average_score: number | null;
  best_score: number | null;
  fingers: FingerRow[];
  most_improved: string | null;
  needs_focus: string | null;
  summary: string[];
  group?: string;
  healthy_reference?: HealthyRef | null;
  pct_of_healthy?: Record<string, number> | null;
  forecast?: Forecast | null;
};

type FileInfo = { file: string; rows: number; updated: string | null };
export type CsvSource = {
  info: () => Promise<AxiosResponse<{ sessions: FileInfo; readings: FileInfo }>>;
  download: (kind: "sessions" | "readings") => Promise<AxiosResponse<Blob>>;
};

const cap = (s: string) => (s === "little" ? "Pinky" : s.charAt(0).toUpperCase() + s.slice(1));

export function AnalyticsPanel({
  load,
  initialDays = 30,
  refreshKey = 0,
  csv,
}: {
  load: (days: number) => Promise<AxiosResponse<Analytics>>;
  initialDays?: number;
  refreshKey?: number;
  csv?: CsvSource;
}) {
  const [days, setDays] = useState(initialDays);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<{ sessions: FileInfo; readings: FileInfo } | null>(null);

  useEffect(() => {
    csv?.info().then((r) => setFiles(r.data)).catch(() => setFiles(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function download(kind: "sessions" | "readings") {
    if (!csv) return;
    try {
      const r = await csv.download(kind);
      saveBlob(r.data, files?.[kind].file ?? `${kind}.csv`);
    } catch {
      setError("No recordings saved yet, so there is no file to download.");
    }
  }

  useEffect(() => {
    setLoading(true);
    setError("");
    load(days)
      .then((r) => setData(r.data))
      .catch(() => setError("The recovery report could not be loaded."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, refreshKey]);

  const sameDay = days === 1;
  const chart =
    data?.trend.map((t) => ({
      date: sameDay
        ? new Date(t.date).toLocaleString("en-IN", { hour: "numeric", minute: "2-digit" })
        : `Day ${t.day}`,
      when: new Date(t.date).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
      pct: Number(t.recovery_percent.toFixed(1)),
    })) ?? [];
  const change = data?.score_change;
  const fc = data?.forecast && data.forecast.curve ? data.forecast : null;
  const actualPts = data?.trend.map((t) => ({ day: t.day, pct: Number(t.recovery_percent.toFixed(1)) })) ?? [];
  const firstDay = actualPts[0]?.day ?? 0;
  const forecastPts = fc?.curve?.filter((c) => c.day >= firstDay - 0.5) ?? [];
  const showForecast = !sameDay && !!fc && actualPts.length > 0;
  const healthyPct = data?.pct_of_healthy?.["overall"];
  const isHealthy = data?.group === "healthy";

  return (
    <section className="panel analytics-panel">
      <div className="panel-heading">
        <div>
          <p className="overline">Recovery report</p>
          <h2>{data?.period_label ?? "Recovery analytics"}</h2>
        </div>
        <div className="period-tabs" role="tablist" aria-label="Report period">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              role="tab"
              aria-selected={days === p.days}
              className={days === p.days ? "active" : ""}
              onClick={() => setDays(p.days)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}
      {loading && !data ? (
        <LoadingState label="Building the recovery report" />
      ) : data ? (
        <div className={`analytics-body ${loading ? "is-loading" : ""}`}>
          <div className="metric-grid">
            <article>
              <Activity />
              <span>Glove sessions</span>
              <strong>{data.sessions_count}</strong>
              <small>{sameDay ? "recorded today" : `in the ${data.period_label.toLowerCase()}`}</small>
            </article>
            <article>
              {change != null && change < 0 ? <TrendingDown /> : <TrendingUp />}
              <span>Score change</span>
              <strong className={change == null ? "" : change >= 0 ? "delta-up" : "delta-down"}>
                {change == null ? "—" : `${change > 0 ? "+" : ""}${change}`}
              </strong>
              <small>
                {data.first_score != null && data.last_score != null
                  ? `${data.first_score}% → ${data.last_score}%`
                  : "Needs 2 sessions"}
              </small>
            </article>
            <article>
              <Activity />
              <span>Average score</span>
              <strong>{data.average_score == null ? "—" : `${Math.round(data.average_score)}%`}</strong>
              <small>{data.best_score == null ? "No readings" : `Best ${data.best_score}%`}</small>
            </article>
            {data.healthy_reference && !isHealthy && (
              <article>
                <Users />
                <span>Vs healthy hand</span>
                <strong>{healthyPct == null ? "—" : `${Math.round(healthyPct)}%`}</strong>
                <small>range of motion vs {data.healthy_reference.people} healthy volunteers</small>
              </article>
            )}
            <article>
              <Gauge />
              <span>Recovery speed</span>
              <strong className={data.rate_per_week == null ? "" : data.rate_per_week >= 0 ? "delta-up" : "delta-down"}>
                {data.rate_per_week == null ? "—" : `${data.rate_per_week > 0 ? "+" : ""}${data.rate_per_week}`}
              </strong>
              <small>
                {data.rate_per_week == null
                  ? "Needs 3 sessions on different days"
                  : `points / week · day ${data.days_since_first_session} of rehab`}
              </small>
            </article>
            <article>
              <CalendarCheck />
              <span>Exercise adherence</span>
              <strong>{sameDay ? data.adherence.exercises_done : `${data.adherence.percent}%`}</strong>
              <small>
                {sameDay
                  ? "exercises ticked today"
                  : `${data.adherence.days_done} of ${data.adherence.days_in_period} days`}
              </small>
            </article>
          </div>

          {isHealthy ? (
            <div className="forecast-card healthy">
              <HeartPulse size={18} />
              <div>
                <strong>Healthy volunteer</strong>
                <p>These recordings are part of the healthy reference that patients are compared with.</p>
              </div>
            </div>
          ) : fc && fc.predicted_in_30_days != null ? (
            <div className={`forecast-card status-${(fc.status ?? "").replace(/ /g, "-")}`}>
              <Sparkles size={18} />
              <div className="forecast-main">
                <p className="overline">Recovery prediction · day {fc.day_now} of rehab</p>
                <strong>{fc.message}</strong>
                <p className="muted-text">
                  Fitted to all of this patient's glove sessions ({fc.method}, fit{" "}
                  {Math.round((fc.fit_quality ?? 0) * 100)}%). Updates with every new recording. An estimate, not a diagnosis.
                </p>
              </div>
              <div className="forecast-nums">
                <div><span>In 30 days</span><strong>{Math.round(fc.predicted_in_30_days)}%</strong></div>
                <div><span>In 90 days</span><strong>{Math.round(fc.predicted_in_90_days ?? 0)}%</strong></div>
                <div>
                  <span>{fc.plateau != null ? "Levelling at" : "Target"}</span>
                  <strong>{fc.plateau != null ? `${Math.round(fc.plateau)}%` : `${fc.target}%`}</strong>
                </div>
              </div>
            </div>
          ) : fc?.message ? (
            <div className="forecast-card"><Sparkles size={18} /><div><strong>{fc.message}</strong></div></div>
          ) : null}

          <div className="analytics-grid">
            <div className="analytics-chart">
              <p className="overline">Recovery score {sameDay ? "today" : "by day of rehab"}</p>
              {showForecast && (
                <div className="chart-legend">
                  <span><i className="sw-actual" /> Recorded</span>
                  <span><i className="sw-forecast" /> Predicted (next 90 days)</span>
                </div>
              )}
              {showForecast ? (
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="day" type="number" domain={["dataMin", "dataMax"]} tickLine={false}
                           axisLine={false} fontSize={12} tickFormatter={(d) => `Day ${Math.round(d)}`}
                           allowDuplicatedCategory={false} />
                    <YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} fontSize={12} />
                    <Tooltip
                      labelFormatter={(d) => `Day ${Math.round(Number(d))}`}
                      formatter={(v, name) => [`${v}%`, name === "pct" ? "Recorded" : "Predicted"]}
                    />
                    <ReferenceLine y={fc?.target ?? 85} stroke="var(--ink-soft)" strokeDasharray="2 4"
                                   label={{ value: `Target ${fc?.target ?? 85}%`, position: "insideTopLeft", fontSize: 11, fill: "var(--ink-soft)" }} />
                    <ReferenceLine x={fc?.day_now ?? 0} stroke="var(--line)"
                                   label={{ value: "Today", position: "insideTopRight", fontSize: 11, fill: "var(--ink-soft)" }} />
                    <Area data={actualPts} dataKey="pct" type="monotone" stroke="var(--teal)" strokeWidth={2.5}
                          fill="var(--teal)" fillOpacity={0.08} dot={actualPts.length <= 14} isAnimationActive={false} />
                    <Line data={forecastPts} dataKey="predicted" type="monotone" stroke="var(--navy-900)"
                          strokeWidth={1.75} strokeDasharray="6 5" dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : chart.length > 1 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={chart} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`an-${days}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="var(--teal)" stopOpacity={0.22} />
                        <stop offset="1" stopColor="var(--teal)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} fontSize={12} />
                    <YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} fontSize={12} />
                    <Tooltip
                      formatter={(v) => [`${v}%`, "Recovery"]}
                      labelFormatter={(l, p) => (p?.[0]?.payload?.when ? `${l} · ${p[0].payload.when}` : l)}
                    />
                    <Area type="monotone" dataKey="pct" stroke="var(--teal)" strokeWidth={2.5}
                          fill={`url(#an-${days})`} dot={chart.length <= 12} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState icon={<Activity />} title={chart.length ? "One session so far" : "No sessions in this period"}>
                  {sameDay
                    ? "Record a glove session before and after exercising to compare them here."
                    : "A trend appears once there are at least two sessions in the period."}
                </EmptyState>
              )}
            </div>

            <div className="analytics-insights">
              <p className="overline">Key insights</p>
              <ul>
                {data.summary.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </div>

          {data.fingers.length > 0 && (
            <div className={`finger-table ${data.fingers.some((f) => f.pct_of_healthy != null) ? "with-healthy" : ""}`}
                 role="table" aria-label="Range of motion by finger">
              <div className="finger-table-row head" role="row">
                <span>Finger</span>
                <span>Start of period</span>
                <span>Now</span>
                <span>Change</span>
                {data.fingers.some((f) => f.pct_of_healthy != null) && <span>% of healthy</span>}
                <span>Status</span>
              </div>
              {data.fingers.map((f) => (
                <div key={f.finger} className="finger-table-row" role="row">
                  <strong>
                    {cap(f.finger)}
                    {f.finger === data.most_improved && <em className="tag-good">Most improved</em>}
                    {f.finger === data.needs_focus && <em className="tag-focus">Focus</em>}
                  </strong>
                  <span>{f.start_rom}°</span>
                  <span>{f.end_rom}°</span>
                  <span className={f.change > 0 ? "delta-up" : f.change < 0 ? "delta-down" : ""}>
                    {data.sessions_count > 1 ? `${f.change > 0 ? "+" : ""}${f.change}°` : "—"}
                  </span>
                  {f.pct_of_healthy != null && (
                    <span className="healthy-cell">
                      <i style={{ width: `${Math.min(f.pct_of_healthy, 100)}%` }} />
                      <b>{Math.round(f.pct_of_healthy)}%</b>
                    </span>
                  )}
                  <span>{f.status ? <span className={`status-badge finger-${f.status}`}>{f.status}</span> : "—"}</span>
                </div>
              ))}
            </div>
          )}
          {csv && (
            <div className="csv-row">
              <div>
                <p className="overline">Data files (CSV)</p>
                <p className="muted-text">
                  Every glove recording is added to these files automatically.
                  {files && ` ${files.sessions.rows} sessions · ${files.readings.rows.toLocaleString("en-IN")} sensor readings so far.`}
                </p>
              </div>
              <div className="csv-buttons">
                <button className="button button-secondary" onClick={() => download("sessions")}>
                  <Download size={16} /> Sessions CSV
                </button>
                <button className="button button-secondary" onClick={() => download("readings")}>
                  <Download size={16} /> Raw readings CSV
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
