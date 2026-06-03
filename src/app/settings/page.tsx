import { AppShell } from "@/components/layout/app-shell";
import { SettingsTabsClient } from "./settings-tabs-client";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const activeTab = params.tab || "profile";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-8 md:px-12">
        <h1 className="text-2xl font-bold text-neutral-900 tracking-tight mb-6">
          设置
        </h1>
        <SettingsTabsClient activeTab={activeTab} />
      </div>
    </AppShell>
  );
}
