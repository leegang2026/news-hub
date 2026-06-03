"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { BoardSettings } from "@/components/settings/board-settings";
import { WechatSettings } from "@/components/settings/wechat-settings";
import { AISettings } from "@/components/settings/ai-settings";
import { CriteriaSettings } from "@/components/settings/criteria-settings";

const tabDefs = [
  { value: "profile", label: "个人资料" },
  { value: "boards", label: "板块管理" },
  { value: "ai", label: "AI 引擎" },
  { value: "criteria", label: "默认标准" },
  { value: "wechat", label: "微信推送" },
];

export function SettingsTabsClient({ activeTab: initialTab }: { activeTab: string }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const router = useRouter();

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    router.replace(`/settings?tab=${value}`, { scroll: false });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="mb-6 bg-neutral-100 flex-wrap h-auto">
        {tabDefs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="text-sm">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="profile">
        <ProfileSettings />
      </TabsContent>
      <TabsContent value="boards">
        <BoardSettings />
      </TabsContent>
      <TabsContent value="ai">
        <AISettings />
      </TabsContent>
      <TabsContent value="criteria">
        <CriteriaSettings />
      </TabsContent>
      <TabsContent value="wechat">
        <WechatSettings />
      </TabsContent>
    </Tabs>
  );
}
