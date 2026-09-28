import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeft, Check, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import gloveImage from "@/assets/neuroflex-glove.jpg";
import { Brand, Button } from "@/components/ui";
import { listDoctors, loginUser, registerUser } from "@/lib/api";

const searchSchema = z.object({ role: z.enum(["doctor", "patient"]).optional().catch(undefined) });
export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  head: () => ({ meta: [
    { title: "Sign in — NeuroFlex" },
    { name: "description", content: "Secure access for NeuroFlex doctors and rehabilitation patients." },
    { property: "og:title", content: "Sign in — NeuroFlex" },
    { property: "og:description", content: "Access your NeuroFlex clinical or recovery workspace." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: LoginPage,
});

type Doctor = { doctor_id: number; full_name: string; specialization?: string };
function LoginPage() {
  const navigate = useNavigate(); const { role: initialRole } = Route.useSearch();
  const [mode,setMode]=useState<"login"|"register">("login"); const [role,setRole]=useState<"doctor"|"patient">(initialRole ?? "doctor");
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [fullName,setFullName]=useState(""); const [doctorId,setDoctorId]=useState("");
  const [doctors,setDoctors]=useState<Doctor[]>([]); const [error,setError]=useState(""); const [loading,setLoading]=useState(false); const [showPassword,setShowPassword]=useState(false); const [remember,setRemember]=useState(true);
  useEffect(()=>{ if(mode === "register" && role === "patient" && !doctors.length) listDoctors().then(r=>setDoctors(r.data)).catch(()=>setError("We couldn't load the doctor list. Please try again.")); },[mode,role,doctors.length]);
  async function submit(e:FormEvent){e.preventDefault();setError("");setLoading(true);try{let res;if(mode==="login")res=await loginUser({email,password});else{const payload:Record<string,unknown>={email,password,full_name:fullName,role};if(role==="patient")payload["doctor_id"]=parseInt(doctorId);res=await registerUser(payload);}const {access_token,role:userRole}=res.data;localStorage.setItem("token",access_token);localStorage.setItem("role",userRole);localStorage.setItem("user_id",String(res.data.user_id));localStorage.setItem("name",res.data.name??"");if(remember)localStorage.setItem("remember","true");else localStorage.removeItem("remember");navigate({to:userRole==="doctor"?"/doctor":"/patient"});}catch(err:any){setError(err?.response?.data?.detail||"We couldn't sign you in. Check your details and try again.");}finally{setLoading(false)}}
  return <main className="auth-layout"><section className="auth-story"><div className="auth-story-top"><Link to="/" className="back-home"><ArrowLeft/> Back to home</Link><Brand inverse/></div><div className="auth-story-copy"><span className="eyebrow eyebrow-light">Precision in practice</span><h1>Every movement tells part of the recovery story.</h1><p>NeuroFlex turns smart-glove readings into clear progress insights for rehabilitation teams and the people they support.</p><div className="auth-benefits"><span><Check/> Five-finger movement analysis</span><span><Check/> Clear recovery trends</span><span><Check/> Connected exercise tracking</span></div></div><img src={gloveImage} alt="NeuroFlex rehabilitation glove" width={1200} height={1008}/></section><section className="auth-form-side"><div className="auth-form-wrap"><div className="mobile-auth-brand"><Brand/></div><p className="overline">Secure workspace</p><h2>{mode==="login"?"Welcome back":"Create your account"}</h2><p className="form-intro">{mode==="login"?"Sign in to continue to your personalized workspace.":"Join your rehabilitation care workspace."}</p><div className="auth-tabs"><Button type="button" variant={mode==="login"?"primary":"ghost"} onClick={()=>{setMode("login");setError("")}}>Sign in</Button><Button type="button" variant={mode==="register"?"primary":"ghost"} onClick={()=>{setMode("register");setError("")}}>Register</Button></div><div className="role-switch"><button type="button" className={role==="doctor"?"active":""} onClick={()=>setRole("doctor")}>Doctor</button><button type="button" className={role==="patient"?"active":""} onClick={()=>setRole("patient")}>Patient</button></div>{error&&<div className="form-error" role="alert">{error}</div>}<form onSubmit={submit}>{mode==="register"&&<><label>Full name<input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder={role==="doctor"?"Dr. Ramesh Kumar":"Your full name"} required/></label>{role==="patient"&&<label>Assigned doctor<select value={doctorId} onChange={e=>setDoctorId(e.target.value)} required><option value="">Select your doctor</option>{doctors.map(d=><option key={d.doctor_id} value={d.doctor_id}>{d.full_name}{d.specialization?` — ${d.specialization}`:""}</option>)}</select></label>}</>}<label>Email address<div className="input-icon"><Mail/><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required/></div></label><label>Password<div className="input-icon password-input"><LockKeyhole/><input type={showPassword?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" autoComplete={mode==="login"?"current-password":"new-password"} required/><button type="button" aria-label={showPassword?"Hide password":"Show password"} onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff/>:<Eye/>}</button></div></label>{mode==="login"&&<div className="form-options"><label className="remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> Remember me</label><span title="Password reset is not supported by the current service">Forgot password?</span></div>}<Button className="submit-button" disabled={loading}>{loading?"Please wait…":mode==="login"?`Sign in as ${role}`:"Create account"}</Button></form><p className="auth-disclaimer">Your access is secured by the existing NeuroFlex account service.</p></div></section></main>;
}
