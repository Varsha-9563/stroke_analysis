import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Activity, Bell, CircleUserRound, House, LogOut, Menu, Users, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Brand, Button } from "./ui";
import { cn } from "@/lib/utils";

type Role = "doctor" | "patient";

export function Protected({ role, children }: { role: Role; children: ReactNode }) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedRole = localStorage.getItem("role");
    if (!token) navigate({ to: "/login", replace: true });
    else if (storedRole !== role) navigate({ to: storedRole === "doctor" ? "/doctor" : storedRole === "patient" ? "/patient" : "/login", replace: true });
    else setReady(true);
  }, [navigate, role]);
  return ready ? children : null;
}

export function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const nav = role === "doctor"
    ? [{ label: "Patients", icon: Users, to: "/doctor" as const }]
    : [{ label: "My journey", icon: House, to: "/patient" as const }];
  const logout = () => {
    localStorage.clear();
    navigate({ to: "/login" });
  };
  return <div className="app-shell">
    <aside className={cn("sidebar", open && "sidebar-open")}>
      <div className="sidebar-top"><Brand /><Button variant="ghost" className="mobile-close" aria-label="Close navigation" onClick={() => setOpen(false)}><X size={19} /></Button></div>
      <div className="portal-label">{role === "doctor" ? "Clinical workspace" : "Recovery portal"}</div>
      <nav className="side-nav" aria-label="Primary navigation">
        {nav.map(({ label, icon: Icon, to }) => <Link key={to} to={to} activeOptions={{ exact: true }} className={cn("side-link", pathname === to && "active")} onClick={() => setOpen(false)}><Icon size={18} /><span>{label}</span></Link>)}
        <span className="side-link side-link-muted"><Activity size={18} /><span>Recovery analytics</span><small>Soon</small></span>
        <span className="side-link side-link-muted"><Bell size={18} /><span>Notifications</span><small>Soon</small></span>
      </nav>
      <div className="sidebar-footer"><div className="profile-chip"><CircleUserRound size={28} /><div><strong>{(typeof window !== "undefined" && localStorage.getItem("name")) || (role === "doctor" ? "Doctor" : "Patient")}</strong><span>{role === "doctor" ? "Doctor" : "Patient"} · secure session</span></div></div><Button variant="ghost" className="signout" onClick={logout}><LogOut size={17} /> Sign out</Button></div>
    </aside>
    {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <div className="app-main"><header className="mobile-header"><Button variant="ghost" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu size={20} /></Button><Brand compact /><span className="status-dot" /></header><main>{children}</main></div>
  </div>;
}
