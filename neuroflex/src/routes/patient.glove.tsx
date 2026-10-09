// Glove session: pair the glove, watch the fingers live, record 20 s, get the ML analysis.
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, Check, CircleStop, Hand, Link2, Play, RotateCcw, Settings2, TrendingDown, TrendingUp, Wifi, WifiOff, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, LoadingState } from "@/components/ui";
import {
  calibrateGlove, cancelRecording, getGloveLive, getGloveStatus, pairGlove, resetCalibration, startRecording, stopRecording,
} from "@/lib/api";

export const Route = createFileRoute("/patient/glove")({
  head: () => ({ meta: [{ title: "Glove session — NeuroFlex" }] }),
  component: GloveSession,
});

const FINGERS = ["index", "middle", "ring", "little"] as const;   // 4 flex sensors (no thumb)
const cap = (s: string) => (s === "little" ? "Pinky" : s.charAt(0).toUpperCase() + s.slice(1));

type Status = {
  device_id: string | null;
  online: boolean;
  calibrated: boolean;
  calibrated_at: string | null;
  recording: boolean;
  default_duration: number;
  known_gloves: string[];
};
type Live = {
  online: boolean;
  angles: Record<string, number> | null;
  raw: Record<string, number> | null;
  recording: { elapsed: number; duration: number; samples: number } | null;
};
type Result = {
  recorded_at: string;
  samples: number;
  recovery_score: number;
  finger_status: Record<string, string>;
  range_of_motion: Record<string, number>;
  suggested_exercises: string[];
  day?: number;
  pct_of_healthy?: Record<string, number> | null;
  forecast?: { predicted_in_30_days?: number; predicted_in_90_days?: number; message?: string } | null;
  comparison: null | {
    previous_date: string;
    previous_score: number;
    score_change: number;
    rom_change: Record<string, number>;
  };
};
type Phase = "idle" | "countdown" | "recording" | "analysing" | "done";

const errMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;

function GloveSession() {
  const [status, setStatus] = useState<Status | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(3);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pairInput, setPairInput] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [calibMsg, setCalibMsg] = useState<{ type: string; text: string } | null>(null);
  const [calibStep, setCalibStep] = useState<"flat" | "bent">("flat");
  const stopping = useRef(false);

  const loadStatus = useCallback(() => getGloveStatus().then((r) => setStatus(r.data)), []);
  useEffect(() => {
    loadStatus().catch(() => setError("Could not reach the NeuroFlex service."));
  }, [loadStatus]);

  // live readings ~3x per second while a glove is paired
  useEffect(() => {
    if (!status?.device_id) return;
    let alive = true;
    const tick = () =>
      getGloveLive()
        .then((r) => alive && setLive(r.data))
        .catch(() => alive && setLive((l) => (l ? { ...l, online: false } : l)));
    tick();
    const id = setInterval(tick, 330);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [status?.device_id]);

  const finish = useCallback(async () => {
    if (stopping.current) return;
    stopping.current = true;
    setPhase("analysing");
    try {
      const r = await stopRecording();
      setResult(r.data);
      setPhase("done");
    } catch (e) {
      setError(errMsg(e, "The recording could not be analysed."));
      setPhase("idle");
    } finally {
      stopping.current = false;
    }
  }, []);

  // auto-stop when the recording time is up
  useEffect(() => {
    const rec = live?.recording;
    if (phase === "recording" && rec && rec.elapsed >= rec.duration) finish();
  }, [live, phase, finish]);

  async function begin() {
    setError("");
    setResult(null);
    setPhase("countdown");
    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise((r) => setTimeout(r, 1000));
    }
    try {
      await startRecording(status?.default_duration);
      setPhase("recording");
    } catch (e) {
      setError(errMsg(e, "Could not start the recording."));
      setPhase("idle");
    }
  }

  async function cancel() {
    await cancelRecording().catch(() => {});
    setPhase("idle");
  }

  async function pair(id?: string) {
    const device = (id ?? pairInput).trim();
    if (!device) return;
    setError("");
    try {
      const r = await pairGlove(device);
      setInfo(r.data.moved_from ? `Glove ${device} is now yours (it was paired with ${r.data.moved_from}).` : `Glove ${device} paired.`);
      setPairInput("");
      await loadStatus();
    } catch (e) {
      setError(errMsg(e, "Could not pair that glove."));
    }
  }

  async function capture(pose: "flat" | "bent") {
    if (!status?.device_id) return;
    setCalibMsg(null);
    try {
      const r = await calibrateGlove(status.device_id, pose);
      if (r.data.complete) {
        setCalibMsg({ type: r.data.warning ? "error" : "success", text: r.data.warning ?? "Glove calibrated." });
        setCalibStep("flat");
        loadStatus();
      } else {
        setCalibMsg({ type: "info", text: "Flat position saved. Now make a full fist and hold it." });
        setCalibStep("bent");
      }
    } catch (e) {
      setCalibMsg({ type: "error", text: errMsg(e, "Calibration failed.") });
      setCalibStep("flat");
    }
  }

  async function resetCalib() {
    if (!status?.device_id) return;
    await resetCalibration(status.device_id);
    setCalibMsg({ type: "info", text: "Calibration removed - using default sensor settings." });
    setCalibStep("flat");
    loadStatus();
  }

  if (!status) return error ? <div className="notice error">{error}</div> : <LoadingState label="Connecting to your glove" />;

  const online = !!live?.online;
  const rec = live?.recording;
  const duration = rec?.duration ?? status.default_duration;
  const progress = rec ? Math.min(rec.elapsed / duration, 1) : 0;
  const busy = phase === "countdown" || phase === "recording" || phase === "analysing";

  return (
    <div className="workspace-page glove-page">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Glove session</span>
          <h1>Record your hand movement</h1>
          <p>Wear the glove, then open and close your hand slowly for {status.default_duration} seconds.</p>
        </div>
        {status.device_id && (
          <span className={`live-status ${online ? "" : "offline"}`}>
            {online ? <Wifi size={15} /> : <WifiOff size={15} />} {status.device_id} · {online ? "connected" : "not connected"}
          </span>
        )}
      </header>

      {error && (
        <div className="notice error">
          {error}
          <button className="notice-close" aria-label="Dismiss" onClick={() => setError("")}><X size={15} /></button>
        </div>
      )}

      {info && (
        <div className="notice info">
          {info}
          <button className="notice-close" aria-label="Dismiss" onClick={() => setInfo("")}><X size={15} /></button>
        </div>
      )}

      {!status.device_id ? (
        <section className="panel pair-panel">
          <div className="panel-heading">
            <div>
              <p className="overline">Step 1</p>
              <h2>Pair your glove</h2>
            </div>
            <Link2 />
          </div>
          <p className="muted-text">Enter the glove ID printed on your glove (the <code>DEVICE_ID</code> in the glove firmware). One glove can be shared: pairing moves it to you.</p>
          <form className="pair-form" onSubmit={(e) => { e.preventDefault(); pair(); }}>
            <input value={pairInput} onChange={(e) => setPairInput(e.target.value)} placeholder="e.g. glove-01" aria-label="Glove ID" />
            <Button type="submit" disabled={!pairInput.trim()}>Pair glove</Button>
          </form>
          {status.known_gloves.length > 0 && (
            <p className="muted-text">
              Gloves sending data right now:{" "}
              {status.known_gloves.map((g) => (
                <button key={g} type="button" className="chip" onClick={() => pair(g)}>{g}</button>
              ))}
            </p>
          )}
        </section>
      ) : (
        <>
          <section className="glove-grid">
            {/* live hand */}
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <p className="overline">Live sensor view</p>
                  <h2>Finger bend</h2>
                </div>
                <span className={`count-pill ${online ? "" : "pill-off"}`}>{online ? "Live" : "Waiting for glove"}</span>
              </div>
              <div className="finger-bars" aria-live="off">
                {FINGERS.map((f) => {
                  const a = live?.angles?.[f] ?? 0;
                  return (
                    <div key={f} className="finger-bar">
                      <div className="finger-bar-track">
                        <div className="finger-bar-fill" style={{ height: `${online ? (a / 90) * 100 : 0}%` }} />
                      </div>
                      <strong>{online && live?.angles ? `${Math.round(a)}°` : "—"}</strong>
                      <span>{cap(f)}</span>
                      <small title="Raw sensor value (0–4095)">{online && live?.raw ? live.raw[f] : ""}</small>
                    </div>
                  );
                })}
              </div>
              {!online && (
                <p className="muted-text">
                  Switch on the glove and make sure it is on the same Wi-Fi as this computer. No glove yet? Run{" "}
                  <code>python glove_simulator.py --device {status.device_id}</code> in the hardware folder.
                </p>
              )}
            </article>

            {/* recording */}
            <article className="panel record-panel">
              <div className="panel-heading">
                <div>
                  <p className="overline">Recording</p>
                  <h2>
                    {phase === "recording" ? "Recording…" : phase === "analysing" ? "Analysing…" :
                     phase === "countdown" ? "Get ready" : phase === "done" ? "Session saved" : "Ready when you are"}
                  </h2>
                </div>
                <Hand />
              </div>

              <div className="record-dial" style={{ "--p": `${(phase === "done" ? 1 : progress) * 100}%` } as React.CSSProperties}>
                <div>
                  {phase === "countdown" ? (
                    <strong>{countdown}</strong>
                  ) : phase === "recording" ? (
                    <>
                      <strong>{Math.max(0, Math.ceil(duration - (rec?.elapsed ?? 0)))}</strong>
                      <span>seconds left</span>
                    </>
                  ) : phase === "analysing" ? (
                    <span className="spinner" />
                  ) : phase === "done" && result ? (
                    <>
                      <strong>{Math.round(result.recovery_score)}%</strong>
                      <span>recovery</span>
                    </>
                  ) : (
                    <>
                      <strong>{status.default_duration}s</strong>
                      <span>session</span>
                    </>
                  )}
                </div>
              </div>

              <p className="record-hint">
                {phase === "recording"
                  ? `Keep opening and closing your hand · ${rec?.samples ?? 0} readings`
                  : phase === "countdown"
                    ? "Relax your hand…"
                    : phase === "analysing"
                      ? "Running the movement analysis"
                      : "Sit comfortably, rest your arm on a table, then press start."}
              </p>

              <div className="record-actions">
                {phase === "recording" ? (
                  <>
                    <Button onClick={finish} disabled={(rec?.samples ?? 0) < 250}><CircleStop /> Stop & analyse</Button>
                    <Button variant="secondary" onClick={cancel}><X /> Cancel</Button>
                  </>
                ) : (
                  <Button onClick={begin} disabled={!online || busy}>
                    {phase === "done" ? <RotateCcw /> : <Play />} {phase === "done" ? "Record again" : "Start recording"}
                  </Button>
                )}
              </div>
            </article>
          </section>

          {phase === "done" && result && <ResultCard result={result} />}

          {/* one-time glove setup */}
          <section className="panel setup-panel">
            <button className="setup-toggle" onClick={() => setShowSetup((v) => !v)} aria-expanded={showSetup}>
              <Settings2 size={17} />
              <span>Glove setup</span>
              <small>{status.calibrated ? "Calibrated" : "Not calibrated · using default sensor settings"}</small>
            </button>
            {showSetup && (
              <div className="setup-body">
                <p className="muted-text">
                  Calibrate <strong>once per glove</strong>, worn by a person with healthy hand movement (not the
                  patient), so the readings become accurate bend angles.
                </p>
                <ol className="calib-steps">
                  <li className={calibStep === "flat" ? "current" : "done"}>
                    Hold the hand <strong>flat and still</strong> for 2 seconds, then
                    <Button variant="secondary" disabled={!online || calibStep !== "flat"} onClick={() => capture("flat")}>
                      Capture flat
                    </Button>
                  </li>
                  <li className={calibStep === "bent" ? "current" : ""}>
                    Make a <strong>full fist and hold it</strong> for 2 seconds, then
                    <Button variant="secondary" disabled={!online || calibStep !== "bent"} onClick={() => capture("bent")}>
                      Capture fist
                    </Button>
                  </li>
                </ol>
                {calibMsg && <div className={`notice ${calibMsg.type}`}>{calibMsg.text}</div>}
                <div className="setup-footer">
                  {status.calibrated && (
                    <Button variant="ghost" onClick={resetCalib}>Remove calibration</Button>
                  )}
                  <form className="pair-form small" onSubmit={(e) => { e.preventDefault(); pair(); }}>
                    <input value={pairInput} onChange={(e) => setPairInput(e.target.value)} placeholder="Switch to another glove ID" aria-label="Glove ID" />
                    <Button type="submit" variant="secondary" disabled={!pairInput.trim()}><Link2 /> Pair</Button>
                  </form>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: Result }) {
  const c = result.comparison;
  return (
    <section className="panel result-panel">
      <div className="panel-heading">
        <div>
          <p className="overline">Analysis of this session</p>
          <h2>
            Recovery score {result.recovery_score}%
            {c && (
              <span className={`result-delta ${c.score_change >= 0 ? "delta-up" : "delta-down"}`}>
                {c.score_change >= 0 ? <TrendingUp size={17} /> : <TrendingDown size={17} />}
                {c.score_change > 0 ? "+" : ""}
                {c.score_change} vs previous
              </span>
            )}
          </h2>
          <p className="muted-text">
            {result.day != null && `Day ${result.day} of rehab · `}{result.samples} readings analysed · saved to your CSV file
            {c && ` · previous session ${new Date(c.previous_date).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} scored ${c.previous_score}%`}
          </p>
        </div>
        <Check />
      </div>

      <div className="result-fingers">
        {FINGERS.map((f) => {
          const d = c?.rom_change[f];
          return (
            <div key={f} className="result-finger">
              <span>{cap(f)}</span>
              <strong>{result.range_of_motion[f]}°</strong>
              <span className={`status-badge finger-${result.finger_status[f]}`}>{result.finger_status[f]}</span>
              {d != null && (
                <small className={d > 0 ? "delta-up" : d < 0 ? "delta-down" : ""}>
                  {d > 0 ? "+" : ""}
                  {d}°
                </small>
              )}
            </div>
          );
        })}
      </div>

      {(result.pct_of_healthy || result.forecast?.message) && (
        <div className="result-insights">
          {result.pct_of_healthy && (
            <p>
              <strong>{Math.round(result.pct_of_healthy["overall"] ?? 0)}% of a healthy hand</strong> (average range of
              motion compared with the healthy volunteers).
            </p>
          )}
          {result.forecast?.message && (
            <p>
              <strong>Prediction:</strong>{" "}
              {result.forecast.predicted_in_30_days != null &&
                `about ${Math.round(result.forecast.predicted_in_30_days)}% in 30 days. `}
              {result.forecast.message}
            </p>
          )}
        </div>
      )}

      <div className="result-footer">
        <div>
          <p className="overline">Suggested focus</p>
          <p>{result.suggested_exercises.join(" · ")}</p>
        </div>
        <Link to="/patient/analytics" className="button button-secondary">
          See recovery analytics <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
