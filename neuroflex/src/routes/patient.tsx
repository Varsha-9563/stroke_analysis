import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell, Protected } from "@/components/app-shell";

// Layout for every patient page: login check + sidebar. Pages render in <Outlet />.
export const Route = createFileRoute("/patient")({
  head: () => ({
    meta: [
      { title: "My recovery — NeuroFlex" },
      { name: "description", content: "Track daily rehabilitation exercises and hand movement recovery." },
      { property: "og:title", content: "My recovery — NeuroFlex" },
      { property: "og:description", content: "Your exercises and recovery progress in one clear workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <Protected role="patient">
      <AppShell role="patient">
        <Outlet />
      </AppShell>
    </Protected>
  ),
});
