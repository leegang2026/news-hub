"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ArticleFilterBarProps {
  sources: { id: string; name: string }[];
}

export function ArticleFilterBar({ sources }: ArticleFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentDate = searchParams.get("date") || "";
  const currentSource = searchParams.get("source") || "";

  function updateParams(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function clearAll() {
    router.replace("", { scroll: false });
  }

  const hasFilters = currentDate || currentSource;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Date filter */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-neutral-500">日期</label>
        <input
          type="date"
          value={currentDate}
          onChange={(e) => updateParams("date", e.target.value)}
          className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
        />
      </div>

      {/* Source filter */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-neutral-500">来源</label>
        <select
          value={currentSource}
          onChange={(e) => updateParams("source", e.target.value)}
          className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400 max-w-[160px]"
        >
          <option value="">全部来源</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Clear button */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs text-neutral-500"
          onClick={clearAll}
        >
          <X className="h-3 w-3" />
          清除筛选
        </Button>
      )}
    </div>
  );
}
