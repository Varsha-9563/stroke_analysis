"""
Recovery prediction from a patient's own history.

Stroke hand recovery is usually fast at first and then levels off (a "plateau").
So we fit this curve to every (day, recovery score) the patient has recorded:

    score(day) = plateau - (plateau - start) * exp(-speed * day)

  start   : score at day 0
  plateau : the level the patient is heading towards
  speed   : how fast they get there

From the fitted curve we predict the score in 30 and 90 days, and the day the
recovery target (85) will probably be reached. Every new recording updates the
prediction. With fewer than 4 sessions (or if the curve does not fit) we fall
back to a straight line.
"""
from datetime import timedelta

import numpy as np

TARGET = 85.0


def _curve(t, plateau, start, speed):
    return plateau - (plateau - start) * np.exp(-speed * t)


def predict(sessions, target=TARGET):
    """sessions: GloveSession objects in date order (all of the patient's sessions)."""
    if len(sessions) < 2:
        return None
    t0 = sessions[0].recorded_at
    days = np.array([(s.recorded_at - t0).total_seconds() / 86400 for s in sessions])
    scores = np.array([s.recovery_score for s in sessions], dtype=float)
    if days[-1] < 3:                      # all recordings within a few days: too early to predict
        return {"method": "not enough history", "message":
                "Keep recording over the next weeks to get a recovery prediction."}

    now = days[-1]
    model = "plateau curve"
    try:
        if len(sessions) < 4:
            raise RuntimeError("too few points")
        from scipy.optimize import curve_fit
        p0 = [min(max(scores.max() + 5, 60), 100), scores[0], 0.02]
        (plateau, start, speed), _ = curve_fit(
            _curve, days, scores, p0=p0,
            bounds=([scores.max() - 5, 0, 1e-4], [100, 100, 1.0]), maxfev=5000)
        fitted = _curve(days, plateau, start, speed)
        predict_at = lambda d: float(_curve(d, plateau, start, speed))  # noqa: E731
    except Exception:
        model = "straight line"
        slope, intercept = np.polyfit(days, scores, 1)
        plateau, speed = None, None
        fitted = slope * days + intercept
        predict_at = lambda d: float(np.clip(slope * d + intercept, 0, 100))  # noqa: E731

    # how well the curve matches the real points (0..1)
    ss_res = float(np.sum((scores - fitted) ** 2))
    ss_tot = float(np.sum((scores - scores.mean()) ** 2)) or 1.0
    fit_quality = max(0.0, 1 - ss_res / ss_tot)

    current = predict_at(now)
    in_30, in_90 = predict_at(now + 30), predict_at(now + 90)
    rate_week = (predict_at(now + 7) - current)

    # day the target is reached (search forward up to 2 years)
    target_day = None
    if scores[-1] >= target:
        status = "target reached"
    else:
        for d in range(int(now) + 1, int(now) + 731):
            if predict_at(d) >= target:
                target_day = d
                break
        if target_day:
            status = "on track"
        elif plateau is not None and plateau < target:
            status = "plateau below target"
        else:
            status = "slow progress"

    curve_points = []
    end = now + 90
    for d in np.linspace(0, end, 40):
        curve_points.append({"day": round(float(d), 1),
                             "date": (t0 + timedelta(days=float(d))).isoformat(),
                             "predicted": round(predict_at(d), 1),
                             "future": bool(d > now)})

    out = {
        "method": model,
        "fit_quality": round(fit_quality, 2),
        "day_now": int(round(now)),
        "current_trend_score": round(current, 1),
        "predicted_in_30_days": round(in_30, 1),
        "predicted_in_90_days": round(in_90, 1),
        "rate_per_week_now": round(rate_week, 2),
        # only report a plateau if the curve has clearly levelled off below 99
        "plateau": round(plateau, 1) if plateau is not None and plateau < 99 else None,
        "target": target,
        "target_day": target_day,
        "days_to_target": (target_day - int(round(now))) if target_day else None,
        "target_date": (t0 + timedelta(days=target_day)).date().isoformat() if target_day else None,
        "status": status,
        "curve": curve_points,
    }
    out["message"] = _message(out)
    return out


def _message(f):
    if f["status"] == "target reached":
        return "The recovery target has been reached."
    if f["status"] == "on track":
        return (f"Expected to reach {f['target']:.0f}% around day {f['target_day']} of rehab "
                f"(in about {f['days_to_target']} days).")
    if f["status"] == "plateau below target":
        return (f"Recovery is levelling off around {f['plateau']:.0f}%, below the "
                f"{f['target']:.0f}% target. The doctor may want to change the exercise plan.")
    return "Progress is slow; the target is not expected within 2 years at the current pace."

