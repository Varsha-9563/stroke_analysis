import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Activity, Hand } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return <div className={cn("brand", inverse && "brand-inverse")}><span className="brand-mark"><Hand size={18} /><Activity size={11} /></span>{!compact && <span>NEUROFLEX</span>}</div>;
}

export function Button({ className, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={cn("button", `button-${variant}`, className)} {...props} />;
}

export function LoadingState({ label = "Loading your workspace" }: { label?: string }) {
  return <div className="loading-state" role="status"><span className="spinner" /><p>{label}</p></div>;
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{children}</p></div>;
}

export function ProgressBar({ value, tone = "teal" }: { value: number | null; tone?: "teal" | "success" | "warning" }) {
  const safe = Math.max(0, Math.min(100, value ?? 0));
  return <div className="progress-track" aria-label={`${safe}%`}><span className={`progress-fill progress-${tone}`} style={{ width: `${safe}%` }} /></div>;
}
