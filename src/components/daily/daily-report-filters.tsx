"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DailyReport } from "@/types";
import { exportMarkdown, exportWord, exportPdf } from "@/lib/export-report";

interface DailyReportFiltersProps {
  report: DailyReport;
  boardNames: { id: string; name: string }[];
  selectedDate: string;
  selectedBoard: string;
  onDateChange: (date: string) => void;
  onBoardChange: (boardId: string) => void;
}

export function DailyReportFilters({
  report,
  boardNames,
  selectedDate,
  selectedBoard,
  onDateChange,
  onBoardChange,
}: DailyReportFiltersProps) {
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Date picker */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-neutral-500">日期</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
        />
      </div>

      {/* Board filter */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-neutral-500">板块</label>
        <select
          value={selectedBoard}
          onChange={(e) => onBoardChange(e.target.value)}
          className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400 max-w-[160px]"
        >
          <option value="">全部板块</option>
          {boardNames.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* Export button */}
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs text-neutral-500"
          onClick={() => setExportOpen(!exportOpen)}
        >
          <Download className="h-3.5 w-3.5" />
          导出
        </Button>
        {exportOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 w-36 rounded-lg border border-neutral-200 bg-white shadow-lg py-1">
              <button
                className="w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                onClick={() => { exportMarkdown(report); setExportOpen(false); }}
              >
                Markdown (.md)
              </button>
              <button
                className="w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                onClick={() => { exportWord(report); setExportOpen(false); }}
              >
                Word (.doc)
              </button>
              <button
                className="w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                onClick={() => { exportPdf(report); setExportOpen(false); }}
              >
                PDF (.pdf)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
