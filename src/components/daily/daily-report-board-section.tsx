"use client";

import { Badge } from "@/components/ui/badge";
import type { DailyReportBoardSection } from "@/types";

interface Props {
  section: DailyReportBoardSection;
}

export function DailyReportBoardSection({ section }: Props) {
  if (!section.articles || section.articles.length === 0) return null;

  return (
    <div className="mb-8">
      {/* Board header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{section.boardIcon}</span>
        <h2 className="text-base font-semibold text-neutral-900">
          {section.boardName}
        </h2>
        <Badge variant="secondary" className="text-xs">
          {section.articleCount} 条
        </Badge>
      </div>

      {/* Board summary */}
      {section.summary && (
        <p className="text-sm text-neutral-600 mb-4">{section.summary}</p>
      )}

      {/* Article list */}
      <div className="space-y-2">
        {section.articles.map((article) => (
          <div
            key={article.id}
            className="rounded-lg border border-neutral-200 bg-white p-4 transition-all hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* Title as hyperlink */}
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-neutral-900 hover:underline line-clamp-1"
                >
                  {article.title}
                </a>

                {/* Metadata: source + date */}
                <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
                  <span>{article.sourceName}</span>
                  {article.publishedAt && (
                    <>
                      <span>·</span>
                      <span>
                        {new Date(article.publishedAt).toLocaleDateString("zh-CN")}
                      </span>
                    </>
                  )}
                </div>

                {/* Summary */}
                <p className="mt-2 text-sm text-neutral-600 line-clamp-2">
                  {article.summary || "暂无摘要"}
                </p>

                {/* Tags + sentiment + importance */}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {(article.tags || []).map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {tag}
                    </Badge>
                  ))}
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0 rounded ${
                      article.sentiment === "positive"
                        ? "text-green-600 bg-green-50"
                        : article.sentiment === "negative"
                        ? "text-red-600 bg-red-50"
                        : "text-neutral-500 bg-neutral-100"
                    }`}
                  >
                    {article.sentiment === "positive"
                      ? "正面"
                      : article.sentiment === "negative"
                      ? "负面"
                      : "中性"}
                  </span>
                </div>
              </div>

              {/* Importance score */}
              <div className="shrink-0 text-xs font-medium text-neutral-500 tabular-nums">
                重要度 {article.importanceScore}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
