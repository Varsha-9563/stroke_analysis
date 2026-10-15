import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Activity, Bell, CircleUserRound, Hand, House, LogOut, Menu, Users, X } from "lucide-react";
import { useEffect, useState, type ReactNode, useCallback } from "react";
import { Brand, Button } from "./ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getMyProfile, dismissMessage, getDoctorAlerts, dismissDoctorAlert } from "@/lib/api";
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
  const [messages, setMessages] = useState<{id: number, text: string, created_at: string}[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Dynamically fetch patient notifications OR doctor alerts
  const fetchMessages = useCallback(() => {
    if (role === "patient") {
      getMyProfile().then(r => setMessages(r.data.messages || [])).catch(() => {});
    } else if (role === "doctor") {
      getDoctorAlerts().then(r => setMessages(r.data.alerts || [])).catch(() => {});
    }
  }, [role]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (popoverOpen) fetchMessages();
  }, [popoverOpen, fetchMessages]);

  const handleDismiss = async (id: number) => {
    setMessages(prev => prev.filter(m => m.id !== id));
    try {
      if (role === "patient") await dismissMessage(id);
      else await dismissDoctorAlert(id);
    } catch (err) {
      // fail silently
    }
  };

  const nav = role === "doctor"
    ? [{ label: "Patients", icon: Users, to: "/doctor" as const }]
    : [
        { label: "My journey", icon: House, to: "/patient" as const },
        { label: "Glove session", icon: Hand, to: "/patient/glove" as const },
        { label: "Recovery analytics", icon: Activity, to: "/patient/analytics" as const },
      ];

  const here = pathname.replace(/\/$/, "") || "/";
  const logout = () => {
    localStorage.clear();
    navigate({ to: "/login" });
  };

  return (
    <div className="app-shell">
      <aside className={cn("sidebar", open && "sidebar-open")}>
        <div className="sidebar-top">
          <Brand />
          <Button variant="ghost" className="mobile-close" aria-label="Close navigation" onClick={() => setOpen(false)}><X size={19} /></Button>
        </div>
        <div className="portal-label">{role === "doctor" ? "Clinical workspace" : "Recovery portal"}</div>
        
        <nav className="side-nav" aria-label="Primary navigation">
          {nav.map(({ label, icon: Icon, to }) => (
            <Link key={to} to={to} activeOptions={{ exact: true }} className={cn("side-link", here === to && "active")} onClick={() => setOpen(false)}>
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
          
          {/* UNIVERSAL INTERACTIVE NOTIFICATIONS DROPDOWN */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button className="side-link" style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <Bell size={18} />
                <span>{role === "doctor" ? "Clinical Alerts" : "Notifications"}</span>
                {messages.length > 0 && (
                  <span className="count-pill" style={{ marginLeft: "auto", padding: "0.15rem 0.5rem" }}>
                    {messages.length}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="start" className="w-80 p-4 shadow-lg border-line">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-teal-deep">
                  {role === "doctor" ? "Clinical Alerts" : "Notifications"}
                </h3>
                <Bell size={15} className="text-teal-deep opacity-70" />
              </div>
              {messages.length === 0 ? (
                <p className="text-sm text-ink-soft">
                  {role === "doctor" ? "No critical patient alerts." : "No new notifications from your doctor."}
                </p>
              ) : (
                <div className="grid gap-3 max-h-[350px] overflow-auto pr-1">
                  {messages.map(m => (
                    <div key={m.id} className="text-sm border border-line rounded-xl p-3 bg-surface-2 relative group">
                      <p className="mb-2 leading-relaxed text-navy-900 pr-5">{m.text}</p>
                      <span className="text-xs text-ink-soft font-medium">
                        {new Date(m.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      </span>
                      <button 
                        onClick={() => handleDismiss(m.id)}
                        className="absolute top-2 right-2 text-ink-soft hover:text-danger bg-surface border border-line rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Dismiss"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </nav>

        <div className="sidebar-footer">
          <div className="profile-chip">
            <CircleUserRound size={28} />
            <div>
              <strong>{(typeof window !== "undefined" && localStorage.getItem("name")) || (role === "doctor" ? "Doctor" : "Patient")}</strong>
              <span>{role === "doctor" ? "Doctor" : "Patient"} · secure session</span>
            </div>
          </div>
          <Button variant="ghost" className="signout" onClick={logout}><LogOut size={17} /> Sign out</Button>
        </div>
      </aside>
      {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <div className="app-main">
        <header className="mobile-header">
          <Button variant="ghost" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu size={20} /></Button>
          <Brand compact />
          <span className="status-dot" />
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}