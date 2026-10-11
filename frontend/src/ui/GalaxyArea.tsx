import React, { useMemo, useState } from 'react';
import { Atom, Gauge, Search } from 'lucide-react';
import { GalaxyRenderer } from '../rendering/GalaxyRenderer';
import { useLanguage } from '../i18n/LanguageContext';
import type { GraphicsQuality } from '../rendering/SemanticNebula';
import type { Edge, Paper } from '../types/scholar';

interface Props {
  papers: Paper[];
  edges: Edge[];
  onSelect: (p: Paper, screenPos: { x: number; y: number }) => void;
  onRequestAddToChat?: (p: Paper) => void;
  highlights?: string[];
  hideLabels?: boolean;
  searchText: string;
  setSearchText: (s: string) => void;
  results: Paper[];
  onResultClick: (p: Paper) => void;
  focusTarget?: Paper | null;
  highlightedSearchPaperId?: string | null;
  htmlPortalTargetRef: React.RefObject<HTMLDivElement>;
}

export default function GalaxyArea({ papers, edges, onSelect, onRequestAddToChat, highlights, hideLabels, searchText, setSearchText, results, onResultClick, focusTarget, highlightedSearchPaperId, htmlPortalTargetRef }: Props) {
  const { language, tr } = useLanguage();
  const combinedHighlights = Array.from(new Set([...(highlights || []), ...(highlightedSearchPaperId ? [highlightedSearchPaperId] : [])]));
  const [graphicsQuality, setGraphicsQuality] = useState<GraphicsQuality>(() => {
    try {
      return localStorage.getItem('scholar:graphics-quality') === 'balanced'
        ? 'balanced'
        : 'research';
    } catch {
      return 'research';
    }
  });
  const clusterCount = useMemo(
    () => new Set(papers.map((paper) => paper.cluster)).size,
    [papers],
  );

  const switchQuality = () => {
    setGraphicsQuality((current) => {
      const next = current === 'research' ? 'balanced' : 'research';
      try {
        localStorage.setItem('scholar:graphics-quality', next);
      } catch {
        // localStorage may be unavailable in private mode.
      }
      return next;
    });
  };

  return (
    <main className="flex-1 relative">
      <div className="absolute top-6 left-6 z-10 flex gap-4">
        <div className="glass px-4 py-2 rounded-full border border-white/10 flex items-center gap-3 relative">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className={`bg-transparent border-none outline-none text-sm ${language === 'en' ? 'w-56' : 'w-48'}`}
            placeholder={tr('在星云中搜索…（按文件名）', 'Search the galaxy… (by filename)')}
          />

          {/* 简单下拉结果 */}
          {searchText.trim().length > 0 && (
            <div className="absolute top-12 left-0 bg-black/80 rounded-md border border-white/10 w-64 max-h-64 overflow-y-auto z-50 p-2">
              {results.length === 0 && <div className="text-xs text-slate-400 p-2">{tr('无匹配项', 'No matches')}</div>}
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onResultClick(r)}
                  className="w-full text-left px-2 py-2 hover:bg-white/5 rounded text-sm"
                >
                  <div className="font-semibold truncate">{r.displayTitle || r.title}</div>
                  <div className="text-[11px] text-slate-400 break-words break-all max-w-full">{r.filename}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="absolute top-6 right-6 z-10 flex flex-col items-end gap-2 pointer-events-none">
        <button
          type="button"
          onClick={switchQuality}
          className="pointer-events-auto glass px-3 py-2 rounded-xl border border-cyan-300/20 hover:border-cyan-300/40 hover:bg-cyan-400/10 transition-colors flex items-center gap-2 text-left"
          title={tr('切换体积采样步数、粒子数量与渲染分辨率', 'Switch volume samples, particle count, and render resolution')}
        >
          {graphicsQuality === 'research'
            ? <Atom className="w-4 h-4 text-cyan-300" />
            : <Gauge className="w-4 h-4 text-emerald-300" />}
          <span>
            <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">{tr('图形模式', 'Graphics Mode')}</span>
            <span className="block text-xs font-semibold text-slate-100">
              {graphicsQuality === 'research'
                ? tr('高画质 · 46 次采样', 'High Quality · 46 Samples')
                : tr('低画质 · 28 次采样', 'Low Quality · 28 Samples')}
            </span>
          </span>
        </button>
      </div>

      {papers.length > 0 && (
        <div className="absolute left-6 bottom-6 z-10 pointer-events-none glass rounded-xl border border-white/10 px-3 py-2.5 max-w-[330px]">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-200">
            <span className="w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]" />
            {tr('语义驱动 WebGL 星云', 'Semantic WebGL Galaxy')}
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-3 text-[10px] text-slate-400">
            <span><b className="text-slate-200">{papers.length}</b> {tr('文献星体', 'papers')}</span>
            <span><b className="text-slate-200">{clusterCount}</b> {tr('体积星云', 'nebulae')}</span>
            <span><b className="text-slate-200">{edges.length}</b> {tr('语义关联', 'semantic links')}</span>
          </div>
          <div className="mt-1.5 text-[9px] leading-relaxed text-slate-500">
            {tr(
              '颜色=主题聚类 · 尺度=置信度 · 空间=UMAP/PCA · 云密度=文献数量',
              'Color=topic · Scale=confidence · Space=UMAP/PCA · Density=paper count',
            )}
            <span className="block">
              {tr('月面细节=主题、关键词与文献指纹', 'Lunar detail=topic, keywords, and paper fingerprint')}
            </span>
          </div>
        </div>
      )}

      {/* Html 节点必须与 WebGL 画布共享同一坐标原点，否则文件名会与星体错位。 */}
      <div
        ref={htmlPortalTargetRef}
        id="html-portal-target"
        className="absolute inset-0 pointer-events-none z-20 overflow-hidden"
        aria-hidden="true"
      />

      <GalaxyRenderer
        papers={papers}
        edges={edges}
        onSelect={(p, screenPos) => onSelect(p, screenPos)}
        onRequestAddToChat={onRequestAddToChat}
        highlights={combinedHighlights}
        hideLabels={!!hideLabels}
        focusTarget={focusTarget}
        htmlPortalTargetRef={htmlPortalTargetRef}
        graphicsQuality={graphicsQuality}
      />
    </main>
  );
}
