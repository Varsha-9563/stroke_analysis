# NeuroFlex: Smart Glove for Stroke Hand Rehabilitation

NeuroFlex measures how a stroke patient's fingers move and turns those readings into recovery insights for doctors and patients.

A glove with **four flex sensors** (index, middle, ring and pinky fingers) sends bend readings over Wi-Fi from an **ESP32**. A **machine-learning backend** analyses each session and estimates:
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
 ESP32 + 4 flex sensors ──Wi-Fi──▶  FastAPI backend  ──▶  NeuroFlex web app
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
│   ├── esp32_flex_glove.ino    ESP32 firmware: reads 4 sensors at 50 Hz, streams JSON over Wi-Fi
│   └── glove_simulator.py      pretends to be the glove, for demos without hardware
├── ml/
│   ├── simulate_dataset.py     generates a realistic synthetic glove dataset
│   ├── train_model.py          trains and evaluates the models, saves rehab_models.joblib
│   └── data/                   session_features.csv (raw_readings.csv is generated)
├── backend/
│   ├── main.py                 FastAPI app: login, doctor and patient endpoints
│   ├── glove.py                live glove stream, recording, calibration
│   ├── analytics.py            reports for today / 1 week / 15 days / 1, 3, 6, 12 months
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
| Hardware | ESP32, 4 × flex sensors on index, middle, ring and pinky (voltage dividers), Wi-Fi HTTP |
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

### 2. Generate the training dataset and train the model (one time)
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

## Recording a glove session

1. The glove streams its readings to the backend **every second, all the time**. It sends `POST /api/glove/readings` with 50 samples each time.
2. The patient opens **Glove session** in the sidebar and can watch each finger bend live.
3. The patient clicks **Start recording**, then opens and closes the hand for 20 seconds.
4. The backend analyses the recording with the ML model, saves it, and shows the score, each finger's result and the **change since the previous session**.
5. **Recovery analytics** compares sessions over **today, 1 week, 15 days, 1 month, 3 months, 6 months and 1 year**. The doctor sees the same report on the patient's profile.

**Demo tip:** record once, do the prescribed exercises, then record again. The **Today** report compares the two sessions.

### Without the hardware: glove simulator
```bash
cd hardware
python glove_simulator.py --device glove-03 --level 0.45
```
This sends exactly what the ESP32 sends. `glove-03` is Arjun's glove in the demo data. While it runs, you can type:
- a new level, such as `0.3`, then Enter. This makes the hand look better, for example after doing the exercises.
- `flat` or `fist` to hold the hand still in that position, for the calibration step
- `move` to go back to opening and closing the hand

### With the real glove (ESP32)
1. In `hardware/esp32_flex_glove.ino`, set:
   - `WIFI_SSID` and `WIFI_PASS`
   - `SERVER_URL` to `http://<laptop-IP>:8000/api/glove/readings`. On Windows, `ipconfig` shows the laptop's IPv4 address.
   - `DEVICE_ID`, for example `glove-01`
2. Start the backend so the glove can reach it over the network:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0
   ```
   If Windows Firewall asks, allow Python on **Private networks**.
3. Log in as the patient, open **Glove session**, and pair the glove by typing its `DEVICE_ID`.
4. **Calibrate the glove once**, using **Glove session → Glove setup**. A person with healthy hand movement (not the patient) wears the glove, holds the hand flat and clicks **Capture flat**, then makes a fist and clicks **Capture fist**. After this, the readings are correct whichever direction your sensors change when bent.

---

## Data files (CSV)

Every glove recording is **appended automatically** to CSV files in `backend/data/`. This folder holds patient data, so it is not pushed to git.

| File | One row per | Main columns |
|---|---|---|
| `all_sessions.csv` | recording, all patients | patient, date, **day**, recovery score, change from first and previous session, range of motion, bends and status per finger |
| `patients/P0003_sessions.csv` | recording of one patient | same as above |
| `patients/P0003_readings.csv` | sensor reading (50 per second) | patient, session, **day**, time (ms), raw value and angle of each finger |

**day** is the number of days since the patient's first recording, so day 0 is the first session. The analytics use it to measure recovery over time, including the **recovery speed** in points per week and an estimate of the days left to reach the 85% target.

Doctors and patients can download these files from **Recovery analytics → Data files**.

---

## Healthy reference and recovery prediction

**Healthy reference:** on a patient's page, a doctor can click **Mark as healthy volunteer**. That person's recordings are then added to `healthy_reference.csv`, and the backend works out the average healthy range of motion and bends for each finger *on this glove*. Every patient's result is shown as a **% of healthy**. When at least 3 healthy volunteers have been recorded with the real glove, only their real recordings are used.

**Recovery prediction** (`backend/forecast.py`): each new recording refits this curve to all of the patient's `(day, recovery score)` points:

```
score(day) = plateau - (plateau - start) * e^(-speed * day)
```

Recovery after a stroke is usually quick at first and then levels off, which is what this curve describes. The backend uses it to predict the score **in 30 and 90 days**, the **day the patient reaches 85%**, or whether recovery is **levelling off below the target**. With fewer than 4 sessions it uses a straight line instead.

## Collecting healthy-volunteer data (one glove, many people)

1. **Calibrate the glove once** (Glove session → Glove setup, flat then fist) and don't change it afterwards. Healthy people and patients must be measured with the same calibration.
2. For each volunteer:
   - They **register** (role: patient, choose the doctor).
   - The doctor opens them and clicks **Mark as healthy volunteer**.
   - The volunteer logs in, opens **Glove session**, types the glove ID and pairs it (the glove moves to them), then records **3 times**.
3. Their recordings are saved in:
   - `backend/data/healthy_reference.csv`: one row per recording
   - `backend/data/patients/P00XX_readings.csv`: every raw reading
   - `backend/rehab.db`: the database
4. When you're done, just stop recording volunteers. Patients' recordings automatically go to the patient group.

`seed_data.py` will **not** delete real glove recordings unless you run it with `--force`, and it always saves a backup to `backend/data_backup_<date>/` first.

## Demo data (synthetic)

`python seed_data.py` creates **8 healthy volunteers** (3 recordings each) and **10 stroke patients** who have been in rehab from 2 weeks to 1 year, each with a different recovery pattern:

| Patient | In rehab | Pattern |
|---|---|---|
| Ravi Kumar | 12 months | full recovery |
| Lakshmi Iyer | 9 months | steady |
| Arjun Nair | 6 months | levels off below the target |
| Fatima Sheikh | 6 months | fast responder |
| Joseph D'Souza | 4 months | steady |
| Meena Pillai | 3 months | steady |
| Priya Menon | 3 months | fast responder |
| Rahul Verma | 2 months | slow |
| Sneha Kulkarni | 1 month | on track |
| Imran Khan | 2 weeks | just started |

These are **simulated people, not real patients**. Every row in the CSV files has `data_source = synthetic`. Real recordings are marked `glove`, and recordings from the simulator are marked `simulator`.

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
| POST | `/api/glove/readings` | glove | live stream, every second |
| GET | `/api/patient/glove/live` | patient | live finger angles |
| POST | `/api/patient/glove/start`, `/stop` | patient | record a session, then analyse and save it |
| POST | `/api/glove/calibrate` | logged in | one-time flat/fist calibration of a glove |
| GET | `/api/patient/analytics?days=N` | patient | report for N = 1, 7, 15, 30, 90, 180 or 365 days |
| GET | `/api/doctor/patients/{id}/analytics?days=N` | doctor | the same report for one patient |
| POST | `/api/glove/sessions` | glove | upload a whole recorded session at once |

---

## Current status and next steps

- [x] Synthetic dataset, feature extraction and ML models
- [x] Backend with login, roles, database, exercise plans, streaks and discharge email
- [x] Doctor and patient dashboards
- [x] Live glove streaming, recording from the website, per-glove calibration, glove simulator
- [x] Recovery analytics for today, 1 week, 15 days, and 1, 3, 6 and 12 months
- [ ] Test with the finished glove hardware
- [ ] Retrain the model on real patient sessions labelled by clinicians

**About the data:** the current model is trained on **synthetic** data that models the flex-sensor physics and typical post-stroke movement patterns. Its accuracy scores are therefore optimistic. It needs real, clinician-labelled recordings before any real-world use.
