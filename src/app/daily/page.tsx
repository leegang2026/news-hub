import { AppShell } from "@/components/layout/app-shell";
import { DailyReportView } from "@/components/daily/daily-report-view";

export default function DailyPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-6 py-8 md:px-12">
        <DailyReportView report={null} />
      </div>
    </AppShell>
  );
}
