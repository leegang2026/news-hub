import type { DailyReport, DailyReportData, DailyReportBoardSection } from "@/types";

interface ExportReportInput {
  title: string;
  date: string;
  summary: string;
  articleCount: number;
  boardSections: DailyReportBoardSection[];
}

function getReportData(report: DailyReport): ExportReportInput {
  const topArticles = report.top_articles;
  let boardSections: DailyReportBoardSection[] = [];

  if (topArticles && typeof topArticles === "object" && "boardSections" in topArticles) {
    boardSections = (topArticles as DailyReportData).boardSections;
  }

  return {
    title: report.title,
    date: report.date,
    summary: report.summary,
    articleCount: report.article_count,
    boardSections,
  };
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob(["\uFEFF" + content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Markdown export ---
export function exportMarkdown(report: DailyReport) {
  const data = getReportData(report);
  const lines: string[] = [];

  lines.push(`# ${data.title}`);
  lines.push("");
  lines.push(`> ${data.date} | ${data.articleCount} 条资讯 | ${data.boardSections.length} 个板块`);
  lines.push("");
  lines.push(data.summary);
  lines.push("");

  for (const section of data.boardSections) {
    lines.push(`## ${section.boardIcon} ${section.boardName}`);
    lines.push("");
    if (section.summary) {
      lines.push(section.summary);
      lines.push("");
    }

    for (const article of section.articles) {
      lines.push(`### [${article.title}](${article.url})`);
      lines.push("");
      lines.push(`- **来源**: ${article.sourceName}`);
      if (article.publishedAt) {
        lines.push(`- **日期**: ${article.publishedAt}`);
      }
      lines.push(`- **重要度**: ${article.importanceScore}`);
      lines.push(`- **情感**: ${article.sentiment === "positive" ? "正面" : article.sentiment === "negative" ? "负面" : "中性"}`);
      if (article.tags.length > 0) {
        lines.push(`- **标签**: ${article.tags.join(", ")}`);
      }
      lines.push("");
      lines.push(article.summary || "暂无摘要");
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  downloadBlob(lines.join("\n"), `${data.date}-日报.md`, "text/markdown");
}

// --- Word export ---
export function exportWord(report: DailyReport) {
  const data = getReportData(report);
  const sentimentLabel = (s: string) => s === "positive" ? "正面" : s === "negative" ? "负面" : "中性";
  const sentimentColor = (s: string) => s === "positive" ? "#16a34a" : s === "negative" ? "#dc2626" : "#737373";

  const boardHtml = data.boardSections.map((section) => {
    const articlesHtml = section.articles.map((a) => `
      <div style="border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin-bottom:12px;">
        <h3 style="margin:0 0 8px 0;"><a href="${a.url}" style="color:#171717;">${a.title}</a></h3>
        <p style="margin:4px 0;color:#737373;font-size:13px;">
          ${a.sourceName} &middot; ${a.publishedAt ? new Date(a.publishedAt).toLocaleDateString("zh-CN") : ""}
          &middot; 重要度 ${a.importanceScore}
          &middot; <span style="color:${sentimentColor(a.sentiment)}">${sentimentLabel(a.sentiment)}</span>
        </p>
        <p style="margin:8px 0;color:#525252;">${a.summary || "暂无摘要"}</p>
        ${a.tags.length > 0 ? `<p style="margin:4px 0;font-size:12px;color:#a3a3a3;">${a.tags.map((t) => `#${t}`).join(" ")}</p>` : ""}
        <p style="margin:4px 0;font-size:12px;"><a href="${a.url}">阅读原文 →</a></p>
      </div>
    `).join("");

    return `
      <div style="margin-bottom:24px;">
        <h2 style="border-bottom:1px solid #e5e5e5;padding-bottom:8px;">${section.boardIcon} ${section.boardName} <span style="font-size:14px;color:#a3a3a3;">${section.articleCount} 条</span></h2>
        ${section.summary ? `<p style="color:#737373;">${section.summary}</p>` : ""}
        ${articlesHtml}
      </div>
    `;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${data.title}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#171717;">
<h1>${data.title}</h1>
<p style="color:#737373;">${data.date} | ${data.articleCount} 条资讯 | ${data.boardSections.length} 个板块</p>
<div style="background:#f5f5f5;border-radius:8px;padding:16px;margin-bottom:24px;">
  <p style="margin:0;color:#525252;">${data.summary}</p>
</div>
${boardHtml}
</body>
</html>`;

  downloadBlob(html, `${data.date}-日报.doc`, "application/msword");
}

// --- PDF export (via browser print) ---
export function exportPdf(report: DailyReport) {
  const data = getReportData(report);
  const sentimentLabel = (s: string) => s === "positive" ? "正面" : s === "negative" ? "负面" : "中性";

  const boardHtml = data.boardSections.map((section) => {
    const articlesHtml = section.articles.map((a) => `
      <div class="article-card">
        <h3><a href="${a.url}">${a.title}</a></h3>
        <p class="meta">${a.sourceName} &middot; ${a.publishedAt ? new Date(a.publishedAt).toLocaleDateString("zh-CN") : ""} &middot; 重要度 ${a.importanceScore} &middot; ${sentimentLabel(a.sentiment)}</p>
        <p class="article-summary">${a.summary || "暂无摘要"}</p>
        ${a.tags.length > 0 ? `<p class="tags">${a.tags.map((t) => `#${t}`).join(" ")}</p>` : ""}
      </div>
    `).join("");

    return `
      <div class="board-section">
        <h2>${section.boardIcon} ${section.boardName} <span class="count">${section.articleCount} 条</span></h2>
        ${section.summary ? `<p class="board-summary">${section.summary}</p>` : ""}
        ${articlesHtml}
      </div>
    `;
  }).join("");

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${data.title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #171717; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  .date-line { color: #737373; margin-bottom: 16px; }
  .overview { background: #f5f5f5; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
  .overview p { margin: 0; color: #525252; line-height: 1.6; }
  .board-section { margin-bottom: 24px; page-break-inside: avoid; }
  .board-section h2 { border-bottom: 1px solid #e5e5e5; padding-bottom: 8px; margin-bottom: 8px; }
  .count { font-size: 14px; color: #a3a3a3; font-weight: normal; }
  .board-summary { color: #737373; margin-bottom: 12px; }
  .article-card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin-bottom: 12px; page-break-inside: avoid; }
  .article-card h3 { margin: 0 0 4px 0; font-size: 16px; }
  .article-card h3 a { color: #171717; text-decoration: none; }
  .meta { color: #737373; font-size: 13px; margin: 4px 0; }
  .article-summary { color: #525252; margin: 8px 0; line-height: 1.5; }
  .tags { color: #a3a3a3; font-size: 12px; margin: 4px 0; }
  @media print {
    body { margin: 0; padding: 20px; }
    .article-card { break-inside: avoid; }
  }
</style></head>
<body>
<h1>${data.title}</h1>
<p class="date-line">${data.date} | ${data.articleCount} 条资讯 | ${data.boardSections.length} 个板块</p>
<div class="overview"><p>${data.summary}</p></div>
${boardHtml}
</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 500);
}
