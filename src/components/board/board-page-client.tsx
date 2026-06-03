"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ArticleList } from "@/components/board/article-list";
import { BoardHeader } from "@/components/board/board-header";
import { ArticleFilterBar } from "@/components/board/article-filter-bar";
import { SourceManager } from "@/components/board/source-manager";

interface BoardPageClientProps {
  board: any;
  articles: any[];
  sources: { id: string; name: string }[];
  currentDate: string;
  currentSource: string;
}

export function BoardPageClient({
  board,
  articles,
  sources,
}: BoardPageClientProps) {
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false);
  const router = useRouter();

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-6 py-8 md:px-12">
        <BoardHeader
          name={board.name}
          icon={board.icon || "📁"}
          description={board.description || ""}
          count={articles.length}
          onRefreshClick={() => router.refresh()}
          onSettingsClick={() => setSourceManagerOpen(true)}
        />
        {/* Filter bar */}
        <div className="mt-3">
          <ArticleFilterBar sources={sources} />
        </div>
        <div className="mt-6">
          <ArticleList articles={articles} />
        </div>
      </div>
      <SourceManager
        boardId={board.id}
        boardName={board.name}
        open={sourceManagerOpen}
        onOpenChange={setSourceManagerOpen}
        onSaved={() => router.refresh()}
      />
    </AppShell>
  );
}
