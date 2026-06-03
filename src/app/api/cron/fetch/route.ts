import { NextResponse } from "next/server";
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { sha256 } from "js-sha256";
import { createClient } from "@supabase/supabase-js";
import { processArticleWithAI } from "@/lib/ai/processor";
import type { ModelConfig } from "@/components/settings/ai-settings";

const rssParser = new Parser();

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface RawArticle {
  title: string;
  url: string;
  content: string;
  author: string | null;
  publishedAt: string;
}

async function fetchRSS(url: string, config: any): Promise<RawArticle[]> {
  try {
    const feed = await rssParser.parseURL(url);
    const articles: RawArticle[] = [];
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const maxArticles = 200; // safety cap, time filter is the primary limiter

    for (const item of feed.items.slice(0, maxArticles)) {
      const title = item.title || "";
      const link = item.link || "";
      const content = item.contentSnippet || item.content || "";
      const pubDate = item.pubDate || item.isoDate;
      if (!title || !link) continue;

      // Only include articles published in the last 24 hours
      if (pubDate) {
        const pubTime = new Date(pubDate).getTime();
        if (pubTime < twentyFourHoursAgo.getTime()) continue;
      }
      // If no pubDate, include anyway (RSS feeds without dates are rare)

      articles.push({
        title,
        url: link,
        content,
        author: item.author || item.creator || feed.title || null,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      });
    }
    return articles;
  } catch (err) {
    console.error("RSS fetch error:", url, err);
    return [];
  }
}

async function fetchWeb(url: string, config: any): Promise<RawArticle[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)" },
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    const selectors = config?.selectors || {};
    const items: RawArticle[] = [];

    $(selectors.item || "article, .post, .news-item, .item").each((_, el) => {
      const title = $(el).find(selectors.title || "h2, h3, .title").first().text().trim();
      let link = $(el).find(selectors.link || "a").first().attr("href") || "";
      const content = $(el).find(selectors.content || "p, .summary, .desc").first().text().trim();
      if (!title) return;
      if (link && !link.startsWith("http")) {
        link = new URL(link, url).toString();
      }
      items.push({
        title,
        url: link || url,
        content,
        author: null,
        publishedAt: new Date().toISOString(),
      });
    });
    return items.slice(0, 10);
  } catch (err) {
    console.error("Web fetch error:", url, err);
    return [];
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminClient();
  const results: any[] = [];

  try {
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

    // Fallback to env vars if no DB config
    if (!aiCfg && process.env.AI_API_KEY) {
      // legacy fallback
    }

    // Get all active sources with their boards
    const { data: sources, error: sourcesError } = await supabase
      .from("sources")
      .select("*, boards(name, description, user_id, criteria, keywords, exclude_keywords, min_importance)")
      .order("created_at", { ascending: false });

    if (sourcesError || !sources || sources.length === 0) {
      return NextResponse.json({ message: "No sources to fetch", fetched: 0 });
    }

    for (const source of sources) {
      const board = source.boards;
      if (!board) continue;

      // xueqiu sources are handled by POST /api/cron/fetch-xueqiu (local Kimi WebBridge)
      // Detect by type OR by config.xueqiu_user_id (for backward compat before DB constraint update)
      if (source.type === "xueqiu" || source.config?.xueqiu_user_id) {
        results.push({
          source: source.name,
          board: board.name,
          fetched: 0,
          saved: 0,
          skipped: 0,
          note: "xueqiu 来源由本地 Kimi WebBridge 脚本处理",
        });
        continue;
      }

      let rawArticles: RawArticle[] = [];
      if (source.type === "rss") {
        rawArticles = await fetchRSS(source.url, source.config);
      } else if (source.type === "web" || source.type === "wechat" || source.type === "api") {
        rawArticles = await fetchWeb(source.url, source.config);
      }

      // Get existing articles for deduplication (last 500, covers 24h+)
      const { data: existing } = await supabase
        .from("articles")
        .select("hash, title, summary")
        .eq("board_id", source.board_id)
        .eq("user_id", board.user_id)
        .order("created_at", { ascending: false })
        .limit(500);

      const existingArticles = existing || [];
      let savedCount = 0;
      let skippedCount = 0;

      for (const raw of rawArticles) {
        const hash = sha256(raw.title + raw.url).slice(0, 16);

        const alreadyExists = existingArticles.some((e: any) => e.hash === hash);
        if (alreadyExists) {
          skippedCount++;
          continue;
        }

        // Board-level keyword filter
        const boardKeywords: string[] = board.keywords || [];
        const boardExcludes: string[] = board.exclude_keywords || [];
        const boardMinImportance: number = board.min_importance || 0;
        const text = (raw.title + " " + raw.content).toLowerCase();
        if (boardExcludes.length > 0 && boardExcludes.some((k: string) => text.includes(k.toLowerCase()))) {
          skippedCount++;
          continue;
        }
        if (boardKeywords.length > 0 && !boardKeywords.some((k: string) => text.includes(k.toLowerCase()))) {
          skippedCount++;
          continue;
        }

        // Skip AI if no config
        if (!aiCfg || !aiCfg.apiKey) {
          if (boardMinImportance > 50) {
            skippedCount++;
            continue;
          }
          await supabase.from("articles").insert({
            user_id: board.user_id,
            board_id: source.board_id,
            source_id: source.id,
            title: raw.title,
            summary: raw.content.slice(0, 200),
            content: raw.content.slice(0, 2000),
            url: raw.url,
            author: raw.author,
            published_at: raw.publishedAt,
            fetched_at: new Date().toISOString(),
            importance_score: 50,
            sentiment: "neutral",
            tags: [],
            is_read: false,
            is_favorite: false,
            hash,
          });
          savedCount++;
          continue;
        }

        const aiResult = await processArticleWithAI(
          {
            title: raw.title,
            content: raw.content,
            url: raw.url,
            boardName: board.name,
            boardDescription: board.description || board.name,
            existingArticles: existingArticles.map((e: any) => ({
              hash: e.hash,
              title: e.title,
              summary: e.summary || "",
            })),
            boardCriteria: board.criteria || undefined,
          },
          aiCfg
        );

        if (!aiResult.isRelevant) {
          skippedCount++;
          continue;
        }

        if (aiResult.isDuplicate && aiResult.duplicateOf) {
          skippedCount++;
          continue;
        }

        if (aiResult.importance < boardMinImportance) {
          skippedCount++;
          continue;
        }

        await supabase.from("articles").insert({
          user_id: board.user_id,
          board_id: source.board_id,
          source_id: source.id,
          title: raw.title,
          summary: aiResult.summary,
          content: raw.content.slice(0, 2000),
          url: raw.url,
          author: raw.author,
          published_at: raw.publishedAt,
          fetched_at: new Date().toISOString(),
          importance_score: aiResult.importance,
          sentiment: aiResult.sentiment,
          tags: aiResult.tags,
          is_read: false,
          is_favorite: false,
          hash,
        });

        savedCount++;
      }

      results.push({
        source: source.name,
        board: board.name,
        fetched: rawArticles.length,
        saved: savedCount,
        skipped: skippedCount,
      });
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (err: any) {
    console.error("Cron fetch error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
