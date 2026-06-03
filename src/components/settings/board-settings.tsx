"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Rss, Globe, FileJson, MessageCircle, X, ChevronDown, ChevronUp, SlidersHorizontal, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { mockBoards } from "@/lib/demo-data";
import { toast } from "sonner";
import { CriteriaEditor } from "./criteria-settings";
import { DEFAULT_CRITERIA, type JudgmentCriteria } from "@/lib/ai/criteria-defaults";

interface Source {
  id: string;
  name: string;
  type: "rss" | "web" | "api" | "wechat";
  url: string;
  selector?: string;
}

interface BoardItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  keywords: string;
  excludeKeywords: string;
  minImportance: number;
  sources: Source[];
  criteria?: JudgmentCriteria;
}

const typeIcons = {
  rss: Rss,
  web: Globe,
  api: FileJson,
  wechat: MessageCircle,
};

const typeLabels: Record<string, string> = {
  rss: "RSS",
  web: "网页",
  api: "API",
  wechat: "公众号",
};

const mockSourcesData: Record<string, Source[]> = {
  "demo-1": [
    { id: "s1", name: "36氪", type: "rss", url: "https://36kr.com/feed" },
    { id: "s2", name: "TechCrunch", type: "rss", url: "https://techcrunch.com/feed/" },
    { id: "s3", name: "BBC 科技", type: "web", url: "https://www.bbc.com/news/technology", selector: ".gs-c-promo" },
  ],
  "demo-2": [
    { id: "s4", name: "机器之心", type: "rss", url: "https://www.jiqizhixin.com/rss" },
    { id: "s5", name: "Paper Digest", type: "api", url: "https://api.paperdigest.org/daily" },
  ],
  "demo-3": [
    { id: "s6", name: "财新网", type: "rss", url: "https://caixin.com/feed" },
    { id: "s7", name: "华尔街见闻", type: "wechat", url: "https://mp.weixin.qq.com/s/xxx" },
  ],
};

const mockBoardFilters: Record<string, { keywords: string; excludeKeywords: string; minImportance: number }> = {
  "demo-1": { keywords: "科技,AI,创业", excludeKeywords: "广告", minImportance: 50 },
  "demo-2": { keywords: "大模型,OpenAI,Claude", excludeKeywords: "招聘", minImportance: 60 },
  "demo-3": { keywords: "央行,股市,基金", excludeKeywords: "房产", minImportance: 65 },
};

export function BoardSettings() {
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState<BoardItem | null>(null);

  // Board form state
  const [formName, setFormName] = useState("");
  const [formIcon, setFormIcon] = useState("📁");
  const [formDesc, setFormDesc] = useState("");
  const [formKeywords, setFormKeywords] = useState("");
  const [formExclude, setFormExclude] = useState("");
  const [formMinImportance, setFormMinImportance] = useState(0);
  const [formSources, setFormSources] = useState<Source[]>([]);
  const [formCriteria, setFormCriteria] = useState<JudgmentCriteria>(DEFAULT_CRITERIA);
  const [showCriteria, setShowCriteria] = useState(false);

  // Source form state
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [editingSourceIndex, setEditingSourceIndex] = useState<number | null>(null);
  const [srcName, setSrcName] = useState("");
  const [srcType, setSrcType] = useState<Source["type"]>("rss");
  const [srcUrl, setSrcUrl] = useState("");
  const [srcSelector, setSrcSelector] = useState("");

  const supabase = createClient();

  useEffect(() => {
    fetchBoards();
  }, []);

  const fetchBoards = async () => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      setBoards(
        mockBoards.map((b) => {
          const filters = mockBoardFilters[b.id] || { keywords: "", excludeKeywords: "", minImportance: 0 };
          return {
            id: b.id,
            name: b.name,
            icon: b.icon || "📁",
            description: b.description || "",
            keywords: filters.keywords,
            excludeKeywords: filters.excludeKeywords,
            minImportance: filters.minImportance,
            sources: mockSourcesData[b.id] || [],
          };
        })
      );
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("boards")
      .select("id, name, icon, description, criteria, keywords, exclude_keywords, min_importance, sources(id, name, type, url, config)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      setBoards(
        data.map((b: any) => ({
          id: b.id,
          name: b.name,
          icon: b.icon || "📁",
          description: b.description || "",
          keywords: (b.keywords || []).join(", "),
          excludeKeywords: (b.exclude_keywords || []).join(", "),
          minImportance: b.min_importance || 0,
          criteria: b.criteria && Object.keys(b.criteria).length > 0 ? b.criteria : undefined,
          sources: (b.sources || []).map((s: any) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            url: s.url,
            selector: s.config?.selectors?.item || "",
          })),
        }))
      );
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormName("");
    setFormIcon("📁");
    setFormDesc("");
    setFormKeywords("");
    setFormExclude("");
    setFormMinImportance(0);
    setFormSources([]);
    setFormCriteria(DEFAULT_CRITERIA);
    setShowCriteria(false);
    setEditingBoard(null);
    resetSourceForm();
  };

  const resetSourceForm = () => {
    setShowSourceForm(false);
    setEditingSourceIndex(null);
    setSrcName("");
    setSrcType("rss");
    setSrcUrl("");
    setSrcSelector("");
  };

  const loadDefaultCriteria = (): JudgmentCriteria => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("judgment_criteria");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return { ...DEFAULT_CRITERIA, ...parsed };
        } catch {
          // fall through
        }
      }
    }
    return DEFAULT_CRITERIA;
  };

  const openNewBoard = () => {
    resetForm();
    setFormCriteria(loadDefaultCriteria());
    setDialogOpen(true);
  };

  const openEditBoard = (board: BoardItem) => {
    setEditingBoard(board);
    setFormName(board.name);
    setFormIcon(board.icon);
    setFormDesc(board.description);
    setFormKeywords(board.keywords);
    setFormExclude(board.excludeKeywords);
    setFormMinImportance(board.minImportance);
    setFormSources([...board.sources]);
    setFormCriteria(board.criteria ? { ...DEFAULT_CRITERIA, ...board.criteria } : DEFAULT_CRITERIA);
    setDialogOpen(true);
  };

  const handleSaveBoard = async () => {
    if (!formName.trim()) {
      toast.error("请填写板块名称");
      return;
    }

    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      if (editingBoard) {
        setBoards(boards.map((b) => (b.id === editingBoard.id ? { ...b, name: formName.trim(), icon: formIcon, description: formDesc, keywords: formKeywords, excludeKeywords: formExclude, minImportance: formMinImportance, sources: formSources, criteria: formCriteria } : b)));
        toast.success("板块已更新");
      } else {
        const newBoard: BoardItem = {
          id: "demo-" + Date.now(),
          name: formName.trim(),
          icon: formIcon,
          description: formDesc,
          keywords: formKeywords,
          excludeKeywords: formExclude,
          minImportance: formMinImportance,
          sources: formSources,
          criteria: formCriteria,
        };
        setBoards([...boards, newBoard]);
        toast.success("板块已创建");
      }
      setDialogOpen(false);
      resetForm();
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      name: formName.trim(),
      description: formDesc.trim() || null,
      icon: formIcon,
      keywords: formKeywords.split(",").map((k) => k.trim()).filter(Boolean),
      exclude_keywords: formExclude.split(",").map((k) => k.trim()).filter(Boolean),
      min_importance: formMinImportance,
      criteria: formCriteria as any,
    };

    let boardId = editingBoard?.id || "";

    if (editingBoard) {
      const { error } = await supabase
        .from("boards")
        .update(payload)
        .eq("id", editingBoard.id);
      if (error) {
        toast.error("更新失败: " + error.message);
        return;
      }
      // 删除旧来源，重新插入
      await supabase.from("sources").delete().eq("board_id", boardId);
    } else {
      const { data: newBoard, error } = await supabase
        .from("boards")
        .insert({ user_id: user.id, ...payload })
        .select("id")
        .single();
      if (error || !newBoard) {
        toast.error("创建失败: " + error?.message);
        return;
      }
      boardId = newBoard.id;
    }

    // 保存来源
    if (formSources.length > 0) {
      const sourceRows = formSources.map((s) => ({
        board_id: boardId,
        user_id: user.id,
        name: s.name,
        type: s.type,
        url: s.url,
        config: s.selector ? { selectors: { item: s.selector } } : {},
      }));
      const { error: srcError } = await supabase.from("sources").insert(sourceRows);
      if (srcError) {
        toast.error("来源保存失败: " + srcError.message);
      }
    }

    toast.success(editingBoard ? "板块已更新" : "板块已创建");
    setDialogOpen(false);
    resetForm();
    fetchBoards();
  };

  const handleDeleteBoard = async (id: string) => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      setBoards(boards.filter((b) => b.id !== id));
      toast.success("板块已删除");
      return;
    }
    const { error } = await supabase.from("boards").delete().eq("id", id);
    if (error) {
      toast.error("删除失败");
      return;
    }
    toast.success("板块已删除");
    fetchBoards();
  };

  const startAddSource = () => {
    resetSourceForm();
    setShowSourceForm(true);
  };

  const startEditSource = (index: number) => {
    const s = formSources[index];
    setEditingSourceIndex(index);
    setSrcName(s.name);
    setSrcType(s.type);
    setSrcUrl(s.url);
    setSrcSelector(s.selector || "");
    setShowSourceForm(true);
  };

  const handleSaveSource = () => {
    if (!srcName.trim() || !srcUrl.trim()) {
      toast.error("请填写来源名称和 URL");
      return;
    }

    const newSource: Source = {
      id: editingSourceIndex !== null ? formSources[editingSourceIndex].id : "src-" + Date.now(),
      name: srcName.trim(),
      type: srcType,
      url: srcUrl.trim(),
      selector: srcSelector || undefined,
    };

    if (editingSourceIndex !== null) {
      const updated = [...formSources];
      updated[editingSourceIndex] = newSource;
      setFormSources(updated);
      toast.success("来源已更新");
    } else {
      setFormSources([...formSources, newSource]);
      toast.success("来源已添加");
    }
    resetSourceForm();
  };

  const handleDeleteSource = (index: number) => {
    setFormSources(formSources.filter((_, i) => i !== index));
    toast.success("来源已删除");
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-400">
        加载中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-neutral-900">板块列表</h2>
          <Button size="sm" className="h-8 gap-1" onClick={openNewBoard}>
            <Plus className="h-3.5 w-3.5" />
            新建板块
          </Button>
        </div>

        {boards.length === 0 ? (
          <div className="py-8 text-center text-sm text-neutral-400">暂无板块，点击上方按钮创建</div>
        ) : (
          <div className="space-y-1">
            {boards.map((board) => (
              <div
                key={board.id}
                className="flex items-center gap-2 rounded-md border border-neutral-100 bg-white px-3 py-2 hover:bg-neutral-50"
              >
                <span className="text-lg">{board.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-neutral-900 truncate">{board.name}</div>
                  {board.description && <div className="text-xs text-neutral-400 truncate">{board.description}</div>}
                </div>
                <span className="text-xs text-neutral-400 shrink-0">{board.sources.length} 个来源</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditBoard(board)}>
                  <Edit2 className="h-3.5 w-3.5 text-neutral-400" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteBoard(board.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New / Edit Board Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-[54rem] max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{editingBoard ? "编辑板块" : "新建板块"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Board Info */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">基本信息</h3>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">名称</label>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="板块名称" />
                </div>
                <div className="w-20">
                  <label className="block text-xs font-medium text-neutral-600 mb-1">图标</label>
                  <Input value={formIcon} onChange={(e) => setFormIcon(e.target.value)} placeholder="📁" className="text-center" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">描述</label>
                <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="可选描述" />
              </div>
            </div>

            {/* Filter Config */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                过滤条件（板块全局）
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">包含关键词</label>
                  <Input value={formKeywords} onChange={(e) => setFormKeywords(e.target.value)} placeholder="AI, 科技（逗号分隔）" />
                  <p className="mt-1 text-[11px] text-neutral-400">标题或内容包含任一关键词才保留，留空表示不过滤</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">排除关键词</label>
                  <Input value={formExclude} onChange={(e) => setFormExclude(e.target.value)} placeholder="广告, 招聘" />
                  <p className="mt-1 text-[11px] text-neutral-400">标题或内容包含任一关键词则丢弃</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">最小重要度：{formMinImportance}</label>
                <input type="range" min={0} max={100} value={formMinImportance} onChange={(e) => setFormMinImportance(parseInt(e.target.value))} className="w-full accent-neutral-800" />
                <p className="mt-0.5 text-[11px] text-neutral-400">AI 判断的重要度低于此值的文章将不收录进该板块</p>
              </div>
            </div>

            {/* Sources Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">信息来源</h3>
                {!showSourceForm && (
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={startAddSource}>
                    <Plus className="h-3.5 w-3.5" />
                    添加来源
                  </Button>
                )}
              </div>

              {/* Source List */}
              {formSources.length > 0 && (
                <div className="space-y-1.5">
                  {formSources.map((s, i) => {
                    const Icon = typeIcons[s.type];
                    return (
                      <div key={s.id} className="flex items-center gap-2 rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2">
                        <Icon className="h-4 w-4 text-neutral-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-neutral-900">{s.name}</span>
                            <span className="text-[10px] text-neutral-400 border border-neutral-200 rounded px-1">{typeLabels[s.type]}</span>
                          </div>
                          <div className="text-xs text-neutral-400 truncate">{s.url}</div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEditSource(i)}>
                          <Edit2 className="h-3 w-3 text-neutral-400" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteSource(i)}>
                          <Trash2 className="h-3 w-3 text-red-400" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Source Form */}
              {showSourceForm && (
                <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-neutral-900">
                      {editingSourceIndex !== null ? "编辑来源" : "添加来源"}
                    </h4>
                    <button onClick={resetSourceForm} className="rounded p-1 text-neutral-400 hover:bg-neutral-100">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">名称</label>
                      <Input value={srcName} onChange={(e) => setSrcName(e.target.value)} placeholder="例如：36氪" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">类型</label>
                      <div className="grid grid-cols-4 gap-1">
                        {( ["rss", "web", "api", "wechat"] as const ).map((t) => {
                          const Icon = typeIcons[t];
                          return (
                            <button
                              key={t}
                              onClick={() => setSrcType(t)}
                              className={`flex flex-col items-center gap-0.5 rounded border py-1.5 text-[10px] transition-colors ${
                                srcType === t
                                  ? "border-neutral-800 bg-neutral-800 text-white"
                                  : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {typeLabels[t]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">URL</label>
                    <Input value={srcUrl} onChange={(e) => setSrcUrl(e.target.value)} placeholder={srcType === "rss" ? "https://example.com/feed" : "https://example.com"} />
                  </div>

                  {srcType === "web" && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">CSS 选择器（可选）</label>
                      <Input value={srcSelector} onChange={(e) => setSrcSelector(e.target.value)} placeholder="article, .post-item" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={resetSourceForm}>取消</Button>
                    <Button size="sm" className="flex-1" onClick={handleSaveSource}>
                      {editingSourceIndex !== null ? "保存修改" : "添加来源"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Criteria Section */}
            <div className="space-y-3">
              <button
                onClick={() => setShowCriteria(!showCriteria)}
                className="flex items-center justify-between w-full text-left"
              >
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  判断标准配置
                </h3>
                {showCriteria ? (
                  <ChevronUp className="h-4 w-4 text-neutral-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-neutral-400" />
                )}
              </button>
              {showCriteria && (
                <div className="rounded-lg border border-neutral-200 bg-white p-4">
                  <CriteriaEditor
                    criteria={formCriteria}
                    onChange={setFormCriteria}
                    compact
                  />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-neutral-100">
              <Button variant="outline" className="flex-1" onClick={() => { setDialogOpen(false); resetForm(); }}>取消</Button>
              <Button className="flex-1" onClick={handleSaveBoard}>
                {editingBoard ? "保存板块" : "创建板块"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
