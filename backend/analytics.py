"""
Recovery analytics over a chosen period: today, 1 week, 15 days, 1 month,
3 months, 6 months, 1 year.

"Today" is useful for the demo: record a session, do the exercises, record again,
and the report compares the two.
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from auth import require_doctor, require_patient
from database import Patient, User, get_db
from forecast import predict
from healthy import baseline as healthy_baseline
from healthy import pct_of_healthy

router = APIRouter()

FINGERS = ["index", "middle", "ring", "little"]   # 4 flex sensors (no thumb)
PERIODS = {1: "Today", 7: "Last 7 days", 15: "Last 15 days", 30: "Last month",
           90: "Last 3 months", 180: "Last 6 months", 365: "Last 12 months"}


def _label(f):
    return "pinky" if f == "little" else f


TARGET_SCORE = 85


def _day(p: Patient, s):
    """Day number of a session, counting the patient's first-ever session as day 0."""
    return (s.recorded_at.date() - p.sessions[0].recorded_at.date()).days


def _rate_per_week(sessions, p):
    """Recovery speed: slope of a straight line through (day, score), in points per week."""
    if len(sessions) < 3:
        return None
    x = [(s.recorded_at - sessions[0].recorded_at).total_seconds() / 86400 for s in sessions]
    if x[-1] < 1:          # all on the same day -> no meaningful per-week rate
        return None
    y = [s.recovery_score for s in sessions]
    mx, my = sum(x) / len(x), sum(y) / len(y)
    sxx = sum((xi - mx) ** 2 for xi in x)
    slope = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y)) / sxx
    return round(slope * 7, 1)


def build_analytics(p: Patient, days: int):
    if days not in PERIODS:
        raise HTTPException(400, f"days must be one of {sorted(PERIODS)}")
    now = datetime.now()
    start = datetime.combine(date.today(), datetime.min.time()) if days == 1 else now - timedelta(days=days)
    sessions = [s for s in p.sessions if s.recorded_at >= start]

    # exercise adherence in the period (only counting days since rehab started)
    first_day = start.date()
    starts = [rx.created_at.date() for rx in p.prescriptions] + [x.recorded_at.date() for x in p.sessions[:1]]
    if starts and min(starts) > first_day:
        first_day = min(starts)
    period_days = max((date.today() - first_day).days + (1 if days == 1 else 0), 1)
    done_days = {log.done_on for rx in p.prescriptions for log in rx.logs if log.done_on >= first_day}
    exercises_done = sum(1 for rx in p.prescriptions for log in rx.logs if log.done_on >= first_day)

    out = {
        "period_days": days,
        "period_label": PERIODS[days],
        "from": start.isoformat(),
        "to": now.isoformat(),
        "sessions_count": len(sessions),
        "trend": [{"date": s.recorded_at.isoformat(), "recovery_percent": s.recovery_score,
                   "day": _day(p, s)} for s in sessions],
        "days_since_first_session": _day(p, p.sessions[-1]) if p.sessions else None,
        "rate_per_week": None,
        "days_to_target": None,
        "group": p.group or "patient",
        "healthy_reference": healthy_baseline(),
        "pct_of_healthy": None,
        "forecast": predict(p.sessions) if (p.group or "patient") == "patient" else None,
        "adherence": {"days_done": len(done_days), "days_in_period": period_days,
                      "percent": round(min(len(done_days) / period_days, 1) * 100),
                      "exercises_done": exercises_done},
        "first_score": None, "last_score": None, "score_change": None,
        "average_score": None, "best_score": None,
        "fingers": [], "most_improved": None, "needs_focus": None,
        "summary": [],
    }
    if not sessions:
        out["summary"].append("No glove sessions were recorded in this period.")
        return out

    first, last = sessions[0], sessions[-1]
    scores = [s.recovery_score for s in sessions]
    rate = _rate_per_week(sessions, p)
    out["rate_per_week"] = rate
    fc = out["forecast"]
    if fc and fc.get("days_to_target"):
        out["days_to_target"] = fc["days_to_target"]
    out.update(first_score=first.recovery_score, last_score=last.recovery_score,
               average_score=round(sum(scores) / len(scores), 1), best_score=max(scores))

    fingers = []
    for f in FINGERS:
        a = (first.range_of_motion or {}).get(f, 0)
        b = (last.range_of_motion or {}).get(f, 0)
        fingers.append({"finger": _label(f), "start_rom": a, "end_rom": b, "change": round(b - a, 1),
                        "status": (last.finger_status or {}).get(f)})
    pct = pct_of_healthy(last.range_of_motion or {}) if out["group"] == "patient" else None
    out["pct_of_healthy"] = pct
    if pct:
        for row, f in zip(fingers, FINGERS):
            row["pct_of_healthy"] = pct.get(f)
    out["fingers"] = fingers
    out["needs_focus"] = min(fingers, key=lambda x: x["end_rom"])["finger"]

    s = out["summary"]
    if len(sessions) == 1:
        s.append(f"1 session recorded, recovery score {last.recovery_score}%. "
                 "Record another session to see the change.")
    else:
        change = round(last.recovery_score - first.recovery_score, 1)
        out["score_change"] = change
        best = max(fingers, key=lambda x: x["change"])
        out["most_improved"] = best["finger"] if best["change"] > 0 else None
        trend_word = "improved" if change > 2 else "declined" if change < -2 else "stayed about the same"
        s.append(f"{len(sessions)} sessions recorded. Recovery score {trend_word}: "
                 f"{first.recovery_score}% → {last.recovery_score}% ({change:+}).")
        if best["change"] > 0:
            s.append(f"Biggest gain in the {best['finger']} finger: range of motion "
                     f"{best['start_rom']}° → {best['end_rom']}° ({best['change']:+}°).")
        worse = [x["finger"] for x in fingers if x["change"] < -3]
        if worse:
            s.append(f"Range of motion dropped for: {', '.join(worse)}. Worth reviewing.")
    if rate is not None:
        s.append(f"Recovery speed: {rate:+} points per week "
                 f"(day {_day(p, first)} → day {_day(p, last)} of rehab).")
    if pct:
        hb = out["healthy_reference"]
        s.append(f"Hand movement is {pct['overall']:.0f}% of the healthy reference "
                 f"({hb['people']} healthy volunteers, {hb['based_on']}).")
    fc = out["forecast"]
    if fc and fc.get("message") and "predicted_in_30_days" in fc:
        s.append(f"Prediction ({fc['method']}): about {fc['predicted_in_30_days']:.0f}% in 30 days and "
                 f"{fc['predicted_in_90_days']:.0f}% in 90 days. {fc['message']}")
    s.append(f"Weakest finger now: {out['needs_focus']} "
             f"({min(x['end_rom'] for x in fingers)}° range of motion).")
    if days > 1:
        s.append(f"Exercises done on {len(done_days)} of {period_days} days "
                 f"({out['adherence']['percent']}% adherence).")
    elif exercises_done:
        s.append(f"{exercises_done} exercise(s) ticked off today.")
    return out


@router.get("/api/analytics/periods")
def periods():
    return [{"days": d, "label": l} for d, l in PERIODS.items()]


@router.get("/api/patient/analytics")
def patient_analytics(days: int = Query(30), user: User = Depends(require_patient),
                      db: Session = Depends(get_db)):
    p = db.query(Patient).filter(Patient.user_id == user.id).first()
    if not p:
        raise HTTPException(404, "Patient profile not found")
    return build_analytics(p, days)


@router.get("/api/doctor/patients/{patient_id}/analytics")
def doctor_patient_analytics(patient_id: int, days: int = Query(30),
                             doctor: User = Depends(require_doctor), db: Session = Depends(get_db)):
    p = db.get(Patient, patient_id)
    if not p or p.doctor_id != doctor.id:
        raise HTTPException(404, "Patient not found")
    return build_analytics(p, days)
