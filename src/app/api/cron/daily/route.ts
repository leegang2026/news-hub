import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateBoardSummary, generateOverallReport } from "@/lib/ai/processor";
import type { ModelConfig } from "@/components/settings/ai-settings";
import type { DailyReportBoardArticle, DailyReportBoardSection } from "@/types";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminClient();

  try {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: boardsData } = await supabase
      .from("boards")
      .select("user_id");

    if (!boardsData || boardsData.length === 0) {
      return NextResponse.json({ message: "No users found" });
    }

    // Get default AI model config
    const { data: modelConfigs } = await supabase
      .from("model_configs")
      .select("*")
      .eq("enabled", true)
      .eq("is_default", true)
      .single();

    const aiCfg: ModelConfig | null = modelConfigs
      ? {
          id: modelConfigs.id,
          alias: modelConfigs.alias,
          provider: modelConfigs.provider,
          apiKey: modelConfigs.api_key,
          baseUrl: modelConfigs.base_url || "",
          model: modelConfigs.model,
          temperature: modelConfigs.temperature ?? 0.3,
          maxTokens: modelConfigs.max_tokens ?? 800,
          systemPrompt: modelConfigs.system_prompt || "",
          enabled: modelConfigs.enabled,
          isDefault: modelConfigs.is_default,
        }
      : null;

    const userIds = [...new Set(boardsData.map((b: any) => b.user_id))].map((id) => ({ user_id: id }));
    const reports: any[] = [];

    for (const { user_id } of userIds) {
      // Fetch articles with board/source info
      const { data: articles } = await supabase
        .from("articles")
        .select("id, title, summary, tags, importance_score, sentiment, board_id, source_id, url, published_at")
        .eq("user_id", user_id)
        .gte("created_at", yesterday)
        .gte("importance_score", 80)
        .order("importance_score", { ascending: false });

      if (!articles || articles.length === 0) continue;

      // Fetch sources for name resolution
      const { data: sources } = await supabase
        .from("sources")
        .select("id, name")
        .eq("user_id", user_id);
      const sourceMap = new Map<string, string>(
        (sources || []).map((s: any) => [s.id, s.name])
      );

      // Fetch boards for name/icon resolution
      const { data: userBoards } = await supabase
        .from("boards")
        .select("id, name, icon")
        .eq("user_id", user_id);
      const boardMap = new Map<string, { name: string; icon: string }>(
        (userBoards || []).map((b: any) => [b.id, { name: b.name, icon: b.icon || "📁" }])
      );

      // Group articles by board_id
      const grouped = new Map<string, typeof articles>();
      for (const article of articles) {
        const key = article.board_id || "__unclassified__";
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(article);
      }

      // Process each board section
      const boardSections: DailyReportBoardSection[] = [];

      for (const [boardId, groupArticles] of grouped) {
        const top10 = groupArticles.slice(0, 10);

        const boardInfo = boardId === "__unclassified__"
          ? { name: "未分类", icon: "📋" }
          : boardMap.get(boardId) || { name: "未知板块", icon: "📋" };

        // Map articles with source names
        const mappedArticles: DailyReportBoardArticle[] = top10.map((a: any) => ({
          id: a.id,
          title: a.title,
          url: a.url,
          summary: a.summary,
          sourceName: sourceMap.get(a.source_id) || "未知来源",
          publishedAt: a.published_at,
          importanceScore: a.importance_score,
          sentiment: a.sentiment || "neutral",
          tags: a.tags || [],
        }));

        // Generate board summary
        let boardSummary: string;
        if (aiCfg && aiCfg.apiKey) {
          boardSummary = await generateBoardSummary(
            boardInfo.name,
            top10.map((a: any) => ({
              title: a.title,
              summary: a.summary || "",
              importance: a.importance_score,
            })),
            aiCfg
          );
        } else {
          const pos = top10.filter((a: any) => a.sentiment === "positive").length;
          const neg = top10.filter((a: any) => a.sentiment === "negative").length;
          boardSummary = `${boardInfo.name} 板块共收录 ${groupArticles.length} 条资讯。正面 ${pos} 条，负面 ${neg} 条。`;
        }

        boardSections.push({
          boardId,
          boardName: boardInfo.name,
          boardIcon: boardInfo.icon,
          summary: boardSummary,
          articleCount: groupArticles.length,
          articles: mappedArticles,
        });
      }

      // Generate overall report
      const totalArticles = articles.length;
      let overallTitle: string;
      let overallSummary: string;

      if (aiCfg && aiCfg.apiKey) {
        const overall = await generateOverallReport(
          boardSections.map((b) => ({
            boardName: b.boardName,
            summary: b.summary,
            articleCount: b.articleCount,
          })),
          totalArticles,
          aiCfg
        );
        overallTitle = overall.title;
        overallSummary = overall.summary;
      } else {
        const posCount = articles.filter((a: any) => a.sentiment === "positive").length;
        const negCount = articles.filter((a: any) => a.sentiment === "negative").length;
        overallTitle = `${today} 日报`;
        overallSummary = `今日共收录 ${totalArticles} 条资讯，涵盖 ${boardSections.length} 个板块。正面 ${posCount} 条，负面 ${negCount} 条，中性 ${totalArticles - posCount - negCount} 条。`;
      }

      // Upsert report
      const reportPayload = {
        user_id,
        date: today,
        title: overallTitle,
        summary: overallSummary,
        article_count: totalArticles,
        top_articles: {
          overallTitle,
          overallSummary,
          boardSections,
        },
        is_sent: false,
      };

      const { data: savedReport } = await supabase
        .from("daily_reports")
        .upsert(reportPayload, { onConflict: "user_id, date" })
        .select()
        .single();

      // WeCom push
      const wecomKey = process.env.WECOM_WEBHOOK_KEY;
      if (wecomKey && savedReport) {
        await sendWeComMessage(wecomKey, savedReport);
        await supabase
          .from("daily_reports")
          .update({ is_sent: true, sent_at: new Date().toISOString() })
          .eq("id", savedReport.id);
      }

      reports.push({ user_id, title: overallTitle, articles: totalArticles, boards: boardSections.length });
    }

    return NextResponse.json({ success: true, reports });
  } catch (err: any) {
    console.error("Daily cron error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function sendWeComMessage(key: string, report: any) {
  const url = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${key}`;
  const content = `${report.title}\n\n${report.summary}\n\n共 ${report.article_count} 条资讯，点击查看详情 →`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msgtype: "text",
      text: { content },
    }),
  });
}
