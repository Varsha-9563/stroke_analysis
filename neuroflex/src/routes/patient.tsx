import { createFileRoute } from "@tanstack/react-router";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarCheck, Check, Dumbbell, Flame, HeartHandshake, LineChart as LineIcon, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, Protected } from "@/components/app-shell";
import { EmptyState, LoadingState, ProgressBar } from "@/components/ui";
import { checkStreak, getMyExercises, getMyProfile, getMyRecovery } from "@/lib/api";

type Message = { id: number; text: string; created_at: string };
type Profile = { full_name: string; doctor_name?: string; status?: string; current_streak?: number; messages?: Message[] };
type Exercise = { id: number; name: string; description?: string; target_fingers: string; notes?: string; checked_today: boolean };
type Recovery = { date: string; recovery_percent: number };

const fingerLabel = (f: string) => (f === "pinky" ? "little" : f);

export const Route = createFileRoute("/patient")({
  head: () => ({
    meta: [
      { title: "My recovery — NeuroFlex" },
      { name: "description", content: "Track daily rehabilitation exercises and hand movement recovery." },
      { property: "og:title", content: "My recovery — NeuroFlex" },
      { property: "og:description", content: "Your exercises and recovery progress in one clear workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PatientRoute,
});

function PatientRoute() {
  return (
    <Protected role="patient">
      <AppShell role="patient">
        <PatientHome />
      </AppShell>
    </Protected>
  );
}

function PatientHome() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [recovery, setRecovery] = useState<Recovery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checking, setChecking] = useState<Record<number, boolean>>({});

  useEffect(() => {
    Promise.all([getMyProfile(), getMyExercises(), getMyRecovery()])
      .then(([p, e, r]) => {
        setProfile(p.data);
        setExercises(e.data);
        setRecovery(r.data);
      })
      .catch(() => setError("Your recovery workspace is unavailable right now. Please try again shortly."))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(ex: Exercise) {
    const completed = !ex.checked_today;
    setChecking((v) => ({ ...v, [ex.id]: true }));
    try {
      const res = await checkStreak({ exercise_id: ex.id, completed });
      setExercises((v) => v.map((x) => (x.id === ex.id ? { ...x, checked_today: completed } : x)));
      setProfile((p) => (p ? { ...p, current_streak: res.data.current_streak } : p));
      if (completed) {
        setNotice(`${ex.name} completed. Keep going — consistency matters.`);
        setTimeout(() => setNotice(""), 3500);
      }
    } catch {
      setError("That update could not be saved. Please try again.");
    } finally {
      setChecking((v) => ({ ...v, [ex.id]: false }));
    }
  }

  if (loading) return <LoadingState label="Preparing your recovery plan" />;

  const done = exercises.filter((e) => e.checked_today).length,
    pct = exercises.length ? Math.round((done / exercises.length) * 100) : 0,
    latest = recovery.at(-1)?.recovery_percent ?? null,
    streak = profile?.current_streak ?? 0,
    messages = profile?.messages ?? [];

  return (
    <div className="workspace-page patient-home">
      {notice && (
        <div className="notice success">
          <Check />
          {notice}
        </div>
      )}
      {error && <div className="notice error">{error}</div>}
      {profile?.status === "recovered" && (
        <div className="recovered-banner">
          <HeartHandshake />
          <div>
            <strong>Your doctor has marked you as recovered.</strong>
            <p>You are ready for discharge. A copy of this message was sent to your email.</p>
          </div>
        </div>
      )}

      <header className="workspace-header patient-greeting">
        <div>
          <span className="eyebrow">Your recovery journey</span>
          <h1>Good day, {profile?.full_name || "Patient"}</h1>
          <p>Focus on today’s movement practice and see how your progress is developing.</p>
        </div>
        <div className="doctor-chip">
          <span>YOUR DOCTOR</span>
          <strong>{profile?.doctor_name || "Not assigned"}</strong>
        </div>
      </header>

      <section className="patient-summary">
        <article className="recovery-orbit">
          <div className="ring" style={{ "--progress": `${latest ?? 0}%` } as React.CSSProperties}>
            <div>
              <strong>{latest === null ? "—" : `${Math.round(latest)}%`}</strong>
              <span>Latest recovery</span>
            </div>
          </div>
          <div>
            <p className="overline">Movement analysis</p>
            <h2>Your recovery progress</h2>
            <p>
              {latest === null
                ? "Recovery analysis will appear after sensor readings are available."
                : "Based on your most recent smart-glove reading."}
            </p>
          </div>
        </article>
        <article className="today-card">
          <div>
            <CalendarCheck />
            <span>Today’s progress</span>
          </div>
          <strong>
            {done}
            <small> / {exercises.length}</small>
          </strong>
          <ProgressBar value={pct} tone={pct === 100 ? "success" : "teal"} />
          <p>
            {!exercises.length
              ? "No exercises assigned yet."
              : pct === 100
                ? "All exercises completed today. Great work."
                : `${Math.max(0, exercises.length - done)} exercise${exercises.length - done === 1 ? "" : "s"} remaining.`}
          </p>
          <p className="streak-line">
            <Flame size={15} style={{ verticalAlign: "-2px" }} />{" "}
            {streak ? `${streak}-day streak` : "Complete an exercise to start a streak"}
          </p>
        </article>
      </section>

      <section className="patient-content-grid">
        <article className="panel exercise-panel">
          <div className="panel-heading">
            <div>
              <p className="overline">Daily plan</p>
              <h2>Today’s exercises</h2>
            </div>
            <span className="count-pill">
              {done}/{exercises.length} complete
            </span>
          </div>
          {!exercises.length ? (
            <EmptyState icon={<Dumbbell />} title="No exercises assigned">
              Your doctor hasn’t assigned any exercises yet.
            </EmptyState>
          ) : (
            <div className="exercise-list">
              {exercises.map((ex) => (
                <button
                  key={ex.id}
                  className={`exercise-card ${ex.checked_today ? "completed" : ""}`}
                  disabled={checking[ex.id]}
                  onClick={() => toggle(ex)}
                >
                  <span className="exercise-check">{ex.checked_today ? <Check /> : null}</span>
                  <div>
                    <strong>{ex.name}</strong>
                    <p>{ex.description || "Follow the movement guidance provided by your doctor."}</p>
                    {ex.notes && <p className="exercise-note">Doctor’s note: {ex.notes}</p>}
                    <div>
                      {ex.target_fingers.split(",").map((f) => (
                        <span key={f}>{fingerLabel(f.trim())}</span>
                      ))}
                    </div>
                  </div>
                  <small>{checking[ex.id] ? "Saving…" : ex.checked_today ? "Completed" : "Mark done"}</small>
                </button>
              ))}
            </div>
          )}
        </article>
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <p className="overline">Movement history</p>
              <h2>Recent recovery progress</h2>
            </div>
            <LineIcon />
          </div>
          {recovery.length > 1 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart
                data={recovery.map((r) => ({
                  date: new Date(r.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
                  pct: Number(r.recovery_percent.toFixed(1)),
                }))}
              >
                <defs>
                  <linearGradient id="recoveryFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--teal)" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="var(--teal)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={20} />
                <YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => [`${v}%`, "Recovery"]} />
                <Area type="monotone" dataKey="pct" stroke="var(--teal)" fill="url(#recoveryFill)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={<LineIcon />} title="No recovery history yet">
              Recovery analysis will appear after sensor readings are available.
            </EmptyState>
          )}
        </article>
      </section>

      {messages.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="overline">From your care team</p>
              <h2>Messages</h2>
            </div>
            <MessageSquare />
          </div>
          <ul className="message-list">
            {messages.map((m) => (
              <li key={m.id}>
                {m.text}
                <small>
                  {new Date(m.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
