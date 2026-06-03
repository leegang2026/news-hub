import type { ModelConfig } from "@/components/settings/ai-settings";
import { DEFAULT_CRITERIA, buildFullSystemPrompt, type JudgmentCriteria } from "./criteria-defaults";

export interface AIProcessResult {
  isRelevant: boolean;
  relevanceReason: string;
  isDuplicate: boolean;
  duplicateOf: string | null;
  importance: number;
  summary: string;
  tags: string[];
  sentiment: "positive" | "neutral" | "negative";
}

interface ProcessArticleInput {
  title: string;
  content: string;
  url: string;
  boardName: string;
  boardDescription: string;
  existingArticles: { hash: string; title: string; summary: string }[];
  boardCriteria?: JudgmentCriteria;
}

function resolveSystemPrompt(boardCriteria?: JudgmentCriteria): string {
  if (boardCriteria) {
    return buildFullSystemPrompt({ ...DEFAULT_CRITERIA, ...boardCriteria });
  }
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("judgment_criteria");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as JudgmentCriteria;
        if (parsed.full_system_prompt) {
          return parsed.full_system_prompt;
        }
        return buildFullSystemPrompt({ ...DEFAULT_CRITERIA, ...parsed });
      } catch {
        // fall through
      }
    }
  }
  return buildFullSystemPrompt(DEFAULT_CRITERIA);
}

export async function processArticleWithAI(
  input: ProcessArticleInput,
  cfg: ModelConfig
): Promise<AIProcessResult> {
  const existingContext =
    input.existingArticles.length > 0
      ? `\n已有文章列表（用于去重判断）：\n${input.existingArticles
          .map(
            (a) =>
              `- hash:${a.hash} 标题:"${a.title}" 摘要:"${a.summary.slice(0, 80)}"`
          )
          .join("\n")}`
      : "";

  const userPrompt = `板块名称：${input.boardName}
板块描述：${input.boardDescription}

待处理文章：
标题：${input.title}
URL：${input.url}
内容：${input.content.slice(0, 4000)}
${existingContext}

请分析这篇文章。`;

  const systemPrompt = resolveSystemPrompt(input.boardCriteria);

  try {
    let content: string;

    if (cfg.provider === "gemini") {
      content = await callGemini(cfg, userPrompt, systemPrompt);
    } else {
      content = await callOpenAICompatible(cfg, userPrompt, systemPrompt);
    }

    const parsed = JSON.parse(content);

    return {
      isRelevant: !!parsed.isRelevant,
      relevanceReason: String(parsed.relevanceReason || "").slice(0, 50),
      isDuplicate: !!parsed.isDuplicate,
      duplicateOf: parsed.duplicateOf || null,
      importance: Math.max(0, Math.min(100, Math.round(Number(parsed.importance) || 50))),
      summary: String(parsed.summary || "").slice(0, 200),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.slice(0, 5).map((t: string) => String(t).slice(0, 10))
        : [],
      sentiment: ["positive", "neutral", "negative"].includes(parsed.sentiment)
        ? parsed.sentiment
        : "neutral",
    };
  } catch (err) {
    console.error("AI processing error:", err);
    return {
      isRelevant: true,
      relevanceReason: "处理失败，默认保留",
      isDuplicate: false,
      duplicateOf: null,
      importance: 50,
      summary: input.content.slice(0, 150),
      tags: [],
      sentiment: "neutral",
    };
  }
}

async function callOpenAICompatible(cfg: ModelConfig, userPrompt: string, systemPrompt?: string): Promise<string> {
  const resolvedSystem = systemPrompt || resolveSystemPrompt();
  const baseUrl = cfg.baseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: cfg.systemPrompt || resolvedSystem },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "{}";
}

async function callGemini(cfg: ModelConfig, userPrompt: string, systemPrompt?: string): Promise<string> {
  const resolvedSystem = systemPrompt || resolveSystemPrompt();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: (cfg.systemPrompt || resolvedSystem) + "\n\n" + userPrompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: cfg.temperature,
        maxOutputTokens: cfg.maxTokens,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
}

// Daily report generation
export async function generateDailyReport(
  articles: { title: string; summary: string; tags: string[]; importance: number }[],
  cfg: ModelConfig
): Promise<{ title: string; summary: string; topArticles: typeof articles }> {
  if (articles.length === 0) {
    return {
      title: "每日日报",
      summary: "今日暂无新资讯。",
      topArticles: [],
    };
  }

  const articlesText = articles
    .filter((a) => a.importance >= 70)
    .map((a, i) => `${i + 1}. [重要度${a.importance}] ${a.title} (${a.tags.join(", ")})`)
    .join("\n");

  const todayStr = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
  const prompt = `请根据以下精选文章，生成一份中文日报摘要（200字以内）。今天日期为 ${todayStr}，共收录 ${articles.length} 条资讯。

文章列表：
${articlesText}

返回 JSON：
{
  "title": "日报标题（必须在标题中使用日期 ${todayStr}，不要使用文章中的日期）",
  "summary": "摘要内容，突出最重要的事件和趋势"
}`;

  try {
    let content: string;
    if (cfg.provider === "gemini") {
      content = await callGemini(cfg, prompt);
    } else {
      content = await callOpenAICompatible(cfg, prompt);
    }
    const parsed = JSON.parse(content);
    return {
      title: parsed.title || "每日日报",
      summary: parsed.summary || `今日共收录 ${articles.length} 条资讯。`,
      topArticles: articles.slice(0, 5),
    };
  } catch (err) {
    console.error("Daily report generation error:", err);
    return {
      title: "每日日报",
      summary: `今日共收录 ${articles.length} 条资讯。`,
      topArticles: articles.slice(0, 5),
    };
  }
}

// Generate per-board summary (≤100 chars)
export async function generateBoardSummary(
  boardName: string,
  articles: { title: string; summary: string; importance: number }[],
  cfg: ModelConfig
): Promise<string> {
  if (articles.length === 0) return `${boardName} 板块暂无资讯。`;

  const articlesText = articles
    .map((a, i) => `${i + 1}. [重要度${a.importance}] ${a.title}`)
    .join("\n");

  const prompt = `以下是"${boardName}"板块今日的精选文章，请生成一段简洁的中文摘要（100字以内），概括该板块今日的主要动态。

文章列表：
${articlesText}

返回 JSON：
{
  "summary": "摘要内容"
}`;

  try {
    let content: string;
    if (cfg.provider === "gemini") {
      content = await callGemini(cfg, prompt);
    } else {
      content = await callOpenAICompatible(cfg, prompt);
    }
    const parsed = JSON.parse(content);
    return parsed.summary || `${boardName} 板块共收录 ${articles.length} 条资讯。`;
  } catch (err) {
    console.error("Board summary generation error:", err);
    return `${boardName} 板块共收录 ${articles.length} 条资讯。`;
  }
}

// Generate overall report from board summaries
export async function generateOverallReport(
  boardSummaries: { boardName: string; summary: string; articleCount: number }[],
  totalArticles: number,
  cfg: ModelConfig
): Promise<{ title: string; summary: string }> {
  if (boardSummaries.length === 0) {
    return { title: "每日日报", summary: "今日暂无新资讯。" };
  }

  const todayStr = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
  const boardsText = boardSummaries
    .map((b) => `- ${b.boardName}（${b.articleCount}条）：${b.summary}`)
    .join("\n");

  const prompt = `请根据以下各板块的今日摘要，生成一份总体的中文日报摘要（200字以内）。今天日期为 ${todayStr}，共收录 ${totalArticles} 条资讯，涵盖 ${boardSummaries.length} 个板块。

各板块摘要：
${boardsText}

返回 JSON：
{
  "title": "日报标题（必须在标题中使用日期 ${todayStr}）",
  "summary": "整体摘要内容，突出今日最重要的趋势和事件"
}`;

  try {
    let content: string;
    if (cfg.provider === "gemini") {
      content = await callGemini(cfg, prompt);
    } else {
      content = await callOpenAICompatible(cfg, prompt);
    }
    const parsed = JSON.parse(content);
    return {
      title: parsed.title || "每日日报",
      summary: parsed.summary || `今日共收录 ${totalArticles} 条资讯。`,
    };
  } catch (err) {
    console.error("Overall report generation error:", err);
    return {
      title: "每日日报",
      summary: `今日共收录 ${totalArticles} 条资讯，涵盖 ${boardSummaries.length} 个板块。`,
    };
  }
}
