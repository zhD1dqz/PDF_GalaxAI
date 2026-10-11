import { useEffect, useState } from 'react';
import { Database, Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getIndexStatus, reindexAll, type IndexStatus } from '../api/client';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * 索引状态 + 一键重建：
 * - 挂载时查询当前库的 embedding 模型与上次索引模型
 * - 发现不一致时亮起黄色警告条
 * - 点按钮弹出确认 → 跑 reindex
 */
export default function IndexAdmin() {
  const { tr } = useLanguage();
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState<{ success: number; total: number; failed: number } | null>(null);

  const refresh = async () => {
    try {
      const s = await getIndexStatus();
      setStatus(s);
    } catch (e) {
      console.warn('[index] status fetch failed', e);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleReindex = async () => {
    if (running) return;
    const ok = window.confirm(
      tr(
        '将对全库所有文献重新做向量化（更换 embedding 模型后必须执行）。\n\n首次切换到 bge-m3 时会下载约 2.3GB 模型，期间界面可能无响应。\n继续吗？',
        'Re-embed every paper in the library. This is required after changing the embedding model.\n\nThe first switch to bge-m3 downloads about 2.3GB and the interface may pause.\nContinue?',
      ),
    );
    if (!ok) return;
    setRunning(true);
    setError('');
    setLastResult(null);
    try {
      const res = await reindexAll();
      setLastResult({ success: res.success, total: res.total, failed: res.failed });
      await refresh();
    } catch (e: any) {
      setError(e?.message || tr('重建索引失败', 'Failed to rebuild the index'));
    } finally {
      setRunning(false);
    }
  };

  if (!status) return null;

  const needs = status.needs_reindex;
  const emptyDb = status.total_papers === 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border transition-all
          ${needs
            ? 'bg-amber-500/15 text-amber-200 border-amber-400/40 hover:bg-amber-500/25'
            : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}
        title={
          needs
            ? tr(
              `当前向量来自 ${status.last_indexed_model}，当前模型是 ${status.current_model}，建议重建索引`,
              `Vectors use ${status.last_indexed_model}, but the current model is ${status.current_model}. Rebuild recommended.`,
            )
            : tr(`向量模型：${status.current_model}`, `Embedding model: ${status.current_model}`)
        }
      >
        {needs ? <AlertTriangle className="w-3 h-3" /> : <Database className="w-3 h-3" />}
        <span className="font-mono truncate max-w-[90px]">
          {status.current_model.split('/').pop() || status.current_model}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[998]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 rounded-xl bg-slate-900/95 border border-white/10 shadow-2xl backdrop-blur p-3 z-[999]">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-semibold">{tr('向量索引', 'Vector Index')}</span>
            </div>

            <div className="text-[11px] text-slate-400 space-y-1 mb-3">
              <div>
                {tr('当前模型：', 'Current model: ')}
                <span className="text-slate-200 font-mono">{status.current_model}</span>
              </div>
              <div>
                {tr('库内向量来自：', 'Indexed with: ')}
                <span className="text-slate-200 font-mono">
                  {status.last_indexed_model || tr('（尚未索引）', '(not indexed yet)')}
                </span>
              </div>
              <div>
                {tr('文献总数：', 'Total papers: ')}
                <span className="text-slate-200 font-mono">{status.total_papers}</span>
              </div>
            </div>

            {needs && (
              <div className="mb-3 p-2 rounded-md bg-amber-500/10 border border-amber-400/30 text-[11px] text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                <div>
                  {tr(
                    '模型已变更，旧向量与新查询的维度或语义不兼容，RAG 检索将失效，请重新构建。',
                    'The model changed. Existing vectors are incompatible with new queries, so RAG retrieval requires a rebuild.',
                  )}
                </div>
              </div>
            )}

            {!needs && lastResult && (
              <div className="mb-3 p-2 rounded-md bg-emerald-500/10 border border-emerald-400/30 text-[11px] text-emerald-200 flex items-start gap-2">
                <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" />
                <div>
                  {tr('上次重建完成：', 'Last rebuild: ')} {lastResult.success} / {lastResult.total} {tr('成功', 'succeeded')}
                  {lastResult.failed ? tr(`（失败 ${lastResult.failed}）`, ` (${lastResult.failed} failed)`) : ''}
                </div>
              </div>
            )}

            {error && (
              <div className="mb-3 p-2 rounded-md bg-red-500/10 border border-red-400/30 text-[11px] text-red-200">
                {error}
              </div>
            )}

            <button
              onClick={handleReindex}
              disabled={running || emptyDb}
              className="w-full flex items-center justify-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {running ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {tr('重建中（请勿关闭）…', 'Rebuilding (do not close)…')}
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  {emptyDb ? tr('库为空', 'Library is empty') : tr('重建全库向量', 'Rebuild all vectors')}
                </>
              )}
            </button>

            <div className="mt-2 text-[10px] text-slate-500 leading-relaxed">
              {tr('如需更换 embedding 模型，请在 ', 'To change the embedding model, set ')}
              <code className="text-amber-300">SCHOLAR_ST_MODEL</code>
              {tr(' 写入 ', ' in ')}<code className="text-amber-300">backend/.env</code>
              {tr('，重启后端后再重新构建。', ', restart the backend, then rebuild.')}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
