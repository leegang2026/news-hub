import type { JudgmentCriteria } from "@/lib/ai/criteria-defaults";

export interface Board {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  criteria?: JudgmentCriteria;
  keywords?: string[];
  exclude_keywords?: string[];
  min_importance?: number;
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  board_id: string;
  user_id: string;
  name: string;
  type: "rss" | "wechat" | "api" | "web";
  url: string;
  config: SourceConfig;
  created_at: string;
  updated_at: string;
}

export interface SourceConfig {
  fetchInterval?: number;
  selectors?: Record<string, string>;
}

export interface Article {
  id: string;
  user_id: string;
  board_id: string;
  source_id: string;
  title: string;
  summary: string | null;
  content: string | null;
  url: string;
  image_url: string | null;
  author: string | null;
  published_at: string;
  fetched_at: string;
  importance_score: number;
  sentiment: "positive" | "neutral" | "negative";
  tags: string[];
  is_read: boolean;
  is_favorite: boolean;
  hash: string;
  created_at: string;
}

export interface DailyReportBoardArticle {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  sourceName: string;
  publishedAt: string;
  importanceScore: number;
  sentiment: string;
  tags: string[];
}

export interface DailyReportBoardSection {
  boardId: string;
  boardName: string;
  boardIcon: string;
  summary: string;
  articleCount: number;
  articles: DailyReportBoardArticle[];
}

export interface DailyReportData {
  overallTitle: string;
  overallSummary: string;
  boardSections: DailyReportBoardSection[];
}

export interface DailyReport {
  id: string;
  user_id: string;
  date: string;
  title: string;
  summary: string;
  article_count: number;
  top_articles: DailyReportData | Article[];
  is_sent: boolean;
  sent_at: string | null;
  created_at: string;
}
