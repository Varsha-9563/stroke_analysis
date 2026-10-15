import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeft, Check, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import gloveImage from "@/assets/neuroflex-glove.jpg";
import { Brand, Button } from "@/components/ui";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { listDoctors, loginUser, registerUser, sendOtp } from "@/lib/api";

const searchSchema = z.object({ role: z.enum(["doctor", "patient"]).optional().catch(undefined) });
export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Sign in — NeuroFlex" }] }),
  component: LoginPage,
});

type Doctor = { doctor_id: number; full_name: string; specialization?: string };

function LoginPage() {
  const navigate = useNavigate(); 
  const { role: initialRole } = Route.useSearch();
  const [mode, setMode] = useState<"login" | "register">("login"); 
  const [step, setStep] = useState<"form" | "otp">("form");
  const [role, setRole] = useState<"doctor" | "patient">(initialRole ?? "doctor");
  const [email, setEmail] = useState(""); 
  const [password, setPassword] = useState(""); 
  const [fullName, setFullName] = useState(""); 
  const [doctorId, setDoctorId] = useState("");
  const [otp, setOtp] = useState("");
  const [doctors, setDoctors] = useState<Doctor[]>([]); 
  const [error, setError] = useState(""); 
  const [loading, setLoading] = useState(false); 
  const [showPassword, setShowPassword] = useState(false); 
  const [remember, setRemember] = useState(true);

  useEffect(() => { 
    if(mode === "register" && role === "patient" && !doctors.length) {
      listDoctors().then(r => setDoctors(r.data)).catch(() => setError("We couldn't load the doctor list.")); 
    }
  }, [mode, role, doctors.length]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const res = await loginUser({ email, password });
        handleSuccess(res.data);
      } else {
        if (step === "form") {
          await sendOtp({ email });
          setStep("otp");
          setLoading(false);
          return; // Stop here, wait for OTP input
        } else {
          const payload: Record<string, unknown> = { email, password, full_name: fullName, role, otp };
          if (role === "patient") payload["doctor_id"] = parseInt(doctorId);
          const res = await registerUser(payload);
          handleSuccess(res.data);
        }
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || "An error occurred. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSuccess(data: any) {
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("role", data.role);
    localStorage.setItem("user_id", String(data.user_id));
    localStorage.setItem("name", data.name ?? "");
    if (remember) localStorage.setItem("remember", "true");
    else localStorage.removeItem("remember");
    navigate({ to: data.role === "doctor" ? "/doctor" : "/patient" });
  }

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="auth-story-top">
          <Link to="/" className="back-home"><ArrowLeft/> Back to home</Link>
          <Brand inverse/>
        </div>
        <div className="auth-story-copy">
          <span className="eyebrow eyebrow-light">Precision in practice</span>
          <h1>Every movement tells part of the recovery story.</h1>
          <p>NeuroFlex turns smart-glove readings into clear progress insights.</p>
        </div>
        <img src={gloveImage} alt="NeuroFlex" width={1200} height={1008}/>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <p className="overline">Secure workspace</p>
          <h2>{mode === "login" ? "Welcome back" : step === "otp" ? "Check your email" : "Create your account"}</h2>
          <p className="form-intro">
            {mode === "login" ? "Sign in to continue." : step === "otp" ? `We sent a 6-digit code to ${email}` : "Join your rehabilitation workspace."}
          </p>

          {step === "form" && (
            <div className="auth-tabs">
              <Button type="button" variant={mode === "login" ? "primary" : "ghost"} onClick={() => { setMode("login"); setError(""); }}>Sign in</Button>
              <Button type="button" variant={mode === "register" ? "primary" : "ghost"} onClick={() => { setMode("register"); setError(""); }}>Register</Button>
            </div>
          )}

          {mode === "register" && step === "form" && (
            <div className="role-switch">
              <button type="button" className={role === "doctor" ? "active" : ""} onClick={() => setRole("doctor")}>Doctor</button>
              <button type="button" className={role === "patient" ? "active" : ""} onClick={() => setRole("patient")}>Patient</button>
            </div>
          )}

          {error && <div className="form-error" role="alert">{error}</div>}

          <form onSubmit={submit}>
            {step === "otp" ? (
              <div style={{ display: "grid", placeItems: "center", margin: "1rem 0" }}>
                <InputOTP maxLength={6} value={otp} onChange={setOtp} required>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
                    <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            ) : (
              <>
                {mode === "register" && (
                  <>
                    <label>Full name
                      <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder={role === "doctor" ? "Dr. Ramesh Kumar" : "Your full name"} required/>
                    </label>
                    {role === "patient" && (
                      <label>Assigned doctor
                        <select value={doctorId} onChange={e => setDoctorId(e.target.value)} required>
                          <option value="">Select your doctor</option>
                          {doctors.map(d => <option key={d.doctor_id} value={d.doctor_id}>{d.full_name}</option>)}
                        </select>
                      </label>
                    )}
                  </>
                )}
                <label>Email address
                  <div className="input-icon">
                    <Mail/><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required/>
                  </div>
                </label>
                <label>Password
                  <div className="input-icon password-input">
                    <LockKeyhole/><input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required/>
                    <button type="button" onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff/> : <Eye/>}</button>
                  </div>
                </label>
              </>
            )}

            <Button className="submit-button" disabled={loading || (step === "otp" && otp.length < 6)}>
              {loading ? "Please wait…" : step === "otp" ? "Verify and Create Account" : mode === "login" ? `Sign in as ${role}` : "Send Verification Code"}
            </Button>
            
            {step === "otp" && (
              <Button type="button" variant="ghost" onClick={() => { setStep("form"); setOtp(""); }} style={{ width: "100%" }}>
                Back to details
              </Button>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}