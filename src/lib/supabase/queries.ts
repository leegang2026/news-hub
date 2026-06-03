import { createClient } from "./server";
import { mockBoards, mockArticles, mockDailyReport } from "@/lib/demo-data";

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

export async function getBoards() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return mockBoards;
  }

  const userId = await getUserId();
  if (!userId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("boards")
    .select("*, sources(count), articles(count)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return data || [];
}

export async function getBoardById(id: string) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return mockBoards.find((b) => b.id === id) || null;
  }

  const userId = await getUserId();
  if (!userId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("boards")
    .select("*, sources(*)")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  return data;
}

export async function getArticles(
  boardId?: string,
  query?: string,
  limit = 50,
  options?: { date?: string; sourceId?: string }
) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    let articles = [...mockArticles];
    if (boardId) {
      articles = articles.filter((a) => a.board_id === boardId);
    }
    if (query) {
      const q = query.toLowerCase();
      articles = articles.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.summary && a.summary.toLowerCase().includes(q))
      );
    }
    if (options?.date) {
      articles = articles.filter((a) => a.published_at.startsWith(options.date!));
    }
    if (options?.sourceId) {
      articles = articles.filter((a) => a.source_id === options.sourceId);
    }
    return articles.slice(0, limit);
  }

  const userId = await getUserId();
  if (!userId) return [];

  const supabase = await createClient();
  let dbQuery = supabase
    .from("articles")
    .select("*")
    .eq("user_id", userId)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (boardId) {
    dbQuery = dbQuery.eq("board_id", boardId);
  }

  if (query) {
    dbQuery = dbQuery.or(`title.ilike.%${query}%,summary.ilike.%${query}%`);
  }

  if (options?.date) {
    const startOfDay = `${options.date}T00:00:00+08:00`;
    const endOfDay = `${options.date}T23:59:59+08:00`;
    dbQuery = dbQuery.gte("published_at", startOfDay).lte("published_at", endOfDay);
  }

  if (options?.sourceId) {
    dbQuery = dbQuery.eq("source_id", options.sourceId);
  }

  const { data } = await dbQuery;
  return data || [];
}

export async function getDailyReport(date?: string) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return mockDailyReport;
  }

  const userId = await getUserId();
  if (!userId) return null;

  const supabase = await createClient();
  const targetDate = date || new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("user_id", userId)
    .eq("date", targetDate)
    .single();

  return data;
}
