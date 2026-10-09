import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPanel } from "@/components/analytics-panel";
import { downloadMyCsv, getMyAnalytics, getMyDataInfo } from "@/lib/api";

export const Route = createFileRoute("/patient/analytics")({
  head: () => ({ meta: [{ title: "Recovery analytics — NeuroFlex" }] }),
  component: PatientAnalytics,
});

function PatientAnalytics() {
  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Recovery analytics</span>
          <h1>How your hand is recovering</h1>
          <p>Compare your glove sessions over a day, a week, 15 days, or 1, 3, 6 and 12 months.</p>
        </div>
      </header>
      <AnalyticsPanel load={getMyAnalytics} initialDays={30} csv={{ info: getMyDataInfo, download: downloadMyCsv }} />
    </div>
  );
}
