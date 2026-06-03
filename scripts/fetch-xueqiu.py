#!/usr/bin/env python
"""
段永平雪球发言抓取 + 推送脚本
通过 Kimi WebBridge 抓取，POST 到 News Hub 服务器进行 AI 处理入库

用法:
  python scripts/fetch-xueqiu.py                          # 抓取并推送到服务器
  python scripts/fetch-xueqiu.py --dry-run                # 抓取并在本地做 AI 分析
  python scripts/fetch-xueqiu.py --source-id <uuid>        # 指定 source_id
"""

import json
import subprocess
import time
import sys
import re
import urllib.request
import argparse
from datetime import datetime, timezone, timedelta

# --- 配置 ---
KW_URL = "http://127.0.0.1:10086/command"
XUEQIU_USER_ID = "1247347556"
XUEQIU_USER_NAME = "大道无形我有型"
XUEQIU_PROFILE_URL = f"https://xueqiu.com/u/{XUEQIU_USER_ID}"
SESSION = "xueqiu-dump"

# 服务器配置
SERVER_URL = "http://47.107.145.156:3000"
CRON_SECRET = "pkhub2026cron_secret_x9"
SOURCE_ID = "29c99613-d524-40cc-8804-4c28194b58c5"  # 段永平雪球来源 UUID

# AI 配置（仅 dry-run 模式使用）
AI_CONFIG = {
    "model": "deepseek-v4-flash",
    "base_url": "https://api.deepseek.com/v1",
    "api_key": "sk-9515af53d13b40e38aa3b6a9ba66af88",
    "temperature": 0.3,
    "max_tokens": 4000,
}

TZ_CN = timezone(timedelta(hours=8))


def strip_html(text):
    """移除 HTML 标签，转换 <br/> 为换行"""
    if not text:
        return ""
    text = re.sub(r'<br\s*/?\s*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = text.strip()
    return text


def kw_call(action, args=None, session=SESSION, timeout=30):
    """调用 Kimi WebBridge API"""
    payload = {"action": action, "session": session}
    if args:
        payload["args"] = args
    result = subprocess.run(
        ["curl", "-s", "-X", "POST", KW_URL,
         "-H", "Content-Type: application/json",
         "-d", json.dumps(payload, ensure_ascii=False)],
        capture_output=True, encoding='utf-8', errors='replace', timeout=timeout
    )
    if result.returncode != 0:
        print(f"  [ERR] curl failed: {result.stderr}")
        return None
    try:
        data = json.loads(result.stdout)
        if data.get("ok"):
            return data["data"]
        else:
            print(f"  [ERR] KW error: {data.get('error', 'unknown')}")
            return None
    except json.JSONDecodeError:
        print(f"  [ERR] Invalid JSON response")
        return None


def fetch_posts():
    """通过 Kimi WebBridge 获取雪球帖子"""
    print("[1] 通过 Kimi WebBridge 获取帖子...")

    # 检查是否已有雪球页面
    existing = kw_call("find_tab", {"url": "xueqiu.com", "active": False}, session=SESSION)
    if existing and existing.get("success"):
        print(f"    使用已有雪球标签页: {existing.get('url')}")
    else:
        nav = kw_call("navigate", {"url": XUEQIU_PROFILE_URL, "newTab": True},
                      session=SESSION, timeout=15)
        if not nav or not nav.get("success"):
            print("  ERR: 无法打开雪球页面")
            return None
        print(f"    已打开: {nav.get('url')}")
        time.sleep(3)

    # 通过浏览器 fetch API 抓取
    js_fetch = """(async function() {
        const resp = await fetch('/v4/statuses/user_timeline.json?page=1&user_id=%s');
        const data = await resp.json();
        const now = Date.now();
        const dayAgo = now - 86400000;
        const statuses = (data.statuses || [])
            .filter(function(s) { return s.created_at > dayAgo; })
            .map(function(s) {
                var meta = {};
                try { meta = JSON.parse(s.meta_keywords || '{}'); } catch(e) {}
                return {
                    id: s.id,
                    created_at: s.created_at,
                    time_str: new Date(s.created_at).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}),
                    text: s.text || '',
                    retweeted_status: s.retweeted_status ? {
                        id: s.retweeted_status.id,
                        text: s.retweeted_status.text || '',
                        user_name: s.retweeted_status.user ? s.retweeted_status.user.screen_name : ''
                    } : null,
                    source: s.source || '',
                    reply_count: s.reply_count || 0,
                    like_count: s.like_count || 0,
                    retweet_count: s.retweet_count || 0,
                    ip_location: meta.ip_location || ''
                };
            });
        return JSON.stringify({total: data.statuses ? data.statuses.length : 0, filtered: statuses.length, statuses: statuses});
    })()""" % XUEQIU_USER_ID

    result = kw_call("evaluate", {"code": js_fetch}, session=SESSION)
    if not result:
        return None

    try:
        data = json.loads(result.get("value", result))
        if "error" in data:
            print(f"  ERR: {data['error']}")
            return None
        print(f"    总帖子数: {data['total']}, 24h内: {data['filtered']}")
        return data
    except (json.JSONDecodeError, TypeError) as e:
        print(f"  ERR: 解析失败: {e}")
        return None


def build_posts(posts_data):
    """构建清洗后的帖子列表"""
    posts = []
    for p in posts_data["statuses"]:
        text_clean = strip_html(p["text"])
        rt = p.get("retweeted_status")
        retweet_text = strip_html(rt["text"]) if rt and rt.get("text") else ""
        retweet_user = rt.get("user_name", "") if rt else ""

        post = {
            "id": p["id"],
            "text": text_clean,
            "retweet_text": retweet_text,
            "retweet_user": retweet_user,
            "created_at": p["created_at"],
            "url": f"https://xueqiu.com/{XUEQIU_USER_ID}/{p['id']}",
            "retweet_count": p["retweet_count"],
            "like_count": p["like_count"],
            "reply_count": p["reply_count"],
        }

        posts.append(post)
        print(f"    [{p['id']}] {p['time_str']} | {text_clean[:60]}...")
        if retweet_text:
            print(f"         转发 @{retweet_user}: {retweet_text[:60]}...")

    return posts


def post_to_server(source_id, posts):
    """将帖子推送到 News Hub 服务器"""
    print(f"[2] 推送到服务器 (source_id={source_id[:8]}...)...")

    payload = json.dumps({
        "source_id": source_id,
        "posts": posts
    }, ensure_ascii=False).encode('utf-8')

    url = f"{SERVER_URL.rstrip('/')}/api/cron/fetch-xueqiu"
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CRON_SECRET}"
        },
        method="POST"
    )

    try:
        resp = urllib.request.urlopen(req, timeout=180)
        result = json.loads(resp.read())
        if result.get('success'):
            if result.get('message') == '今日摘要已存在':
                print(f"    今日摘要已存在: {result.get('articleId')}")
            else:
                print(f"    AI 摘要生成成功!")
                print(f"    标题: {result.get('title')}")
                print(f"    文章ID: {result.get('articleId')}")
                print(f"    处理帖子: {result.get('posts')} 条 → {result.get('categories')} 个分类")
        else:
            print(f"    错误: {result.get('error')}")
        return result
    except urllib.error.HTTPError as e:
        print(f"  ERR: HTTP {e.code} - {e.read().decode('utf-8', errors='replace')[:500]}")
        return None
    except Exception as e:
        print(f"  ERR: 请求失败: {e}")
        return None


def dry_run_ai(posts):
    """本地 AI 分析（dry-run 模式）"""
    print("[2] 本地 AI 分析 (dry-run)...")

    SYSTEM_PROMPT = """你是一位专业的投资研究分析师，擅长从投资大师的言论中提炼核心观点。

你的任务是分析段永平（大道无形我有型）在雪球上的发言，并输出结构化的分析报告。

## 分析要求

1. **分类**：将发言按主题分为以下类别：
   - 投资理念（价值投资、买股票就是买公司、能力圈、安全边际等）
   - 公司分析（对具体公司的看法、财报解读、商业模式分析等）
   - 市场观点（对市场走势、宏观经济、行业趋势的看法）
   - 人生智慧（关于生活、工作、学习、决策的感悟）
   - 问答互动（回复网友提问中的有价值观点）
   - 其他

2. **核心观点提炼**：每个类别提炼 1-5 条核心观点，每条观点简洁有力（≤80 字），保留原汁原味表达

3. **整体评价**：用 2-3 句话总结今日发言的整体质量和主题倾向

请严格按 JSON 格式输出：
```json
{"categories": [{"name": "类别", "posts_count": N, "core_insights": [{"insight": "观点", "source_post_id": "ID"}]}], "overall_assessment": "评价"}
```"""

    posts_text = []
    for p in posts:
        entry = f"---\n发言ID: {p['id']}\n时间: {datetime.fromtimestamp(p['created_at']/1000, tz=TZ_CN).strftime('%Y-%m-%d %H:%M')}\n\n{p['text']}\n"
        if p.get('retweet_text'):
            entry += f"\n转发 @{p['retweet_user']} 原文:\n{p['retweet_text']}\n"
        posts_text.append(entry)

    user_prompt = f"以下是段永平（大道无形我有型）最近24小时在雪球上的发言，共 {len(posts)} 条：\n\n{''.join(posts_text)}\n请对以上发言进行分类汇总，提炼核心观点。"

    payload = json.dumps({
        "model": AI_CONFIG["model"],
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": AI_CONFIG["temperature"],
        "max_tokens": AI_CONFIG["max_tokens"],
    }).encode('utf-8')

    req = urllib.request.Request(
        f"{AI_CONFIG['base_url']}/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {AI_CONFIG['api_key']}"}
    )

    try:
        resp = urllib.request.urlopen(req, timeout=60)
        result = json.loads(resp.read())
        content = result["choices"][0]["message"]["content"]
        usage = result.get("usage", {})
        print(f"    Token: prompt={usage.get('prompt_tokens')}, completion={usage.get('completion_tokens')}, total={usage.get('total_tokens')}")
        return content
    except Exception as e:
        print(f"  ERR: AI 调用失败: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="段永平雪球发言抓取")
    parser.add_argument("--dry-run", action="store_true", help="本地 AI 分析模式（不推送到服务器）")
    parser.add_argument("--source-id", default=SOURCE_ID, help="Supabase source UUID")
    args = parser.parse_args()

    print("=" * 60)
    if args.dry_run:
        print("  段永平雪球发言抓取 (dry-run 本地分析)")
    else:
        print("  段永平雪球发言抓取 → 推送到服务器")
    print("=" * 60)

    # 健康检查
    try:
        result = subprocess.run(
            "curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' -d '{}'",
            capture_output=True, encoding='utf-8', errors='replace', shell=True, timeout=10
        )
        json.loads(result.stdout)
        print("  Kimi WebBridge: OK")
    except Exception as e:
        print(f"  ERR: Kimi WebBridge 不可用: {e}")
        sys.exit(1)

    # 抓取帖子
    posts_data = fetch_posts()
    if not posts_data or not posts_data.get("statuses"):
        print("\n无新帖子（24h内无发言）")
        sys.exit(0)

    # 清洗
    print(f"\n[2] 整理 {len(posts_data['statuses'])} 条帖子...")
    posts = build_posts(posts_data)

    if args.dry_run:
        # 本地 AI 分析
        ai_result = dry_run_ai(posts)
        print("\n" + "=" * 60)
        print("  AI 分析结果")
        print("=" * 60)
        print(ai_result)

        # 保存报告
        out = f"scripts/xueqiu_dryrun_{datetime.now(TZ_CN).strftime('%Y%m%d_%H%M')}.json"
        with open(f"D:/AIworkplace/claudecode/news-hub/{out}", 'w', encoding='utf-8') as f:
            json.dump({"fetch_time": datetime.now(TZ_CN).isoformat(), "posts_count": len(posts), "posts": posts, "ai_analysis": ai_result}, f, ensure_ascii=False, indent=2)
        print(f"\n报告已保存: {out}")

    else:
        # 推送到服务器
        source_id = args.source_id or get_source_id()
        if not source_id:
            print("\n  ERR: 请指定 --source-id <uuid> 或在 Supabase 中查找 xueqiu 来源的 ID")
            print("  提示: 在 settings 页面添加雪球来源后，在 sources 表中查找其 id")
            sys.exit(1)

        result = post_to_server(source_id, posts)
        if result and result.get("success"):
            if result.get('message') == '今日摘要已存在':
                print(f"\n✓ 今日摘要已存在，无需重复生成")
            else:
                print(f"\n✓ 推送成功: {result.get('posts')} 条帖子 → 1 篇摘要文章入库")

    print("\n完成!")


def get_source_id():
    """从 Supabase 查询 xueqiu 类型的 source_id"""
    try:
        supabase_url = "https://wwwqueddxfilhhpjuybb.supabase.co"
        service_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3d3F1ZWRkeGZpbGhocGp1eWJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQyNjMxNCwiZXhwIjoyMDk1MDAyMzE0fQ.PB8aXF2bCZQvh6_bQwOpW2siAFv9CF2x8TLRlt1fAbA"

        req = urllib.request.Request(
            f"{supabase_url}/rest/v1/sources?select=id,name&type=eq.xueqiu&limit=1",
            headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"}
        )
        resp = urllib.request.urlopen(req)
        sources = json.loads(resp.read())
        if sources:
            print(f"    自动检测到来源: {sources[0]['name']} (id={sources[0]['id'][:8]}...)")
            return sources[0]["id"]
        print(f"    未在数据库中检测到 xueqiu 类型来源，使用默认 SOURCE_ID")
        return SOURCE_ID
    except Exception as e:
        print(f"    查询 Supabase 失败: {e}")
        return None


if __name__ == "__main__":
    main()
