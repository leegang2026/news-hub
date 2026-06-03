"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Edit2, Rss, Globe, FileJson, MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface SourceRecord {
  id: string;
  board_id: string;
  user_id: string;
  name: string;
  type: "rss" | "web" | "api" | "wechat" | "xueqiu";
  url: string;
  config: Record<string, any>;
}

interface SourceForm {
  name: string;
  type: "rss" | "web" | "api" | "wechat" | "xueqiu";
  url: string;
  selector: string;
}

const typeIcons = {
  rss: Rss,
  web: Globe,
  api: FileJson,
  wechat: MessageCircle,
  xueqiu: Globe,
};

const typeLabels: Record<string, string> = {
  rss: "RSS 订阅",
  web: "网页抓取",
  api: "API 接口",
  wechat: "微信公众号",
  xueqiu: "雪球用户",
};

interface SourceManagerProps {
  boardId: string;
  boardName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const emptyForm: SourceForm = { name: "", type: "rss", url: "", selector: "" };

export function SourceManager({ boardId, boardName, open, onOpenChange, onSaved }: SourceManagerProps) {
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<SourceRecord | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<SourceForm>({ ...emptyForm });

  // Fetch sources when dialog opens
  useEffect(() => {
    if (!open) return;
    async function fetchSources() {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user?.id) return;

        const { data } = await supabase
          .from("sources")
          .select("*")
          .eq("board_id", boardId)
          .eq("user_id", userData.user.id)
          .order("created_at", { ascending: true });

        setSources(data || []);
      } catch {
        // ignore
      }
      setLoading(false);
    }
    fetchSources();
  }, [open, boardId]);

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditing(null);
    setIsAdding(false);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      toast.error("请填写名称和 URL");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) {
        toast.error("请先登录");
        return;
      }

      // xueqiu type stored as "web" with config marker (DB constraint pending)
      const dbType = form.type === "xueqiu" ? "web" : form.type;
      const xueqiuConfig = form.type === "xueqiu" ? { xueqiu_user_id: form.url.trim() } : {};
      const selectorConfig = form.selector ? { selectors: { item: form.selector } } : {};
      const config = { ...xueqiuConfig, ...selectorConfig };

      const payload = {
        board_id: boardId,
        user_id: userData.user.id,
        name: form.name.trim(),
        type: dbType,
        url: form.url.trim(),
        config,
      };

      if (editing) {
        const { error } = await supabase
          .from("sources")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        setSources(sources.map((s) => (s.id === editing.id ? { ...s, ...payload, config: payload.config } : s)));
        toast.success("来源已更新");
      } else {
        const { data, error } = await supabase
          .from("sources")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        if (data) setSources([...sources, data]);
        toast.success("来源已添加");
      }
      resetForm();
      onSaved?.();
    } catch (err: any) {
      toast.error("保存失败: " + (err.message || "未知错误"));
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from("sources").delete().eq("id", id);
      if (error) throw error;
      setSources(sources.filter((s) => s.id !== id));
      toast.success("来源已删除");
      onSaved?.();
    } catch (err: any) {
      toast.error("删除失败: " + (err.message || "未知错误"));
    }
  };

  const startEdit = (source: SourceRecord) => {
    setEditing(source);
    const isXueqiu = source.type === "xueqiu" || source.config?.xueqiu_user_id;
    setForm({
      name: source.name,
      type: isXueqiu ? "xueqiu" : source.type,
      url: source.url,
      selector: source.config?.selectors?.item || "",
    });
    setIsAdding(true);
  };

  const startAdd = () => {
    resetForm();
    setIsAdding(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>管理来源 — {boardName}</DialogTitle>
        </DialogHeader>

        {isAdding ? (
          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">名称</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：36氪"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">类型</label>
              <div className="flex gap-2 flex-wrap">
                {( ["rss", "web", "api", "wechat", "xueqiu"] as const ).map((t) => {
                  const Icon = typeIcons[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, type: t })}
                      className={`flex items-center gap-1 rounded-md border px-3 py-2 text-xs transition-colors ${
                        form.type === t
                          ? "border-neutral-800 bg-neutral-800 text-white"
                          : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {typeLabels[t]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                {form.type === "wechat" ? "公众号文章链接 / 搜狗搜索链接" :
                 form.type === "xueqiu" ? "雪球用户 ID（数字）" : "URL 地址"}
              </label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder={
                  form.type === "rss" ? "https://example.com/feed" :
                  form.type === "xueqiu" ? "例如：1247347556" :
                  "https://example.com"
                }
              />
            </div>

            {form.type === "web" && (
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">CSS 选择器（可选）</label>
                <Input
                  value={form.selector}
                  onChange={(e) => setForm({ ...form, selector: e.target.value })}
                  placeholder="例如：article, .post-item"
                />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={resetForm}>
                取消
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : editing ? "保存修改" : "添加来源"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
              </div>
            ) : sources.length === 0 ? (
              <div className="py-8 text-center text-sm text-neutral-400">
                暂无来源，点击下方按钮添加
              </div>
            ) : (
              sources.map((source) => {
                const isXueqiu = source.type === "xueqiu" || source.config?.xueqiu_user_id;
                const displayType = isXueqiu ? "xueqiu" : source.type;
                const Icon = typeIcons[displayType] || Globe;
                return (
                  <div
                    key={source.id}
                    className="flex items-center gap-3 rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2.5"
                  >
                    <Icon className="h-4 w-4 text-neutral-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-neutral-900">{source.name}</span>
                        <span className="text-[10px] text-neutral-400 border border-neutral-200 rounded px-1">
                          {typeLabels[displayType] || typeLabels[source.type]}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-400 truncate">{source.url}</div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(source)}>
                        <Edit2 className="h-3.5 w-3.5 text-neutral-400" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(source.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}

            <Button variant="outline" className="w-full gap-1 mt-2" onClick={startAdd}>
              <Plus className="h-4 w-4" />
              添加来源
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
