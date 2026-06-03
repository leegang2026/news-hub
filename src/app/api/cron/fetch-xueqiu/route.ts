import { NextResponse } from "next/server";
import { sha256 } from "js-sha256";
import { createClient } from "@supabase/supabase-js";
import type { ModelConfig } from "@/components/settings/ai-settings";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface XueqiuPost {
  id: number;
  text: string;
  retweet_text: string;
  retweet_user: string;
  created_at: number; // Unix ms
  url: string;
  retweet_count: number;
  like_count: number;
  reply_count: number;
}

interface XueqiuFetchRequest {
  source_id: string;
  posts: XueqiuPost[];
}

const DIGEST_SYSTEM_PROMPT = `你是一位专业的投资研究分析师，擅长提炼投资大师的核心思想。

你的任务是将段永平（大道无形我有型）在雪球上的今日发言进行分类汇总，提炼核心观点，生成一篇可读性强的投资笔记。

## 输出格式

请输出一个 JSON 对象：
{
  "overallSummary": "今日概览，2-3句话概括今日发言的主题和倾向",
  "categories": [
    {
      "name": "类别名称（如：投资理念、公司分析、市场观点、人生智慧、问答互动）",
      "insights": [
        {
          "viewpoint": "核心观点（≤80字，保留段永平原汁原味的表达）",
          "quote": "引用原文关键句（≤120字）",
          "postId": "发言ID"
        }
      ]
    }
  ],
  "selectedQuotes": [
    {
      "text": "精选原文（最有价值的发言，≤200字）",
      "postId": "发言ID",
      "time": "发言时间"
    }
  ]
}

## 注意事项
- 每个类别最多 5 条观点
- 忽略纯寒暄、无实质内容的发言
- 如果转发内容比原创更有价值，优先提炼转发的观点
- 观点必须忠实于原文，不要过度演绎`;

/**
 * POST /api/cron/fetch-xueqiu
 *
 * 接收本地 Kimi WebBridge 抓取的雪球帖子，
 * AI 分类汇总 + 提炼核心观点 → 生成一篇整合文章入库。
 * 每天最多入库一篇。
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: XueqiuFetchRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { source_id, posts } = body;
  if (!source_id || !Array.isArray(posts) || posts.length === 0) {
    return NextResponse.json({ error: "Missing source_id or posts" }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Fetch source + board info
  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("*, boards(name, description, user_id)")
    .eq("id", source_id)
    .single();

  if (sourceError || !source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const board = source.boards;
  if (!board) {
    return NextResponse.json({ error: "Board not found for source" }, { status: 404 });
  }

  // Today's date for dedup
  const today = new Date().toISOString().split("T")[0];
  const digestUrl = `https://xueqiu.com/u/${source.url}`;

  // Check if already generated today
  const { data: existingToday } = await supabase
    .from("articles")
    .select("id, hash")
    .eq("board_id", source.board_id)
    .eq("source_id", source.id)
    .eq("user_id", board.user_id)
    .gte("created_at", `${today}T00:00:00`)
    .limit(1);

  if (existingToday && existingToday.length > 0) {
    return NextResponse.json({
      success: true,
      message: "今日摘要已存在",
      articleId: existingToday[0].id,
      posts: posts.length,
    });
  }

  // Get AI model config
  const { data: modelConfig } = await supabase
    .from("model_configs")
    .select("*")
    .eq("enabled", true)
    .eq("is_default", true)
    .single();

  if (!modelConfig || !modelConfig.api_key) {
    return NextResponse.json({ error: "No AI model configured" }, { status: 500 });
  }

  // Build posts context for AI
  const postsContext = posts.map((p) => {
    const t = new Date(p.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    let entry = `[ID:${p.id}] ${t}\n发言: ${p.text}`;
    if (p.retweet_text) {
      entry += `\n转发 @${p.retweet_user}: ${p.retweet_text}`;
    }
    return entry;
  }).join("\n\n---\n\n");

  const userPrompt = `以下是段永平（大道无形我有型）最近24小时在雪球上的全部发言，共 ${posts.length} 条：

${postsContext}

请对以上发言进行分类汇总，提炼核心观点，生成投资笔记。`;

  // Call AI
  let digestResult: any;
  try {
    const baseUrl = (modelConfig.base_url || "https://api.deepseek.com/v1").replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${modelConfig.api_key}`,
      },
      body: JSON.stringify({
        model: modelConfig.model,
        messages: [
          { role: "system", content: DIGEST_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: modelConfig.temperature ?? 0.3,
        // Digest needs more tokens than per-article processing
        max_tokens: Math.max(modelConfig.max_tokens ?? 2000, 4000),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AI API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    let rawContent = data.choices?.[0]?.message?.content || "{}";

    // Extract JSON from markdown code blocks if present
    const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      rawContent = codeBlockMatch[1].trim();
    }

    // Try parse, with progressive repair for truncated JSON
    try {
      digestResult = JSON.parse(rawContent);
    } catch (parseErr: any) {
      console.warn("Initial JSON parse failed, trying repair:", parseErr.message);
      // Attempt to repair truncated JSON by finding last complete structure
      let repaired = rawContent;
      // Find the position mentioned in error (e.g. "at position 1684")
      const posMatch = parseErr.message.match(/position (\d+)/);
      if (posMatch) {
        const errPos = parseInt(posMatch[1]);
        // Try truncating at the error position and closing the JSON
        repaired = rawContent.slice(0, errPos);
        // Close any unclosed strings/objects/arrays
        let depth = 0;
        let inString = false;
        for (let i = 0; i < repaired.length; i++) {
          if (repaired[i] === '"' && (i === 0 || repaired[i - 1] !== '\\')) {
            inString = !inString;
          } else if (!inString) {
            if (repaired[i] === '{' || repaired[i] === '[') depth++;
            else if (repaired[i] === '}' || repaired[i] === ']') depth--;
          }
        }
        // Close unclosed string
        if (inString) repaired += '"';
        // Close remaining structures
        // Check if we're inside an unclosed array/object by looking at trailing chars
        const lastBrace = Math.max(repaired.lastIndexOf('{'), repaired.lastIndexOf('['));
        const lastClose = Math.max(repaired.lastIndexOf('}'), repaired.lastIndexOf(']'));
        if (lastBrace > lastClose) {
          // We have unclosed structure, find what's needed
          const stack: string[] = [];
          for (let i = 0; i < repaired.length; i++) {
            const ch = repaired[i];
            if (ch === '"' && (i === 0 || repaired[i - 1] !== '\\')) {
              inString = !inString;
            } else if (!inString) {
              if (ch === '{') stack.push('}');
              else if (ch === '[') stack.push(']');
              else if (ch === '}' || ch === ']') stack.pop();
            }
          }
          repaired += stack.reverse().join('');
        }
        try {
          digestResult = JSON.parse(repaired);
          console.warn("JSON repaired successfully (truncation fix)");
        } catch (repairErr: any) {
          console.error("JSON repair also failed:", repairErr.message);
          throw new Error(`AI returned invalid JSON: ${parseErr.message}`);
        }
      } else {
        throw parseErr;
      }
    }
  } catch (err: any) {
    console.error("AI digest error:", err);
    return NextResponse.json({ error: `AI analysis failed: ${err.message}` }, { status: 500 });
  }

  // Format as Markdown article content
  const dateStr = new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
  const lines: string[] = [];

  lines.push(`## 今日概览`);
  lines.push("");
  lines.push(digestResult.overallSummary || `段永平今日在雪球发言 ${posts.length} 条。`);
  lines.push("");

  if (digestResult.categories && digestResult.categories.length > 0) {
    for (const cat of digestResult.categories) {
      lines.push(`### ${cat.name}`);
      lines.push("");
      for (const insight of cat.insights || []) {
        lines.push(`- **${insight.viewpoint}**`);
        if (insight.quote) {
          lines.push(`  > ${insight.quote}`);
        }
        if (insight.postId) {
          lines.push(`  [查看原文](https://xueqiu.com/${source.url}/${insight.postId})`);
        }
        lines.push("");
      }
    }
  }

  if (digestResult.selectedQuotes && digestResult.selectedQuotes.length > 0) {
    lines.push(`---`);
    lines.push("");
    lines.push(`### 原文精选`);
    lines.push("");
    for (const q of digestResult.selectedQuotes) {
      lines.push(`> ${q.text}`);
      if (q.time) lines.push(`> —— ${q.time}`);
      if (q.postId) lines.push(`> [查看原文](https://xueqiu.com/${source.url}/${q.postId})`);
      lines.push("");
    }
  }

  lines.push(`---`);
  lines.push("");
  lines.push(`*本文由 AI 自动生成，基于段永平（大道无形我有型）雪球发言整理。*`);

  const content = lines.join("\n");
  const summary = (digestResult.overallSummary || "").slice(0, 200);
  const title = `段永平今日发言精选 | ${dateStr}`;
  const hash = sha256(title + digestUrl).slice(0, 16);

  // Tags from category names
  const allTags = ["段永平", "雪球"];
  if (digestResult.categories) {
    for (const cat of digestResult.categories) {
      if (!allTags.includes(cat.name)) allTags.push(cat.name);
    }
  }

  // Insert ONE article
  const { data: inserted, error: insertError } = await supabase
    .from("articles")
    .insert({
      user_id: board.user_id,
      board_id: source.board_id,
      source_id: source.id,
      title,
      summary,
      content,
      url: digestUrl,
      author: "大道无形我有型",
      published_at: new Date().toISOString(),
      fetched_at: new Date().toISOString(),
      importance_score: 85,
      sentiment: "neutral",
      tags: allTags,
      is_read: false,
      is_favorite: false,
      hash,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("Insert error:", insertError);
    return NextResponse.json({ error: `Insert failed: ${insertError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    articleId: inserted.id,
    title,
    posts: posts.length,
    categories: digestResult.categories?.length || 0,
  });
}
