"use client";

import { Settings, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BoardHeaderProps {
  name: string;
  icon: string;
  description: string;
  count: number;
  onRefreshClick?: () => void;
  onSettingsClick?: () => void;
}

export function BoardHeader({ name, icon, description, count, onRefreshClick, onSettingsClick }: BoardHeaderProps) {
  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-3xl">{icon}</span>
            <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">
              {name}
            </h1>
          </div>
          <p className="mt-1 text-sm text-neutral-500">{description}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-neutral-500" onClick={onRefreshClick}>
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-neutral-500" onClick={onSettingsClick}>
            <Settings className="h-3.5 w-3.5" />
            来源设置
          </Button>
        </div>
      </div>
      <div className="mt-3 text-xs text-neutral-400">
        共 {count} 篇文章
      </div>
    </div>
  );
}
