"use client";

import { useEffect, useState } from "react";
import { Calendar, Clock, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DailyReportBoardSection } from "@/components/daily/daily-report-board-section";
import { DailyReportFilters } from "@/components/daily/daily-report-filters";
import { createClient } from "@/lib/supabase/client";
import type { DailyReport, DailyReportBoardSection as BoardSection } from "@/types";

export function DailyReportView({ report: _initialReport }: { report: DailyReport | null }) {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedBoard, setSelectedBoard] = useState("");

  useEffect(() => {
    async function fetchReport() {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user?.id) {
          setLoading(false);
          return;
        }
        const { data } = await supabase
          .from("daily_reports")
          .select("*")
          .eq("user_id", userData.user.id)
          .eq("date", selectedDate)
          .single();
        setReport(data);
      } catch {
        setReport(null);
      }
      setLoading(false);
    }
    fetchReport();
  }, [selectedDate]);

  function changeDate(days: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split("T")[0]);
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const maxDate = new Date().toISOString().split("T")[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  // Empty state
  if (!report) {
    const isToday = selectedDate === new Date().toISOString().split("T")[0];
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
              每日日报
            </h1>
            <div className="mt-1 flex items-center gap-3 text-sm text-neutral-500">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(selectedDate).toLocaleDateString("zh-CN")}
              </span>
            </div>
          </div>
          {/* Date navigation */}
          <div className="flex items-center gap-1">
            <button
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100"
              onClick={() => changeDate(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-30"
              onClick={() => changeDate(1)}
              disabled={selectedDate >= maxDate}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
          <p className="text-neutral-500 text-sm">
            {isToday ? "今日日报尚未生成，每天早上 8:00 自动推送" : `${new Date(selectedDate).toLocaleDateString("zh-CN")} 暂无日报`}
          </p>
          {isToday && (
            <p className="text-neutral-400 text-xs mt-1">
              请确认已配置新闻源并运行抓取任务
            </p>
          )}
        </div>
      </div>
    );
  }

  const dateStr = new Date(report.date).toLocaleDateString("zh-CN");
  const timeStr = report.created_at
    ? new Date(report.created_at).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // Parse board sections
  const topArticles = report.top_articles;
  let allSections: BoardSection[];

  if (Array.isArray(topArticles)) {
    allSections = [
      {
        boardId: "legacy",
        boardName: "精选内容",
        boardIcon: "📰",
        summary: "",
        articleCount: report.article_count,
        articles: (topArticles as any[]).map((a: any, i: number) => ({
          id: a.id || `legacy-${i}`,
          title: a.title || "",
          url: a.url || "#",
          summary: a.summary || "",
          sourceName: a.author || a.sourceName || "未知来源",
          publishedAt: a.published_at || a.publishedAt || report.date,
          importanceScore: a.importance_score ?? a.importance ?? a.importanceScore ?? 50,
          sentiment: a.sentiment || "neutral",
          tags: a.tags || [],
        })),
      },
    ];
  } else if (topArticles && typeof topArticles === "object" && "boardSections" in topArticles) {
    allSections = (topArticles as any).boardSections;
  } else {
    allSections = [];
  }

  // Board filter
  const filteredSections = selectedBoard
    ? allSections.filter((s) => s.boardId === selectedBoard)
    : allSections;

  // Board names for filter dropdown
  const boardNames = allSections.map((s) => ({ id: s.boardId, name: s.boardName }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            每日日报
          </h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-neutral-500">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {dateStr}
            </span>
            {timeStr && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {timeStr} 生成
              </span>
            )}
          </div>
        </div>
        {/* Date navigation */}
        <div className="flex items-center gap-1">
          <button
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100"
            onClick={() => changeDate(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-30"
            onClick={() => changeDate(1)}
            disabled={selectedDate >= maxDate}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filters + Export */}
      <div className="mb-4">
        <DailyReportFilters
          report={report}
          boardNames={boardNames}
          selectedDate={selectedDate}
          selectedBoard={selectedBoard}
          onDateChange={setSelectedDate}
          onBoardChange={setSelectedBoard}
        />
      </div>

      {/* Overall summary */}
      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-2">今日概览</h2>
        <p className="text-sm text-neutral-600 leading-relaxed">
          {report.summary}
        </p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs">
            {report.article_count} 条资讯
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {allSections.length} 个板块
          </Badge>
        </div>
      </div>

      {/* Board sections */}
      {filteredSections.map((section) => (
        <DailyReportBoardSection key={section.boardId} section={section} />
      ))}

      {filteredSections.length === 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
          <p className="text-neutral-500 text-sm">该板块暂无内容</p>
        </div>
      )}
    </div>
  );
}
