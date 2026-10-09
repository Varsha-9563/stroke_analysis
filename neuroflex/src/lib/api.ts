import axios from "axios";

// Backend address. 127.0.0.1 (not "localhost") avoids an IPv6 mix-up on Windows.
// To point at a different backend, create a file `.env.local` with:
//   VITE_API_URL=http://192.168.1.50:8000
export const API_URL = import.meta.env["VITE_API_URL"] || "http://127.0.0.1:8000";

const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Expired or invalid login -> clear it and go back to the login page
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url: string = err?.config?.url ?? "";
    if (typeof window !== "undefined" && err?.response?.status === 401 && !url.includes("/api/auth/")) {
      ["token", "role", "user_id", "name"].forEach((k) => window.localStorage.removeItem(k));
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

export const registerUser = (data: Record<string, unknown>) => api.post("/api/auth/register", data);
export const loginUser = (data: { email: string; password: string }) => api.post("/api/auth/login", data);
export const listDoctors = () => api.get("/api/auth/doctors");
export const getMyPatients = () => api.get("/api/doctor/patients");
export const getPatientSummary = (pid: string) => api.get(`/api/doctor/patients/${pid}/summary`);
export const getPatientStreaks = (pid: string) => api.get(`/api/doctor/patients/${pid}/streaks`);
export const recommendExercises = (data: { patient_id: number; exercise_ids: number[]; notes: string }) => api.post("/api/doctor/recommend", data);
export const dischargePatient = (data: { patient_id: number }) => api.post("/api/doctor/discharge", data);
export const getMyProfile = () => api.get("/api/patient/me");
export const getMyExercises = () => api.get("/api/patient/exercises");
export const checkStreak = (data: { exercise_id: number; completed: boolean }) => api.post("/api/patient/streak/check", data);
export const getMyRecovery = () => api.get("/api/patient/recovery");
export const getAllExercises = () => api.get("/api/readings/exercises");

// ---- glove (live recording) ----
export const getGloveStatus = () => api.get("/api/patient/glove");
export const pairGlove = (device_id: string) => api.put("/api/patient/glove", { device_id });
export const getGloveLive = () => api.get("/api/patient/glove/live");
export const startRecording = (duration?: number) => api.post("/api/patient/glove/start", { duration });
export const stopRecording = () => api.post("/api/patient/glove/stop");
export const cancelRecording = () => api.post("/api/patient/glove/cancel");
export const calibrateGlove = (device_id: string, pose: "flat" | "bent") => api.post("/api/glove/calibrate", { device_id, pose });
export const resetCalibration = (device_id: string) => api.delete(`/api/glove/calibrate/${encodeURIComponent(device_id)}`);

// ---- analytics (today / week / 15 days / month / 3, 6, 12 months) ----
export const getMyAnalytics = (days: number) => api.get(`/api/patient/analytics?days=${days}`);
export const getPatientAnalytics = (pid: string, days: number) => api.get(`/api/doctor/patients/${pid}/analytics?days=${days}`);

// ---- CSV data files (every recording is appended) ----
export const getMyDataInfo = () => api.get("/api/patient/data");
export const getPatientDataInfo = (pid: string) => api.get(`/api/doctor/patients/${pid}/data`);
const fetchCsv = (url: string) => api.get(url, { responseType: "blob" });
export const downloadMyCsv = (kind: "sessions" | "readings") => fetchCsv(`/api/patient/data/${kind}.csv`);
export const downloadPatientCsv = (pid: string, kind: "sessions" | "readings") =>
  fetchCsv(`/api/doctor/patients/${pid}/data/${kind}.csv`);

/** Save a downloaded file (Blob) to the user's computer. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- healthy volunteers + doctor-level CSV ----
export const setPatientGroup = (pid: string, group: "patient" | "healthy") =>
  api.put(`/api/doctor/patients/${pid}/group`, { group });
export const downloadAllSessionsCsv = () => fetchCsv("/api/doctor/data/all_sessions.csv");
export const downloadHealthyCsv = () => fetchCsv("/api/doctor/data/healthy_reference.csv");
