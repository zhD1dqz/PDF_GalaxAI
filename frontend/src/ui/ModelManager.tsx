import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Cloud,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  Key,
  Link as LinkIcon,
  Loader2,
  Server,
  ShieldOff,
  Wifi,
  X,
  Zap,
} from 'lucide-react';

import {
  createModel,
  testModelAdhoc,
  updateModel,
  type LLMProtocol,
  type ModelConfig,
} from '../api/client';
import { useLanguage, type AppLanguage } from '../i18n/LanguageContext';

/* ------------------------------------------------------------------ */
/* 预设：按场景分组，贴合各家官方文档                                  */
/* ------------------------------------------------------------------ */

type OpenAiPreset = {
  id: string;
  label: string;
  base_url: string;
  model: string;
  hint: string;
};

type OpenAiPresetGroup = { title: string; subtitle?: string; items: OpenAiPreset[] };

const OPENAI_PRESET_GROUPS: OpenAiPresetGroup[] = [
  {
    title: '国际主流',
    subtitle: '官方 HTTPS 端点 · Bearer Token 鉴权',
    items: [
      {
        id: 'openai',
        label: 'OpenAI',
        base_url: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        hint: '官方 Chat Completions；model 即控制台中的模型名',
      },
      {
        id: 'groq',
        label: 'Groq',
        base_url: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        hint: 'Groq Cloud OpenAI 兼容层；model 以控制台可用列表为准',
      },
      {
        id: 'together',
        label: 'Together AI',
        base_url: 'https://api.together.xyz/v1',
        model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        hint: 'Together 统一推理 API；model 为 HuggingFace 风格 ID',
      },
      {
        id: 'fireworks',
        label: 'Fireworks',
        base_url: 'https://api.fireworks.ai/inference/v1',
        model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        hint: 'Fireworks serverless；需在控制台复制完整 model 路径',
      },
    ],
  },
  {
    title: '聚合路由',
    subtitle: '同一套 Key 跨厂商路由',
    items: [
      {
        id: 'openrouter',
        label: 'OpenRouter',
        base_url: 'https://openrouter.ai/api/v1',
        model: 'openai/gpt-4o-mini',
        hint: 'OpenRouter；model 形如 provider/model，详见 openrouter.ai/docs',
      },
      {
        id: 'siliconflow',
        label: 'SiliconFlow',
        base_url: 'https://api.siliconflow.cn/v1',
        model: 'Qwen/Qwen2.5-7B-Instruct',
        hint: '硅基流动；model 与控制台「模型名称」一致',
      },
    ],
  },
  {
    title: '国内与区域',
    subtitle: '合规商用 API',
    items: [
      {
        id: 'deepseek',
        label: 'DeepSeek',
        base_url: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        hint: 'DeepSeek 官方兼容接口',
      },
      {
        id: 'moonshot',
        label: 'Moonshot（Kimi）',
        base_url: 'https://api.moonshot.cn/v1',
        model: 'moonshot-v1-8k',
        hint: '月之暗面；长上下文可选 moonshot-v1-128k 等',
      },
      {
        id: 'zhipu',
        label: '智谱 GLM',
        base_url: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-4-flash',
        hint: '智谱开放平台 OpenAI 兼容路径 v4',
      },
      {
        id: 'dashscope',
        label: '阿里 DashScope',
        base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: 'qwen-plus',
        hint: 'DashScope 兼容 OpenAI 模式；model 见百炼控制台',
      },
      {
        id: 'baichuan',
        label: '百川',
        base_url: 'https://api.baichuan-ai.com/v1',
        model: 'Baichuan4-Turbo',
        hint: '百川智能 OpenAI 兼容；以官网最新模型名为准',
      },
    ],
  },
  {
    title: '本地与私有',
    subtitle: '局域网 / 本机推理',
    items: [
      {
        id: 'ollama',
        label: 'Ollama',
        base_url: 'http://127.0.0.1:11434/v1',
        model: 'qwen2.5:3b',
        hint: 'Ollama 内置 OpenAI 兼容层；model 与 ollama list 一致',
      },
      {
        id: 'lmstudio',
        label: 'LM Studio',
        base_url: 'http://127.0.0.1:1234/v1',
        model: 'local-model',
        hint: 'LM Studio Local Server；model 为服务端加载的模型标识',
      },
    ],
  },
];

const PRESET_ENGLISH: Record<string, string> = {
  '国际主流': 'Global Providers',
  '官方 HTTPS 端点 · Bearer Token 鉴权': 'Official HTTPS endpoints · Bearer token authentication',
  '官方 Chat Completions；model 即控制台中的模型名': 'Official Chat Completions; use the model name from your dashboard',
  'Groq Cloud OpenAI 兼容层；model 以控制台可用列表为准': 'Groq Cloud OpenAI-compatible API; choose an available dashboard model',
  'Together 统一推理 API；model 为 HuggingFace 风格 ID': 'Together unified inference API; models use Hugging Face-style IDs',
  'Fireworks serverless；需在控制台复制完整 model 路径': 'Fireworks serverless; copy the full model path from the dashboard',
  '聚合路由': 'Model Routers',
  '同一套 Key 跨厂商路由': 'One key for routing across providers',
  'OpenRouter；model 形如 provider/model，详见 openrouter.ai/docs': 'OpenRouter models use provider/model; see openrouter.ai/docs',
  '硅基流动；model 与控制台「模型名称」一致': 'SiliconFlow; use the model name shown in the dashboard',
  '国内与区域': 'Regional Providers',
  '合规商用 API': 'Commercial APIs',
  'DeepSeek 官方兼容接口': 'Official DeepSeek-compatible endpoint',
  '月之暗面；长上下文可选 moonshot-v1-128k 等': 'Moonshot AI; use moonshot-v1-128k for longer context',
  '智谱开放平台 OpenAI 兼容路径 v4': 'Zhipu OpenAI-compatible v4 endpoint',
  'DashScope 兼容 OpenAI 模式；model 见百炼控制台': 'DashScope OpenAI-compatible mode; choose a model from the console',
  '百川智能 OpenAI 兼容；以官网最新模型名为准': 'Baichuan OpenAI-compatible API; use a current official model name',
  '本地与私有': 'Local and Private',
  '局域网 / 本机推理': 'LAN / on-device inference',
  'Ollama 内置 OpenAI 兼容层；model 与 ollama list 一致': 'Ollama OpenAI-compatible API; model must match ollama list',
  'LM Studio Local Server；model 为服务端加载的模型标识': 'LM Studio Local Server; use the model ID loaded by the server',
  'Moonshot（Kimi）': 'Moonshot (Kimi)',
  '智谱 GLM': 'Zhipu GLM',
  '阿里 DashScope': 'Alibaba DashScope',
  '百川': 'Baichuan',
};

function presetText(value: string, language: AppLanguage) {
  return language === 'en' ? PRESET_ENGLISH[value] || value : value;
}

/* ------------------------------------------------------------------ */
/* 组件                                                                */
/* ------------------------------------------------------------------ */

type Props = {
  mode: 'create' | 'edit';
  initial?: ModelConfig;
  onClose: () => void;
  onSaved: (model: ModelConfig) => void;
};

type ProxyMode = 'auto' | 'direct' | 'custom';

function parseProxyMode(raw: string | undefined): { mode: ProxyMode; url: string } {
  const v = (raw || '').trim();
  if (!v || v.toLowerCase() === 'auto') return { mode: 'auto', url: '' };
  if (v.toLowerCase() === 'direct') return { mode: 'direct', url: '' };
  return { mode: 'custom', url: v };
}

function serializeProxy(mode: ProxyMode, url: string): string {
  if (mode === 'auto') return '';
  if (mode === 'direct') return 'direct';
  return url.trim();
}

export default function ModelManager({ mode, initial, onClose, onSaved }: Props) {
  const { language, tr } = useLanguage();
  const [label, setLabel] = useState(initial?.label || '');
  const [protocol, setProtocol] = useState<LLMProtocol>(
    (initial?.protocol as LLMProtocol) || 'openai'
  );
  const [baseUrl, setBaseUrl] = useState(initial?.base_url || '');
  const [model, setModel] = useState(initial?.model || '');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const parsedProxy = parseProxyMode(initial?.proxy);
  const [proxyMode, setProxyMode] = useState<ProxyMode>(parsedProxy.mode);
  const [proxyUrl, setProxyUrl] = useState(parsedProxy.url);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    sample?: string;
    proxy_mode?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const applyPreset = (p: OpenAiPreset) => {
    setProtocol('openai');
    setBaseUrl(p.base_url);
    setModel(p.model);
    if (!label.trim()) setLabel(p.label);
  };

  const buildPayload = () => ({
    label: label.trim(),
    protocol,
    base_url: baseUrl.trim(),
    model: model.trim(),
    api_key: apiKey.trim(),
    proxy: serializeProxy(proxyMode, proxyUrl),
  });

  const validateProxyLocal = (): string | null => {
    if (proxyMode !== 'custom') return null;
    const u = proxyUrl.trim();
    if (!u) return tr('已选择“自定义代理”，但尚未填写代理地址', 'Custom proxy is selected, but no proxy URL was provided');
    if (!/^(https?|socks5h?):\/\//i.test(u))
      return tr('代理地址必须以 http(s):// 或 socks5(h):// 开头', 'Proxy URL must start with http(s):// or socks5(h)://');
    return null;
  };

  const handleTest = async () => {
    setTestResult(null);
    setError(null);
    if (!model.trim()) return setError(tr('请填写 Model ID', 'Enter a Model ID'));
    if (protocol === 'openai' && !baseUrl.trim())
      return setError(tr('OpenAI 兼容协议必须填写 Base URL', 'A Base URL is required for the OpenAI-compatible protocol'));
    const proxyErr = validateProxyLocal();
    if (proxyErr) return setError(proxyErr);
    setTesting(true);
    try {
      if (mode === 'edit' && !apiKey.trim() && initial?.has_api_key) {
        setTestResult({
          ok: false,
          message: tr('编辑时需要重新粘贴 API Key 才能测试；也可以先保存，再从列表测试', 'Paste the API key again to test while editing, or save first and test from the model list'),
        });
      } else {
        const res = await testModelAdhoc(buildPayload());
        setTestResult(res);
      }
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!label.trim()) return setError(tr('请填写名称', 'Enter a name'));
    if (!model.trim()) return setError(tr('请填写 Model ID', 'Enter a Model ID'));
    if (protocol === 'openai' && !baseUrl.trim())
      return setError(tr('OpenAI 兼容协议必须填写 Base URL', 'A Base URL is required for the OpenAI-compatible protocol'));
    const proxyErr = validateProxyLocal();
    if (proxyErr) return setError(proxyErr);
    setSaving(true);
    try {
      let saved: ModelConfig;
      if (mode === 'create') {
        saved = await createModel(buildPayload());
      } else {
        const payload: Record<string, string> = {
          label: label.trim(),
          protocol,
          base_url: baseUrl.trim(),
          model: model.trim(),
          proxy: serializeProxy(proxyMode, proxyUrl),
        };
        if (apiKey.trim()) payload.api_key = apiKey.trim();
        saved = await updateModel(initial!.id, payload as never);
      }
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/80 overflow-hidden"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-gradient-to-r from-indigo-500/10 via-transparent to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-400/30 flex items-center justify-center">
              <Server className="w-4 h-4 text-indigo-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                {mode === 'create' ? tr('添加新模型', 'Add Model') : tr('编辑模型', 'Edit Model')}
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {tr('支持任意 OpenAI 兼容或 Google Gemini 协议服务', 'Supports any OpenAI-compatible or Google Gemini service')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-slate-100 transition-colors"
            title={tr('关闭（Esc）', 'Close (Esc)')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 正文 */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto scrollbar-hide">
          {/* 协议选择 —— 大卡片风格 */}
          <Section label={tr('协议', 'Protocol')}>
            <div className="grid grid-cols-2 gap-2.5">
              <ProtocolCard
                active={protocol === 'openai'}
                onClick={() => setProtocol('openai')}
                icon={<Zap className="w-4 h-4" />}
                title={tr('OpenAI 兼容', 'OpenAI Compatible')}
                subtitle={tr('Chat Completions · 覆盖大多数云端和本地服务', 'Chat Completions · most cloud and local services')}
              />
              <ProtocolCard
                active={protocol === 'gemini'}
                onClick={() => setProtocol('gemini')}
                icon={<Cloud className="w-4 h-4" />}
                title="Google Gemini"
                subtitle={tr('generateContent · Google 官方协议', 'generateContent · official Google protocol')}
              />
            </div>
          </Section>

          {/* 预设 */}
          {protocol === 'openai' && (
            <Section
              label={tr('常用端点预设', 'Endpoint Presets')}
              hint={tr('点击可填入推荐的 Base URL 和示例模型，随后可按账户情况修改。', 'Click to fill a recommended Base URL and example model, then adjust it for your account.')}
            >
              <div className="space-y-3">
                {OPENAI_PRESET_GROUPS.map((g) => (
                  <div key={g.title}>
                    <div className="flex items-baseline gap-2 mb-1.5 px-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {presetText(g.title, language)}
                      </span>
                      {g.subtitle && (
                        <span className="text-[10px] text-slate-600 truncate">{presetText(g.subtitle, language)}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.items.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          title={presetText(p.hint, language)}
                          onClick={() => applyPreset(p)}
                          className="text-[11px] px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10 hover:border-indigo-400/40 hover:text-white transition-colors"
                        >
                          {presetText(p.label, language)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 名称 */}
          <Section label={tr('名称', 'Name')} hint={tr('用于在选择器中显示', 'Displayed in the model selector')}>
            <Field>
              <Cpu className="w-3.5 h-3.5 text-slate-500" />
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={tr('例如：我的 DeepSeek、工作用 GPT-4o', 'For example: My DeepSeek or Work GPT-4o')}
                className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-600 outline-none"
              />
            </Field>
          </Section>

          {/* Base URL */}
          <Section
            label="Base URL"
            hint={
              protocol === 'gemini'
                ? tr('可留空以使用 Google 官方地址', 'Leave blank to use the official Google endpoint')
                : tr('OpenAI 兼容端点通常以 /v1 结尾', 'OpenAI-compatible endpoints usually end in /v1')
            }
          >
            <Field mono>
              <LinkIcon className="w-3.5 h-3.5 text-slate-500" />
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={
                  protocol === 'openai'
                    ? 'https://api.example.com/v1'
                    : 'https://generativelanguage.googleapis.com/v1beta'
                }
                className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-600 outline-none font-mono"
              />
            </Field>
          </Section>

          {/* Model */}
          <Section label="Model ID" hint={tr('平台控制台中的模型标识符', 'Model identifier from the provider dashboard')}>
            <Field mono>
              <Server className="w-3.5 h-3.5 text-slate-500" />
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={
                  protocol === 'openai'
                    ? 'gpt-4o-mini / deepseek-chat / qwen-plus …'
                    : 'gemini-2.5-flash'
                }
                className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-600 outline-none font-mono"
              />
            </Field>
          </Section>

          {/* API Key */}
          <Section
            label="API Key"
            hint={
              mode === 'edit' && initial?.has_api_key
                ? tr(`已保存：${initial.api_key_mask}（留空即保留）`, `Saved: ${initial.api_key_mask} (leave blank to retain it)`)
                : tr('仅保存在本地后端 data/custom_models.json，不会上传', 'Stored only in the local backend at data/custom_models.json; never uploaded elsewhere')
            }
          >
            <Field mono>
              <Key className="w-3.5 h-3.5 text-slate-500" />
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-... / AIza..."
                autoComplete="off"
                className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-600 outline-none font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-200 transition-colors"
                title={showKey ? tr('隐藏', 'Hide') : tr('显示', 'Show')}
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </Field>
          </Section>

          {/* 网络模式 */}
          <Section
            label={tr('网络模式', 'Network Mode')}
            hint={tr('为需要 VPN 的服务选择合适的连接方式', 'Choose the appropriate connection mode for services that require a VPN')}
          >
            <div className="grid grid-cols-3 gap-2">
              <ProxyCard
                active={proxyMode === 'auto'}
                onClick={() => setProxyMode('auto')}
                icon={<Wifi className="w-3.5 h-3.5" />}
                title={tr('自动', 'Automatic')}
                subtitle={tr('遵从系统代理，也适用于 TUN/虚拟网卡', 'Use system proxy; also works with TUN adapters')}
              />
              <ProxyCard
                active={proxyMode === 'direct'}
                onClick={() => setProxyMode('direct')}
                icon={<ShieldOff className="w-3.5 h-3.5" />}
                title={tr('直连', 'Direct')}
                subtitle={tr('绕过系统代理，交由 TUN/VPN 处理', 'Bypass system proxy and rely on TUN/VPN')}
              />
              <ProxyCard
                active={proxyMode === 'custom'}
                onClick={() => setProxyMode('custom')}
                icon={<Globe className="w-3.5 h-3.5" />}
                title={tr('自定义', 'Custom')}
                subtitle={tr('明确指定代理地址', 'Specify a proxy URL')}
              />
            </div>
            {proxyMode === 'custom' && (
              <div className="mt-2">
                <Field mono>
                  <Globe className="w-3.5 h-3.5 text-slate-500" />
                  <input
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.target.value)}
                    placeholder="http://127.0.0.1:7890 / socks5://127.0.0.1:1080"
                    className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-600 outline-none font-mono"
                  />
                </Field>
                <p className="mt-1.5 text-[10px] text-slate-500 leading-relaxed">
                  {tr('常见示例：Clash Mixed 端口通常为 ', 'Common examples: Clash Mixed usually uses ')}
                  <code className="font-mono text-slate-400">http://127.0.0.1:7890</code>；
                  {tr('V2rayN 通常为 ', 'V2rayN usually uses ')}<code className="font-mono text-slate-400">http://127.0.0.1:10809</code>。
                </p>
              </div>
            )}
            {proxyMode === 'auto' && (
              <p className="mt-1.5 text-[10px] text-slate-500 leading-relaxed">
                {tr('httpx 将读取 ', 'httpx reads the ')}<code className="font-mono text-slate-400">HTTPS_PROXY</code> /
                {' '}<code className="font-mono text-slate-400">HTTP_PROXY</code>{tr(' 环境变量。如果只启用了 Windows 系统代理，请选择“自定义”，或在 ', ' environment variables. If only the Windows system proxy is enabled, choose Custom or set both variables in ')}
                <code className="font-mono text-slate-400">.env</code>。
              </p>
            )}
            {proxyMode === 'direct' && (
              <p className="mt-1.5 text-[10px] text-slate-500 leading-relaxed">
                {tr('不使用 HTTP 代理，直接连接 Base URL。适合 Clash TUN 或 WireGuard、Tailscale 等网卡级 VPN。', 'Connect directly to the Base URL without an HTTP proxy. Best for Clash TUN or adapter-level VPNs such as WireGuard and Tailscale.')}
              </p>
            )}
          </Section>

          {/* 测试结果 / 错误 */}
          {testResult && (
            <div
              className={`flex items-start gap-2 text-xs px-3 py-2.5 rounded-xl border ${
                testResult.ok
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              <span className="font-bold">{testResult.ok ? '✓' : '✗'}</span>
              <div className="flex-1 min-w-0">
                <div className="break-all">{testResult.message}</div>
                {testResult.proxy_mode && (
                  <div className="mt-0.5 text-[10px] opacity-70 font-mono truncate">
                    {tr('网络：', 'Network: ')}{testResult.proxy_mode}
                  </div>
                )}
              </div>
              {testResult.ok && testResult.sample && (
                <span className="text-[10px] text-emerald-300/60 font-mono truncate max-w-[100px]">
                  {testResult.sample}
                </span>
              )}
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 text-xs px-3 py-2.5 rounded-xl border bg-rose-500/10 border-rose-500/30 text-rose-200">
              <span className="font-bold">!</span>
              <span className="flex-1">{error}</span>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-black/30">
          <button
            onClick={handleTest}
            disabled={testing}
            className="text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10 hover:border-white/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {tr('测试连接', 'Test Connection')}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-xs px-3 py-2 rounded-xl text-slate-300 hover:bg-white/5 transition-colors"
            >
              {tr('取消', 'Cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs font-medium px-4 py-2 rounded-xl
                         bg-gradient-to-br from-indigo-600 to-indigo-500
                         hover:from-indigo-500 hover:to-indigo-400
                         text-white shadow-lg shadow-indigo-600/20
                         transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
                         flex items-center gap-1.5"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              {mode === 'create' ? tr('创建并启用', 'Create and Enable') : tr('保存修改', 'Save Changes')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 子组件                                                              */
/* ------------------------------------------------------------------ */

function Section(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <label className="text-[11px] font-semibold text-slate-200 tracking-wide">
          {props.label}
        </label>
        {props.hint && (
          <span className="text-[10px] text-slate-500 truncate">{props.hint}</span>
        )}
      </div>
      {props.children}
    </div>
  );
}

function Field(props: { children: React.ReactNode; mono?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.03]
                  focus-within:border-indigo-400/50 focus-within:ring-2 focus-within:ring-indigo-500/20
                  transition-all ${props.mono ? 'font-mono' : ''}`}
    >
      {props.children}
    </div>
  );
}

function ProtocolCard(props: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`text-left px-3 py-3 rounded-xl border transition-all
                  ${
                    props.active
                      ? 'bg-indigo-500/15 border-indigo-400/50 ring-2 ring-indigo-500/20 text-white shadow-lg shadow-indigo-600/10'
                      : 'bg-white/[0.03] border-white/10 text-slate-200 hover:bg-white/[0.06] hover:border-white/20'
                  }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
            props.active
              ? 'bg-indigo-500/25 border border-indigo-400/40 text-indigo-200'
              : 'bg-white/5 border border-white/10 text-slate-300'
          }`}
        >
          {props.icon}
        </span>
        <span className="text-xs font-semibold">{props.title}</span>
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed">{props.subtitle}</p>
    </button>
  );
}

function ProxyCard(props: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`text-left px-2.5 py-2 rounded-xl border transition-all
                  ${
                    props.active
                      ? 'bg-indigo-500/15 border-indigo-400/50 ring-1 ring-indigo-500/20 text-white'
                      : 'bg-white/[0.03] border-white/10 text-slate-200 hover:bg-white/[0.06] hover:border-white/20'
                  }`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span
          className={`${
            props.active ? 'text-indigo-200' : 'text-slate-400'
          }`}
        >
          {props.icon}
        </span>
        <span className="text-[11px] font-semibold">{props.title}</span>
      </div>
      <p className="text-[9.5px] text-slate-500 leading-snug">{props.subtitle}</p>
    </button>
  );
}
