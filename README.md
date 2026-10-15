# NeuroFlex: Smart Glove for Stroke Hand Rehabilitation

NeuroFlex is a smart rehabilitation system that measures finger movements using a sensor-equipped glove and converts the readings into recovery insights for patients and doctors.

The system uses **four flex sensors** (index, middle, ring, and pinky fingers) connected to an **ESP32**. The glove transmits sensor readings over Wi-Fi to a Python backend, where machine-learning models analyse rehabilitation sessions and estimate recovery progress.

### Key Features

- **Recovery Score:** Estimates a patient's recovery progress on a scale of 0–100.
- **Finger-wise Analysis:** Classifies each finger's movement as good, moderate, or severe.
- **Exercise Recommendations:** Suggests exercises based on finger movement and impairment levels.
- **Live Glove Monitoring:** Streams sensor readings and displays finger movements in real time.
- **Doctor Dashboard:** Provides patient management, recovery charts, session history, and finger-wise analysis.
- **Patient Dashboard:** Displays prescribed exercises, daily checklists, recovery progress, and activity streaks.
- **Automated Alerts:** Notifies doctors when performance drops significantly or a recovery target is reached.
- **Discharge Notifications:** Sends automated emails when a doctor marks a patient as recovered.
- **Recovery Analytics:** Generates reports for daily, weekly, 15-day, and monthly reporting periods.
- **Data Export:** Allows doctors and patients to download session history and sensor readings.

> **Disclaimer:** NeuroFlex is a rehabilitation support system intended to assist clinical decision-making. It is not a diagnostic tool and does not replace professional medical assessment.

---

## How It Works

```text
ESP32 + 4 Flex Sensors
          |
          | Wi-Fi / HTTP
          v
    FastAPI Backend
          |
          +--> Sensor Reading Processing
          |
          +--> Bend Angle Conversion
          |
          +--> Feature Extraction
          |
          +--> Machine Learning Models
          |       |
          |       +--> Recovery Score
          |       +--> Finger Status
          |
          +--> Exercise Recommendations
          |
          +--> Automated Alerts
          |
          +--> SQLite Database
          |
          v
      NeuroFlex Web App
          |
          +--> Doctor Dashboard
          |
          +--> Patient Dashboard
```

### Processing Pipeline

1. **Sensor Data Acquisition:** Four flex sensors measure finger bending through voltage-divider circuits. The ESP32 reads the analogue signals and transmits the readings to the backend.
2. **Angle Conversion:** Raw ADC readings (0–4095) are converted into approximate finger bend angles using calibration data.
3. **Feature Extraction:** The backend calculates movement features, including range of motion, minimum and maximum angles, peak speed, movements per minute, and movement jerkiness.
4. **Machine Learning:** Random Forest models estimate the recovery score and classify the movement status of each finger.
5. **Exercise Recommendations:** Rule-based logic suggests exercises based on the predicted finger status.
6. **Progress Monitoring:** The system compares consecutive sessions to identify performance regressions and recovery milestones.
7. **Notifications and Storage:** Results are stored in the database, and relevant alerts are displayed on the doctor's dashboard.

---

## Project Structure

```text
stroke_analysis/
├── backend/
│   ├── main.py
│   ├── glove.py
│   ├── analytics.py
│   ├── analysis.py
│   ├── database.py
│   ├── auth.py
│   ├── exercises.py
│   ├── emailer.py
│   ├── seed_data.py
│   └── test_*.py
│
├── hardware/
│   ├── esp32_flex_glove.ino
│   └── glove_simulator.py
│
├── ml/
│   ├── data/
│   ├── simulate_dataset.py
│   ├── evaluate_model.py
│   └── train_model.py
│
├── neuroflex/
│   └── React + TanStack Start frontend
│
├── requirements.txt
├── .gitignore
└── README.md
```

**Note:** The structure above describes the main components. Some generated files, model artifacts, and local database files may be created when the application runs.

---

## Technology Stack

| Component | Technologies |
|---|---|
| Hardware | ESP32, four flex sensors, voltage-divider circuits |
| Communication | Wi-Fi, HTTP, JSON |
| Backend | Python, FastAPI |
| Machine Learning | NumPy, pandas, scikit-learn |
| ML Algorithms | Random Forest Regressor, Random Forest Classifier |
| Database | SQLite, SQLAlchemy |
| Authentication | JWT, bcrypt |
| Frontend | React, TanStack Start, TanStack Router |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Notifications | SMTP email, in-app alerts |
| Data Export | CSV |

---

## Getting Started

### Prerequisites

Install the following before running the project:

- Python 3.10 or later
- Node.js 18 or later
- npm
- Git

### 1. Clone the Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd stroke_analysis
```

Replace `<YOUR_GITHUB_REPOSITORY_URL>` with your repository URL.

### 2. Set Up the Python Environment

Create and activate a virtual environment.

**Windows — PowerShell**

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**macOS / Linux**

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Train the Machine-Learning Models

From the project root:

```bash
cd ml
python simulate_dataset.py
python evaluate_model.py
cd ..
```

The dataset-generation step can be skipped if the required generated datasets are already available.

The training and evaluation scripts prepare the machine-learning artifacts required by the backend. Ensure the generated model filename matches the filename expected by the backend.

### 4. Initialize the Database

```bash
cd backend
python seed_data.py
```

This initializes the demo data required for testing the application.

### 5. Start the Backend

From the `backend` directory:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The backend API will be available at:

- API base URL: `http://127.0.0.1:8000`
- Interactive API documentation: `http://127.0.0.1:8000/docs`

### 6. Start the Frontend

Open a second terminal:

```bash
cd neuroflex
npm install
npm run dev
```

Open the local URL printed by the frontend development server.

---

## Demo Accounts

The following accounts are intended for local demonstration after the demo database has been initialized.

| Role | Email | Password |
|---|---|---|
| Doctor | `dr.mehta@demo.com` | `doctor123` |
| Doctor | `dr.rao@demo.com` | `doctor123` |
| Patient | `ravi@demo.com` | `patient123` |
| Patient | `lakshmi@demo.com` | `patient123` |
| Patient | `arjun@demo.com` | `patient123` |
| Patient | `fatima@demo.com` | `patient123` |
| Patient | `joseph@demo.com` | `patient123` |
| Patient | `meena@demo.com` | `patient123` |

**Security note:** These are demo credentials only. Never use them in production or expose real patient information in a public repository.

---

## Running Without Hardware

NeuroFlex includes a glove simulator that sends simulated sensor readings to the backend, allowing the application to be demonstrated without a physical glove.

From the project root:

```bash
cd hardware
python glove_simulator.py --device glove-03 --level 0.45
```

The impairment level can be adjusted to simulate different movement patterns. Supported interactive commands may also be used for calibration scenarios, depending on the simulator implementation.

Ensure the backend is running before starting the simulator.

---

## Using the Physical Glove

### Hardware Setup

The glove uses an ESP32 and four flex sensors positioned over the index, middle, ring, and pinky fingers.

Each flex sensor is connected using a voltage-divider circuit to an analogue input on the ESP32.

### Configuration

Open `hardware/esp32_flex_glove.ino` and configure:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL =
    "http://YOUR_LAPTOP_IP:8000/api/glove/readings";
```

Use the computer's local network IP address instead of `127.0.0.1`, because the ESP32 must reach the backend over the network.

Ensure both devices are connected to a network that permits communication between them.

### Recording a Session

1. Start the FastAPI backend.
2. Connect the ESP32 glove to Wi-Fi.
3. Configure the backend URL and device ID.
4. Log in using a patient account.
5. Open **Glove Session** in the patient dashboard.
6. Pair the glove using its device ID.
7. Calibrate the glove by capturing the flat-hand and fist positions.
8. Start recording and perform the prescribed hand movements.
9. Stop the recording and review the generated analysis.

The backend processes the recorded readings, calculates movement features, predicts the recovery score, evaluates individual fingers, and stores the session for future progress comparisons.

---

## Recovery Analytics and Data Export

The application provides recovery reports across the following periods:

- Today
- 1 week
- 15 days
- 1 month
- 3 months
- 6 months
- 12 months

The system also maintains CSV exports of session history and sensor readings.

| File | Description |
|---|---|
| `all_sessions.csv` | Session-level recovery data across patients |
| `patients/P0003_sessions.csv` | Session history for an individual patient |
| `patients/P0003_readings.csv` | Sensor readings and calculated angles for an individual patient |

The exact file paths and available exports depend on the backend configuration and the data generated during execution.

---

## Notifications and Alerts

NeuroFlex includes an automated notification workflow for significant recovery events.

- **Performance regression:** Compares a patient's current session against previous sessions and generates an alert when the configured threshold is reached.
- **Recovery milestone:** Generates an alert when a patient reaches the configured recovery target.
- **Discharge notification:** Sends an email when a doctor marks a patient as recovered.
- **Doctor dashboard:** Displays relevant alerts to support patient follow-up.

The regression threshold and recovery target are configurable according to the backend implementation.

### Optional: Enable Email Notifications

By default, discharge email messages can be printed in the backend terminal during local development.

To configure SMTP email delivery, set the following environment variables in PowerShell:

```powershell
$env:SMTP_HOST="smtp.gmail.com"
$env:SMTP_PORT="587"
$env:SMTP_USER="your-email@gmail.com"
$env:SMTP_PASSWORD="your-app-password"
```

Restart the backend after configuring the environment variables.

For Gmail, use an app password where required. Do not commit SMTP credentials or other secrets to GitHub.

---

## Security and Privacy

- Passwords are hashed before storage.
- JWT tokens are used for authenticated access.
- Doctor and patient roles provide role-specific application functionality.
- Local databases, backups, credentials, and sensitive configuration should remain excluded from version control.
- Real patient data should not be uploaded to a public repository.

---

## Current Status and Future Improvements

- [x] Synthetic rehabilitation dataset generation.
- [x] Feature extraction and machine-learning model pipeline.
- [x] Recovery score and finger-status predictions.
- [x] FastAPI backend and role-based authentication.
- [x] Doctor and patient dashboards.
- [x] Exercise recommendations and daily checklists.
- [x] Live glove streaming and session recording.
- [x] Glove calibration and hardware simulator.
- [x] Automated recovery alerts and discharge emails.
- [x] Recovery analytics and CSV data exports.
- [ ] Validate the complete system with the physical glove hardware.
- [ ] Evaluate model performance using independently collected real-world data.
- [ ] Retrain and validate the models using clinician-labelled rehabilitation sessions.
- [ ] Further validate recovery scores and alert thresholds with clinical expertise.

---

## Disclaimer

NeuroFlex is an educational and engineering project demonstrating sensor-based rehabilitation monitoring, machine learning, and web application development.

Its recovery scores, finger classifications, and exercise recommendations are estimates based on the available data and models. They have not been established as clinically validated diagnostic measures. Clinical use requires appropriate validation, privacy safeguards, and professional oversight.
