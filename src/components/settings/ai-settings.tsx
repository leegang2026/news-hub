"use client";

import { useState, useEffect } from "react";
import {
  Key,
  Bot,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Sparkles,
  Settings2,
  Globe,
  Thermometer,
  Hash,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export interface ModelConfig {
  id: string;
  alias: string;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  enabled: boolean;
  isDefault: boolean;
}

const providerOptions = [
  { key: "deepseek",    name: "DeepSeek",     defaultUrl: "https://api.deepseek.com/v1",          models: "deepseek-chat, deepseek-reasoner" },
  { key: "gemini",      name: "Gemini",       defaultUrl: "https://generativelanguage.googleapis.com/v1beta", models: "gemini-2.0-flash-lite, gemini-2.0-flash" },
  { key: "openai",      name: "OpenAI",       defaultUrl: "https://api.openai.com/v1",            models: "gpt-4o-mini, gpt-4o" },
  { key: "qwen",        name: "千问 (Qwen)",  defaultUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: "qwen-turbo, qwen-plus, qwen-max" },
  { key: "kimi",        name: "Kimi",         defaultUrl: "https://api.moonshot.cn/v1",           models: "moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k" },
  { key: "glm",         name: "GLM (智谱)",   defaultUrl: "https://open.bigmodel.cn/api/paas/v4", models: "glm-4-flash, glm-4, glm-4-plus" },
  { key: "minimax",     name: "Minimax",      defaultUrl: "https://api.minimax.chat/v1",          models: "abab6.5s-chat, abab6.5-chat" },
  { key: "xiaomi",      name: "小米",         defaultUrl: "https://api.xiaomi.ai/v1",             models: "mi-v1, mi-v1-pro" },
  { key: "custom",      name: "自定义",       defaultUrl: "",                                     models: "自定义模型" },
];

const defaultConfigs: ModelConfig[] = [];

export function AISettings() {
  const [configs, setConfigs] = useState<ModelConfig[]>(defaultConfigs);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("model_configs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (data && data.length > 0) {
      setConfigs(data.map((c: any) => ({
        id: c.id,
        alias: c.alias,
        provider: c.provider,
        apiKey: c.api_key,
        baseUrl: c.base_url || "",
        model: c.model,
        temperature: c.temperature,
        maxTokens: c.max_tokens,
        systemPrompt: c.system_prompt || "",
        enabled: c.enabled,
        isDefault: c.is_default,
      })));
    }
    setLoading(false);
  };

  // Form state
  const [formAlias, setFormAlias] = useState("");
  const [formProvider, setFormProvider] = useState("deepseek");
  const [formKey, setFormKey] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formTemp, setFormTemp] = useState(0.3);
  const [formMaxTokens, setFormMaxTokens] = useState(800);
  const [formSystem, setFormSystem] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);

  const resetForm = () => {
    setFormAlias("");
    setFormProvider("deepseek");
    setFormKey("");
    setFormBaseUrl("");
    setFormModel("");
    setFormTemp(0.3);
    setFormMaxTokens(800);
    setFormSystem("");
    setFormEnabled(true);
    setEditingId(null);
    setShowForm(false);
    setShowAdvanced(false);
  };

  const startAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const startEdit = (cfg: ModelConfig) => {
    setEditingId(cfg.id);
    setFormAlias(cfg.alias);
    setFormProvider(cfg.provider);
    setFormKey(cfg.apiKey);
    setFormBaseUrl(cfg.baseUrl);
    setFormModel(cfg.model);
    setFormTemp(cfg.temperature);
    setFormMaxTokens(cfg.maxTokens);
    setFormSystem(cfg.systemPrompt);
    setFormEnabled(cfg.enabled);
    setShowForm(true);
  };

  const getDefaultUrl = (provider: string) => {
    return providerOptions.find((p) => p.key === provider)?.defaultUrl || "";
  };

  const handleSave = async () => {
    if (!formAlias.trim() || !formKey.trim()) {
      toast.error("请填写别名和 API Key");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const baseUrl = formBaseUrl.trim() || getDefaultUrl(formProvider);
    const model = formModel.trim() || providerOptions.find((p) => p.key === formProvider)?.models.split(",")[0].trim() || "";

    const payload = {
      user_id: user.id,
      alias: formAlias.trim(),
      provider: formProvider,
      api_key: formKey,
      base_url: baseUrl,
      model,
      temperature: formTemp,
      max_tokens: formMaxTokens,
      system_prompt: formSystem || null,
      enabled: formEnabled,
      is_default: editingId ? undefined : configs.length === 0,
    };

    if (editingId) {
      const { error } = await supabase
        .from("model_configs")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        toast.error("更新失败: " + error.message);
        return;
      }
      toast.success("模型配置已更新");
    } else {
      const { error } = await supabase
        .from("model_configs")
        .insert(payload);
      if (error) {
        toast.error("添加失败: " + error.message);
        return;
      }
      toast.success("模型配置已添加");
    }
    resetForm();
    fetchConfigs();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("model_configs").delete().eq("id", id);
    if (error) {
      toast.error("删除失败");
      return;
    }
    toast.success("配置已删除");
    fetchConfigs();
  };

  const handleSetDefault = async (id: string) => {
    // Clear existing defaults
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("model_configs")
      .update({ is_default: false })
      .eq("user_id", user.id);
    // Set new default
    const { error } = await supabase
      .from("model_configs")
      .update({ is_default: true })
      .eq("id", id);
    if (error) {
      toast.error("切换失败");
      return;
    }
    toast.success("默认模型已切换");
    fetchConfigs();
  };

  const handleToggleEnabled = async (id: string, currentEnabled: boolean) => {
    const { error } = await supabase
      .from("model_configs")
      .update({ enabled: !currentEnabled })
      .eq("id", id);
    if (error) {
      toast.error("操作失败");
      return;
    }
    fetchConfigs();
  };

  return (
    <div className="space-y-6">
      {/* Model List */}
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">
              AI 模型配置
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              可配置多个大模型，灵活切换。支持自定义 Base URL 和高级参数。
            </p>
          </div>
          {!showForm && (
            <Button size="sm" className="h-8 gap-1" onClick={startAdd}>
              <Plus className="h-3.5 w-3.5" />
              添加模型
            </Button>
          )}
        </div>

        {configs.length === 0 && !showForm ? (
          <div className="py-8 text-center text-sm text-neutral-400">
            暂无配置，点击上方按钮添加
          </div>
        ) : (
          <div className="space-y-2">
            {configs.map((cfg) => {
              const p = providerOptions.find((o) => o.key === cfg.provider)!;
              return (
                <div
                  key={cfg.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                    cfg.isDefault
                      ? "border-neutral-300 bg-neutral-50"
                      : "border-neutral-100 bg-white"
                  } ${!cfg.enabled ? "opacity-60" : ""}`}
                >
                  <Bot className="h-4 w-4 text-neutral-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-neutral-900">
                        {cfg.alias}
                      </span>
                      {cfg.isDefault && cfg.enabled && (
                        <span className="flex items-center gap-0.5 text-[10px] font-medium text-white bg-neutral-800 rounded px-1.5 py-0.5">
                          <Check className="h-3 w-3" />
                          默认
                        </span>
                      )}
                      {!cfg.enabled && (
                        <span className="text-[10px] text-neutral-400 border border-neutral-200 rounded px-1">
                          已禁用
                        </span>
                      )}
                      <span className="text-[10px] text-neutral-400 border border-neutral-200 rounded px-1">
                        {p?.name || cfg.provider}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400 truncate">
                      {cfg.model} · {cfg.baseUrl.replace(/^https?:\/\//, "").split("/")[0]}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => handleToggleEnabled(cfg.id, cfg.enabled)}
                      className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100"
                      title={cfg.enabled ? "禁用" : "启用"}
                    >
                      {cfg.enabled ? (
                        <ToggleRight className="h-4 w-4 text-neutral-600" />
                      ) : (
                        <ToggleLeft className="h-4 w-4" />
                      )}
                    </button>
                    {!cfg.isDefault && cfg.enabled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px] text-neutral-500"
                        onClick={() => handleSetDefault(cfg.id)}
                      >
                        设为默认
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => startEdit(cfg)}
                    >
                      <Edit2 className="h-3.5 w-3.5 text-neutral-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleDelete(cfg.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="rounded-lg border border-neutral-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900">
              {editingId ? "编辑模型配置" : "添加模型配置"}
            </h3>
            <button
              onClick={resetForm}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            {/* Alias */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                别名（方便识别）
              </label>
              <Input
                value={formAlias}
                onChange={(e) => setFormAlias(e.target.value)}
                placeholder="例如：DeepSeek 主力、千问备用"
              />
            </div>

            {/* Provider */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                提供商
              </label>
              <div className="grid grid-cols-3 gap-2">
                {providerOptions.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => {
                      setFormProvider(p.key);
                      setFormModel("");
                      setFormBaseUrl(p.defaultUrl);
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-all ${
                      formProvider === p.key
                        ? "border-neutral-800 bg-neutral-800 text-white"
                        : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    <Bot className="h-4 w-4" />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                API Key
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  type="password"
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="sk-xxxxxxxx"
                  className="pl-10"
                />
              </div>
            </div>

            {/* Base URL */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Base URL（可选，留空使用默认）
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  value={formBaseUrl}
                  onChange={(e) => setFormBaseUrl(e.target.value)}
                  placeholder={getDefaultUrl(formProvider) || "https://api.example.com/v1"}
                  className="pl-10"
                />
              </div>
              <p className="mt-1 text-[11px] text-neutral-400">
                默认：{getDefaultUrl(formProvider) || "需手动填写"}
              </p>
            </div>

            {/* Model Name */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                模型名称（可选，留空使用默认）
              </label>
              <Input
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
                placeholder={
                  providerOptions.find((p) => p.key === formProvider)?.models.split(",")[0].trim()
                }
              />
              <p className="mt-1 text-[11px] text-neutral-400">
                支持模型：{providerOptions.find((p) => p.key === formProvider)?.models}
              </p>
            </div>

            {/* Advanced Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
            >
              <Settings2 className="h-3.5 w-3.5" />
              {showAdvanced ? "收起高级参数" : "展开高级参数"}
              {showAdvanced ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {showAdvanced && (
              <div className="space-y-3 rounded-md bg-neutral-50 p-3">
                {/* Temperature */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="flex items-center gap-1 text-xs font-medium text-neutral-600">
                      <Thermometer className="h-3.5 w-3.5" />
                      温度（Temperature）
                    </label>
                    <span className="text-xs font-mono text-neutral-500">{formTemp.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={formTemp}
                    onChange={(e) => setFormTemp(parseFloat(e.target.value))}
                    className="w-full accent-neutral-800"
                  />
                  <p className="mt-0.5 text-[11px] text-neutral-400">
                    越低越确定（0.0），越高越创意（2.0）。推荐 0.3 用于分类筛选。
                  </p>
                </div>

                {/* Max Tokens */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="flex items-center gap-1 text-xs font-medium text-neutral-600">
                      <Hash className="h-3.5 w-3.5" />
                      最大输出 Token
                    </label>
                    <span className="text-xs font-mono text-neutral-500">{formMaxTokens}</span>
                  </div>
                  <input
                    type="range"
                    min={200}
                    max={4000}
                    step={100}
                    value={formMaxTokens}
                    onChange={(e) => setFormMaxTokens(parseInt(e.target.value))}
                    className="w-full accent-neutral-800"
                  />
                </div>

                {/* System Prompt */}
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    自定义系统提示词（可选，留空使用默认）
                  </label>
                  <textarea
                    value={formSystem}
                    onChange={(e) => setFormSystem(e.target.value)}
                    placeholder="覆盖默认的系统提示词，用于自定义判断标准..."
                    rows={3}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 transition-colors focus:border-neutral-400 focus:outline-none resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={resetForm}>
              取消
            </Button>
            <Button className="flex-1" onClick={handleSave}>
              {editingId ? "保存修改" : "添加配置"}
            </Button>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4" />
          处理流程与费用
        </h2>
        <div className="rounded-md bg-neutral-50 p-3 text-xs text-neutral-600 space-y-1.5">
          <ol className="list-decimal list-inside space-y-1 text-neutral-500">
            <li>
              抓取来源文章 → 送入<strong>默认且已启用的模型</strong>处理
            </li>
            <li>
              判断<strong>相关性</strong>：是否与板块主题匹配
            </li>
            <li>
              判断<strong>去重</strong>：是否与已有文章是同一事件
            </li>
            <li>
              <strong>重要性</strong>评分 0-100
            </li>
            <li>
              生成<strong>摘要</strong>、提取<strong>标签</strong>、判断<strong>情感</strong>
            </li>
          </ol>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
          <div className="rounded-md bg-neutral-50 p-2">
            <div className="text-neutral-400">单次消耗</div>
            <div className="font-medium text-neutral-900">~4,000 tokens</div>
          </div>
          <div className="rounded-md bg-neutral-50 p-2">
            <div className="text-neutral-400">DeepSeek 单价</div>
            <div className="font-medium text-neutral-900">~2 元 / 百万</div>
          </div>
          <div className="rounded-md bg-neutral-50 p-2">
            <div className="text-neutral-400">预估月成本</div>
            <div className="font-medium text-green-600">~25 元</div>
          </div>
        </div>
      </div>
    </div>
  );
}
