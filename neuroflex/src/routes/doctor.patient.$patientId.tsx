import { createFileRoute, Link } from "@tanstack/react-router";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, BrainCircuit, CalendarDays, Check, ClipboardPlus, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, LoadingState } from "@/components/ui";
import { dischargePatient, getAllExercises, getPatientStreaks, getPatientSummary, recommendExercises } from "@/lib/api";

const FINGERS = ["thumb", "index", "middle", "ring", "pinky"] as const;

type Exercise = { id: number; name: string; description?: string; target_fingers: string };
type Summary = {
  patient_id?: number;
  patient_name?: string;
  full_name?: string;
  status?: string;
  doctor_name?: string;
  recovery_percent: number | null;
  weakest_finger: string | null;
  history?: { date: string; recovery_percent: number; per_finger?: Record<string, number> }[];
  per_finger?: Record<string, number> | null;
  recommended_exercise_names?: string[];
  current_exercise_ids?: number[];
  current_notes?: string;
};
type Streak = { date: string; completed: boolean };

// "2026-09-27" -> local date (avoids the UTC off-by-one-day problem)
const localDay = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toDateString();
const fingerLabel = (f: string) => (f === "pinky" ? "Little" : f.charAt(0).toUpperCase() + f.slice(1));

export const Route = createFileRoute("/doctor/patient/$patientId")({
  head: () => ({
    meta: [
      { title: "Patient recovery profile — NeuroFlex" },
      { name: "description", content: "Review a patient’s recovery trend, finger movement analysis, and exercise plan." },
      { property: "og:title", content: "Patient recovery profile — NeuroFlex" },
      { property: "og:description", content: "Detailed AI-assisted movement analysis and rehabilitation planning." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PatientDetail,
});

function PatientDetail() {
  const { patientId } = Route.useParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<{ type: string; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, t, e] = await Promise.all([getPatientSummary(patientId), getPatientStreaks(patientId), getAllExercises()]);
      setSummary(s.data);
      setStreaks(t.data);
      setExercises(e.data);
      // start from the plan that is already saved
      setSelected(s.data.current_exercise_ids ?? []);
      setNotes(s.data.current_notes ?? "");
    } catch {
      setNotice({ type: "error", text: "Patient recovery data is unavailable right now." });
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  function notify(type: string, text: string) {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  }

  async function savePlan() {
    if (!selected.length) return notify("error", "Select at least one exercise.");
    setSaving(true);
    try {
      await recommendExercises({ patient_id: parseInt(patientId), exercise_ids: selected, notes });
      setSummary((s) => (s ? { ...s, current_exercise_ids: selected, current_notes: notes } : s));
      notify("success", "Exercise plan saved. The patient can now see it.");
    } catch {
      notify("error", "The exercise plan could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    notify("info", "Movement analysis refreshed.");
  }

  async function discharge() {
    if (!window.confirm("Mark this patient as recovered and send the discharge notification?")) return;
    try {
      await dischargePatient({ patient_id: parseInt(patientId) });
      await load();
      notify("success", "Patient marked as recovered and the discharge notification was sent.");
    } catch {
      notify("error", "The recovery status could not be updated.");
    }
  }

  const suggestedNames = summary?.recommended_exercise_names ?? [];
  const suggestedIds = exercises.filter((ex) => suggestedNames.includes(ex.name)).map((ex) => ex.id);
  const savedIds = summary?.current_exercise_ids ?? [];
  const unsaved =
    selected.length !== savedIds.length ||
    selected.some((id) => !savedIds.includes(id)) ||
    notes !== (summary?.current_notes ?? "");

  const days = useMemo(() => {
    const done = new Set(streaks.filter((s) => s.completed).map((s) => localDay(s.date)));
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      return { date: d.toDateString(), done: done.has(d.toDateString()) };
    });
  }, [streaks]);

  if (loading) return <LoadingState label="Loading patient recovery profile" />;

  const hasAnalysis = !!summary && summary.recovery_percent !== null && summary.recovery_percent !== undefined;
  const recovered = summary?.status === "recovered";
  const chart =
    summary?.history?.map((h) => ({
      date: new Date(h.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
      pct: Number(h.recovery_percent.toFixed(1)),
    })) ?? [];
  const fingerData = FINGERS.map((f) => ({
    finger: fingerLabel(f),
    value: Math.round((summary?.per_finger?.[f] ?? 0) * 100),
    raw: f,
  }));
  const baseline = summary?.history?.[0]?.per_finger;

  return (
    <div className="workspace-page detail-page">
      <Link to="/doctor" className="back-link">
        <ArrowLeft /> Back to patients
      </Link>
      {notice && (
        <div className={`notice ${notice.type}`}>
          {notice.type === "success" && <Check />}
          {notice.text}
        </div>
      )}

      <header className="workspace-header detail-header">
        <div>
          <span className="eyebrow">Patient recovery profile</span>
          <h1>{summary?.patient_name || summary?.full_name || `Patient NF-${patientId.padStart(4, "0")}`}</h1>
          <p>
            <span>ID: NF-{patientId.padStart(4, "0")}</span>
            <span>{recovered ? "Recovered" : "Active recovery"}</span>
            <span>{summary?.doctor_name || "Assigned to your care"}</span>
          </p>
        </div>
        <div className="header-actions">
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? "spin" : ""} />
            {refreshing ? "Refreshing" : "Refresh analysis"}
          </Button>
          <Button variant="danger" onClick={discharge} disabled={recovered}>
            <Check /> {recovered ? "Marked recovered" : "Mark recovered"}
          </Button>
        </div>
      </header>

      {!hasAnalysis ? (
        <section className="panel">
          <EmptyState icon={<BrainCircuit />} title="No movement analysis yet">
            Recovery analysis will appear after smart-glove sensor readings are available.
          </EmptyState>
        </section>
      ) : (
        <>
          <section className="clinical-overview">
            <article className="score-panel">
              <div className="score-ring" style={{ "--score": `${summary!.recovery_percent}%` } as React.CSSProperties}>
                <div>
                  <strong>{Math.round(summary!.recovery_percent!)}%</strong>
                  <span>Overall recovery</span>
                </div>
              </div>
              <div>
                <span className="eyebrow">AI-assisted insight</span>
                <h2>Movement analysis</h2>
                <p>This score summarizes the latest available glove session for decision support.</p>
                <span className="status-badge status-active">Latest reading</span>
              </div>
            </article>
            <article className="insight-panel">
              <BrainCircuit />
              <span>Priority movement area</span>
              <strong>{summary!.weakest_finger ? fingerLabel(summary!.weakest_finger) : "Not available"}</strong>
              <p>
                {summary!.weakest_finger
                  ? "The latest finger-wise reading is lowest in this area."
                  : "No finger-level analysis is available."}
              </p>
            </article>
            <article className="insight-panel">
              <CalendarDays />
              <span>Exercise adherence</span>
              <strong>{days.filter((d) => d.done).length} days</strong>
              <p>Completed exercise days across the last 30 days.</p>
            </article>
          </section>

          <section className="analysis-grid">
            <article className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <p className="overline">Longitudinal view</p>
                  <h2>Recovery trend</h2>
                </div>
                <span className="demo-label">0–100%</span>
              </div>
              {chart.length > 1 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chart}>
                    <defs>
                      <linearGradient id="doctorRecovery" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="var(--teal)" stopOpacity={0.25} />
                        <stop offset="1" stopColor="var(--teal)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => [`${v}%`, "Recovery"]} />
                    <Area dataKey="pct" type="monotone" stroke="var(--teal)" strokeWidth={3} fill="url(#doctorRecovery)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState icon={<BrainCircuit />} title="More sessions needed">
                  A recovery trend appears after multiple readings are available.
                </EmptyState>
              )}
            </article>
            <article className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <p className="overline">Latest session</p>
                  <h2>Finger analysis</h2>
                </div>
                <span className="demo-label">% of healthy range</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={fingerData}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="finger" tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => [`${v}%`, "Range of motion"]} />
                  <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                    {fingerData.map((x) => (
                      <Cell key={x.raw} fill={x.raw === summary!.weakest_finger ? "var(--warning)" : "var(--teal)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </article>
          </section>

          <section className="panel finger-comparison">
            <div className="panel-heading">
              <div>
                <p className="overline">Movement change</p>
                <h2>Before vs current</h2>
              </div>
            </div>
            {baseline ? (
              <div className="comparison-table">
                {FINGERS.map((f) => {
                  const before = Math.round((baseline[f] ?? 0) * 100),
                    current = Math.round((summary!.per_finger?.[f] ?? 0) * 100);
                  return (
                    <div key={f}>
                      <span>{fingerLabel(f)}</span>
                      <div>
                        <i className="baseline" style={{ width: `${before}%` }} />
                        <i className="current" style={{ width: `${current}%` }} />
                      </div>
                      <strong title={`Before: ${before}%`}>{current}%</strong>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="empty-inline">A baseline comparison will appear when earlier finger-level readings are available.</p>
            )}
          </section>
        </>
      )}

      {/* The plan can be set even before the first glove session */}
      <section className="detail-bottom">
        <article className="panel exercise-prescribe">
          <div className="panel-heading">
            <div>
              <p className="overline">Treatment plan</p>
              <h2>Recommend exercises</h2>
            </div>
            <span>{selected.length} selected</span>
          </div>
          {suggestedNames.length ? (
            <div className="ai-suggestion">
              <Sparkles />
              AI-assisted suggestions: <strong>{suggestedNames.join(", ")}</strong>
              {suggestedIds.some((id) => !selected.includes(id)) && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setSelected((v) => [...new Set([...v, ...suggestedIds])])}
                >
                  Add suggestions
                </button>
              )}
            </div>
          ) : (
            <div className="empty-inline">No AI-assisted exercise suggestions are available.</div>
          )}
          <div className="prescription-list">
            {exercises.map((ex) => (
              <button
                key={ex.id}
                type="button"
                className={selected.includes(ex.id) ? "selected" : ""}
                title={ex.description}
                onClick={() => setSelected((v) => (v.includes(ex.id) ? v.filter((i) => i !== ex.id) : [...v, ex.id]))}
              >
                <span className="select-box">{selected.includes(ex.id) && <Check />}</span>
                <div>
                  <strong>
                    {ex.name}
                    {suggestedNames.includes(ex.name) && (
                      <span className="status-badge status-active" style={{ marginLeft: 8 }}>
                        AI suggested
                      </span>
                    )}
                  </strong>
                  <p>{ex.target_fingers.split(",").map((f) => fingerLabel(f.trim())).join(" · ")}</p>
                </div>
              </button>
            ))}
          </div>
          <label className="notes-label">
            Notes for the patient
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional guidance for frequency, holds, or focus…"
            />
          </label>
          <Button onClick={savePlan} disabled={saving || !selected.length || !unsaved}>
            <ClipboardPlus />
            {saving ? "Saving plan…" : unsaved ? `Save exercise plan (${selected.length})` : "Plan saved"}
          </Button>
        </article>
        <article className="panel adherence-panel">
          <div className="panel-heading">
            <div>
              <p className="overline">Last 30 days</p>
              <h2>Exercise adherence</h2>
            </div>
          </div>
          <div className="streak-calendar">
            {days.map((d) => (
              <span key={d.date} className={d.done ? "done" : ""} title={d.date} />
            ))}
          </div>
          <div className="streak-legend">
            <span>
              <i className="done" />
              Completed
            </span>
            <span>
              <i />
              No completion logged
            </span>
          </div>
          <hr />
          <p className="overline">Current plan</p>
          {savedIds.length ? (
            <ul className="plan-summary">
              {exercises
                .filter((ex) => savedIds.includes(ex.id))
                .map((ex) => (
                  <li key={ex.id}>
                    <Check /> {ex.name}
                  </li>
                ))}
            </ul>
          ) : (
            <h3>No exercises assigned yet</h3>
          )}
          <p>{summary?.current_notes ? `Notes: ${summary.current_notes}` : "No notes for the patient."}</p>
        </article>
      </section>
    </div>
  );
}
