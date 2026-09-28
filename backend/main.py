"""
Rehab glove backend - matches the NeuroFlex frontend (gentle-react-refresh).

Run from the backend folder:
    uvicorn main:app --reload
API docs: http://127.0.0.1:8000/docs
"""
from datetime import date, timedelta
from typing import List, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from analysis import analyze_session
from auth import (create_token, get_current_user, hash_password, require_doctor,
                  require_patient, verify_password)
from database import (Exercise, ExerciseLog, GloveSession, Message, Patient,
                      Prescription, User, create_tables, get_db)
from emailer import send_email

create_tables()
app = FastAPI(title="NeuroFlex Rehab Glove API")

# Lets the frontend (NeuroFlex runs on port 8080) call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080", "http://127.0.0.1:8080",
        "http://localhost:5173", "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

FINGERS = ["thumb", "index", "middle", "ring", "little"]
HEALTHY_ROM = 80.0  # degrees of range of motion treated as 100% for a finger


# ================================================================ helpers
def api_finger(f):
    """Backend calls it 'little', the frontend calls it 'pinky'."""
    return "pinky" if f == "little" else f


def per_finger(session: GloveSession):
    """Range of motion per finger as a fraction 0..1 of a healthy range."""
    rom = session.range_of_motion or {}
    return {api_finger(f): round(min(rom.get(f, 0) / HEALTHY_ROM, 1.0), 3) for f in FINGERS}


def get_patient_for_doctor(db, patient_id, doctor):
    p = db.get(Patient, patient_id)
    if not p or p.doctor_id != doctor.id:
        raise HTTPException(404, "Patient not found")
    return p


def get_my_patient(db, user):
    p = db.query(Patient).filter(Patient.user_id == user.id).first()
    if not p:
        raise HTTPException(404, "Patient profile not found")
    return p


def active_prescriptions(p: Patient):
    return [rx for rx in p.prescriptions if rx.active]


def completed_days(p: Patient):
    """Set of dates on which the patient ticked at least one exercise."""
    return {log.done_on for rx in p.prescriptions for log in rx.logs}


def current_streak(p: Patient):
    """Consecutive days (ending today, or yesterday if today isn't done yet) with any exercise done."""
    days, streak, d = completed_days(p), 0, date.today()
    if d not in days:
        d -= timedelta(days=1)
    while d in days:
        streak += 1
        d -= timedelta(days=1)
    return streak


def auth_response(user: User):
    return {"access_token": create_token(user), "token_type": "bearer",
            "role": user.role, "user_id": user.id, "name": user.name}


# ================================================================ auth
class LoginBody(BaseModel):
    email: str
    password: str


class RegisterBody(BaseModel):
    email: str
    password: str
    full_name: str
    role: str                         # "doctor" or "patient"
    doctor_id: Optional[int] = None   # required for patients
    specialization: Optional[str] = None


@app.get("/")
def home():
    return {"message": "NeuroFlex backend is running"}


@app.post("/api/auth/login")
def login_json(body: LoginBody, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower().strip()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password")
    return auth_response(user)


@app.post("/api/auth/register")
def register(body: RegisterBody, db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    if body.role not in ("doctor", "patient"):
        raise HTTPException(400, "Role must be doctor or patient")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, "An account with this email already exists")
    if body.role == "patient":
        doctor = db.get(User, body.doctor_id) if body.doctor_id else None
        if not doctor or doctor.role != "doctor":
            raise HTTPException(400, "Please select a valid doctor")

    user = User(name=body.full_name.strip(), email=email, role=body.role,
                password_hash=hash_password(body.password),
                specialization=body.specialization if body.role == "doctor" else None)
    db.add(user)
    db.flush()
    if body.role == "patient":
        db.add(Patient(user_id=user.id, doctor_id=body.doctor_id))
    db.commit()
    return auth_response(user)


@app.get("/api/auth/doctors")
def list_doctors(db: Session = Depends(get_db)):
    """Public: shown in the patient registration form."""
    doctors = db.query(User).filter(User.role == "doctor").order_by(User.name).all()
    return [{"doctor_id": d.id, "full_name": d.name, "specialization": d.specialization}
            for d in doctors]


@app.post("/api/login")
def login_form(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Same as /api/auth/login but as a form - used by the 'Authorize' button in /docs."""
    return login_json(LoginBody(email=form.username, password=form.password), db)


@app.get("/api/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


# ================================================================ exercises
@app.get("/api/readings/exercises")
def exercise_library(db: Session = Depends(get_db)):
    return [{"id": e.id, "name": e.name, "description": e.description,
             "target_fingers": e.target_fingers}
            for e in db.query(Exercise).order_by(Exercise.id).all()]


# ================================================================ doctor
@app.get("/api/doctor/patients")
def my_patients(doctor: User = Depends(require_doctor), db: Session = Depends(get_db)):
    patients = db.query(Patient).filter(Patient.doctor_id == doctor.id).all()
    week = {date.today() - timedelta(days=i) for i in range(7)}
    out = []
    for p in patients:
        latest = p.sessions[-1] if p.sessions else None
        days = completed_days(p)
        last_log = max(days) if days else None
        last_session = latest.recorded_at.date() if latest else None
        activity = max([d for d in (last_log, last_session) if d], default=None)
        out.append({
            "patient_id": p.id,
            "full_name": p.user.name,
            "email": p.user.email,
            "status": p.status,
            "latest_recovery_percent": latest.recovery_score if latest else None,
            "first_recovery_percent": p.sessions[0].recovery_score if p.sessions else None,
            "sessions_count": len(p.sessions),
            "last_activity": activity.isoformat() if activity else None,
            "exercise_adherence": round(len(days & week) / 7 * 100),
        })
    return out


@app.get("/api/doctor/patients/{patient_id}/summary")
def patient_summary(patient_id: int, doctor: User = Depends(require_doctor),
                    db: Session = Depends(get_db)):
    p = get_patient_for_doctor(db, patient_id, doctor)
    active = active_prescriptions(p)
    base = {
        "patient_id": p.id,
        "patient_name": p.user.name,
        "email": p.user.email,
        "status": p.status,
        "doctor_name": p.doctor.name,
        "current_exercise_ids": [rx.exercise_id for rx in active],
        "current_notes": next((rx.notes for rx in active if rx.notes), ""),
        "sessions_count": len(p.sessions),
    }
    if not p.sessions:
        return {**base, "recovery_percent": None, "weakest_finger": None,
                "history": [], "per_finger": None, "recommended_exercise_names": []}

    latest = p.sessions[-1]
    fingers = per_finger(latest)
    return {
        **base,
        "recovery_percent": latest.recovery_score,
        "weakest_finger": min(fingers, key=fingers.get),
        "per_finger": fingers,
        "finger_status": {api_finger(f): s for f, s in (latest.finger_status or {}).items()},
        "history": [{"date": s.recorded_at.isoformat(), "recovery_percent": s.recovery_score,
                     "per_finger": per_finger(s)} for s in p.sessions],
        "recommended_exercise_names": latest.suggested_exercises or [],
    }


@app.get("/api/doctor/patients/{patient_id}/streaks")
def patient_streaks(patient_id: int, doctor: User = Depends(require_doctor),
                    db: Session = Depends(get_db)):
    p = get_patient_for_doctor(db, patient_id, doctor)
    return [{"date": d.isoformat(), "completed": True} for d in sorted(completed_days(p))]


class RecommendBody(BaseModel):
    patient_id: int
    exercise_ids: List[int]
    notes: str = ""


@app.post("/api/doctor/recommend")
def recommend(body: RecommendBody, doctor: User = Depends(require_doctor),
              db: Session = Depends(get_db)):
    """Saves the patient's exercise plan. The ticked list REPLACES the old plan;
    removed exercises are switched off but their history is kept."""
    p = get_patient_for_doctor(db, body.patient_id, doctor)
    wanted = set(body.exercise_ids)
    valid = {e.id for e in db.query(Exercise).filter(Exercise.id.in_(wanted)).all()}
    if wanted - valid:
        raise HTTPException(400, f"Unknown exercise id(s): {sorted(wanted - valid)}")

    current = {rx.exercise_id: rx for rx in active_prescriptions(p)}
    for ex_id, rx in current.items():
        if ex_id in wanted:
            rx.notes = body.notes
        else:
            rx.active = False
    for ex_id in wanted - current.keys():
        db.add(Prescription(patient_id=p.id, exercise_id=ex_id, notes=body.notes))
    db.commit()
    return {"ok": True, "exercise_ids": sorted(wanted)}


class DischargeBody(BaseModel):
    patient_id: int


@app.post("/api/doctor/discharge")
def discharge(body: DischargeBody, background: BackgroundTasks,
              doctor: User = Depends(require_doctor), db: Session = Depends(get_db)):
    """Mark as recovered + message on the website + email to the patient."""
    p = get_patient_for_doctor(db, body.patient_id, doctor)
    p.status = "recovered"
    text = (f"Great news, {p.user.name}! {doctor.name} has reviewed your hand-movement "
            f"analysis and marked your rehabilitation as complete. You are recovered and "
            f"ready to be discharged. Your care team will contact you about next steps.")
    db.add(Message(patient_id=p.id, sender_id=doctor.id, text=text))
    db.commit()
    background.add_task(send_email, p.user.email,
                        "NeuroFlex: you are recovered and ready for discharge", text)
    return {"ok": True, "status": p.status}


# ================================================================ patient
@app.get("/api/patient/me")
def patient_me(user: User = Depends(require_patient), db: Session = Depends(get_db)):
    p = get_my_patient(db, user)
    msgs = db.query(Message).filter(Message.patient_id == p.id).order_by(Message.created_at.desc()).all()
    return {
        "patient_id": p.id,
        "full_name": user.name,
        "email": user.email,
        "doctor_name": p.doctor.name,
        "status": p.status,
        "current_streak": current_streak(p),
        "messages": [{"id": m.id, "text": m.text, "created_at": m.created_at.isoformat()}
                     for m in msgs],
    }


@app.get("/api/patient/exercises")
def patient_exercises(user: User = Depends(require_patient), db: Session = Depends(get_db)):
    p = get_my_patient(db, user)
    today = date.today()
    return [{
        "id": rx.exercise.id,
        "name": rx.exercise.name,
        "description": rx.exercise.description,
        "target_fingers": rx.exercise.target_fingers,
        "notes": rx.notes,
        "checked_today": any(log.done_on == today for log in rx.logs),
    } for rx in active_prescriptions(p)]


class StreakBody(BaseModel):
    exercise_id: int
    completed: bool


@app.post("/api/patient/streak/check")
def streak_check(body: StreakBody, user: User = Depends(require_patient),
                 db: Session = Depends(get_db)):
    p = get_my_patient(db, user)
    rx = next((r for r in active_prescriptions(p) if r.exercise_id == body.exercise_id), None)
    if not rx:
        raise HTTPException(404, "This exercise is not in your plan")
    today = date.today()
    existing = [log for log in rx.logs if log.done_on == today]
    if body.completed and not existing:
        db.add(ExerciseLog(prescription_id=rx.id, done_on=today))
    if not body.completed:
        for log in existing:
            db.delete(log)
    db.commit()

    db.refresh(p)
    return {"ok": True, "completed": body.completed, "current_streak": current_streak(p)}


@app.get("/api/patient/recovery")
def patient_recovery(user: User = Depends(require_patient), db: Session = Depends(get_db)):
    p = get_my_patient(db, user)
    return [{"date": s.recorded_at.isoformat(), "recovery_percent": s.recovery_score}
            for s in p.sessions]


# ================================================================ glove
class GloveData(BaseModel):
    device_id: str = "glove-01"
    # each sample: [t_ms, thumb, index, middle, ring, little]  (raw ADC 0-4095)
    samples: List[List[float]]


def check_samples(samples):
    if len(samples) < 250:  # less than 5 seconds at 50 Hz
        raise HTTPException(400, "Need at least 5 seconds (250 samples) of glove data")
    if any(len(s) != 6 for s in samples):
        raise HTTPException(400, "Each sample must be [t_ms, thumb, index, middle, ring, little]")


@app.post("/api/glove/sessions")
def glove_upload(data: GloveData, db: Session = Depends(get_db)):
    """The glove sends a finished session. We find the patient by the glove's device_id."""
    p = db.query(Patient).filter(Patient.device_id == data.device_id).first()
    if not p:
        raise HTTPException(404, f"No patient is assigned glove '{data.device_id}'")
    check_samples(data.samples)
    result = analyze_session(data.samples)
    s = GloveSession(
        patient_id=p.id,
        recovery_score=result["recovery_score"],
        finger_status=result["finger_status"],
        range_of_motion=result["range_of_motion"],
        features=result["features"],
        suggested_exercises=result["suggested_exercises"],
    )
    db.add(s)
    db.commit()
    return {"patient": p.user.name, "session_id": s.id, **{k: result[k] for k in
            ("recovery_score", "finger_status", "range_of_motion", "suggested_exercises")}}


@app.post("/api/analyze-session")
def analyze(data: GloveData):
    """Analyse without saving (handy for testing)."""
    check_samples(data.samples)
    return analyze_session(data.samples)
