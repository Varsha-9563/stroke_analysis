# NeuroFlex: Smart Glove for Stroke Hand Rehabilitation

NeuroFlex measures how a stroke patient's fingers move and turns those readings into recovery insights for doctors and patients.

A glove with **five flex sensors** (one per finger) sends bend readings over Wi-Fi from an **ESP32**. A **machine-learning backend** analyses each session and estimates:
- a **recovery score** from 0 to 100
- the **status of each finger** (good / moderate / severe)
- **suggested exercises**

A **web app** has two logins:
- **Doctors** see their patients, recovery charts and finger-by-finger analysis. They prescribe exercises and mark patients as recovered, which also sends a message and an email.
- **Patients** see their doctor, their prescribed exercises, a daily checklist, their streak and their recovery progress.

> The analysis supports clinical decisions. It is not a diagnostic tool.

---

## How it works

```
 ESP32 + 5 flex sensors ──Wi-Fi──▶  FastAPI backend  ──▶  NeuroFlex web app
   (raw readings 0–4095)            │                      ├─ Doctor dashboard
                                    ├─ ADC → bend angle    └─ Patient dashboard
                                    ├─ feature extraction
                                    ├─ ML model (score + finger status)
                                    ├─ exercise suggestions
                                    └─ SQLite database
```

1. **Capture:** each flex sensor sits in a voltage divider. Bending a finger changes the sensor's resistance, which changes the voltage the ESP32 reads.
2. **Convert:** the backend turns the raw readings into bend angles.
3. **Features:** for each finger the backend calculates range of motion, minimum and maximum angle, peak speed, movements per minute and jerkiness.
4. **Predict:** random-forest models estimate the recovery score and each finger's status.
5. **Suggest:** simple, explainable rules turn the finger statuses into suggested exercises. The doctor confirms or changes them.

---

## Project structure

```
├── hardware/
│   └── esp32_flex_glove.ino    ESP32 firmware: reads 5 sensors at 50 Hz, sends JSON over Wi-Fi
├── ml/
│   ├── simulate_dataset.py     generates a realistic synthetic glove dataset
│   ├── train_model.py          trains and evaluates the models, saves rehab_models.joblib
│   └── data/                   session_features.csv (raw_readings.csv is generated)
├── backend/
│   ├── main.py                 FastAPI app: all API endpoints
│   ├── analysis.py             readings → angles → features → prediction → exercises
│   ├── database.py             SQLite tables (users, patients, sessions, exercises, logs, messages)
│   ├── auth.py                 password hashing + JWT login tokens
│   ├── exercises.py            exercise library
│   ├── emailer.py              discharge emails over SMTP
│   ├── seed_data.py            creates demo doctors and patients
│   └── test_*.py               small test scripts
├── neuroflex/                  React + TanStack Start frontend
└── requirements.txt
```

---

## Tech stack

| Part | Technology |
|---|---|
| Hardware | ESP32, 5 × flex sensors (voltage dividers), Wi-Fi HTTP |
| ML | Python, NumPy, pandas, scikit-learn (random forest) |
| Backend | FastAPI, SQLAlchemy, SQLite, JWT auth, bcrypt |
| Frontend | React, TanStack Start/Router, Tailwind CSS, Recharts |

---

## Running it locally

You need **Python 3.10+** and **Node.js 18+**. The commands below are for Windows PowerShell. On Mac or Linux, use `source venv/bin/activate` to activate the environment.

### 1. Python environment
```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Generate the dataset and train the model (one time)
```bash
cd ml
python simulate_dataset.py
python train_model.py
cd ..
```
This creates `ml/data/raw_readings.csv` and `ml/rehab_models.joblib`. Both are left out of git because they're large and quick to rebuild.

### 3. Create the demo database and start the backend
```bash
cd backend
python seed_data.py
uvicorn main:app --reload
```
The API runs at http://127.0.0.1:8000, and you can try it at http://127.0.0.1:8000/docs.

### 4. Start the frontend (in a second terminal)
```bash
cd neuroflex
npm install
npm run dev
```
Open http://localhost:8080.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Doctor | dr.mehta@demo.com | doctor123 |
| Doctor | dr.rao@demo.com | doctor123 |
| Patient | ravi@demo.com, lakshmi@demo.com, arjun@demo.com | patient123 |
| Patient | fatima@demo.com, joseph@demo.com, meena@demo.com | patient123 |

You can also register new doctors and patients from the login page.

### Sending real emails (optional)
By default, discharge emails are printed in the backend terminal. To send them for real, set these before starting uvicorn. For Gmail, use an App Password:
```powershell
$env:SMTP_HOST="smtp.gmail.com"; $env:SMTP_PORT="587"
$env:SMTP_USER="you@gmail.com";  $env:SMTP_PASSWORD="your-app-password"
```

---

## Main API endpoints

| Method | Endpoint | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | anyone | create an account / log in |
| GET | `/api/doctor/patients` | doctor | list of their patients |
| GET | `/api/doctor/patients/{id}/summary` | doctor | recovery history, finger analysis, current plan |
| POST | `/api/doctor/recommend` | doctor | save the exercise plan |
| POST | `/api/doctor/discharge` | doctor | mark recovered, send message and email |
| GET | `/api/patient/exercises` | patient | today's exercises |
| POST | `/api/patient/streak/check` | patient | tick an exercise as done |
| POST | `/api/glove/sessions` | glove | upload a recorded session for analysis |

---

## Current status and next steps

- [x] Synthetic dataset, feature extraction and ML models
- [x] Backend with login, roles, database, exercise plans, streaks and discharge email
- [x] Doctor and patient dashboards
- [ ] Hardware integration: calibrate each finger, and add a start/stop session flow on the glove
- [ ] Retrain the model on real patient sessions labelled by clinicians

**About the data:** the current model is trained on **synthetic** data that models the flex-sensor physics and typical post-stroke movement patterns. Its accuracy scores are therefore optimistic. It needs real, clinician-labelled recordings before any real-world use.
