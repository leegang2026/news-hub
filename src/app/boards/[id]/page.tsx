import { BoardPageClient } from "@/components/board/board-page-client";
import { getBoardById, getArticles } from "@/lib/supabase/queries";

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; source?: string }>;
}) {
  const { id } = await params;
  const { date, source } = await searchParams;
  const board = await getBoardById(id);
  const articles = await getArticles(id, undefined, 50, { date, sourceId: source });

  if (!board) {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-500">
        板块不存在或无权访问
      </div>
    );
  }

  const sources = (board.sources || []).map((s: any) => ({ id: s.id, name: s.name }));

  return (
    <BoardPageClient
      board={board}
      articles={articles}
      sources={sources}
      currentDate={date || ""}
      currentSource={source || ""}
    />
  );
}
