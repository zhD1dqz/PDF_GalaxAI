import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Compass, Eye, EyeOff, Gauge, MessageSquare, Search, X } from 'lucide-react';
import { GalaxyRenderer, type ProjectionSnapshot } from '../rendering/GalaxyRenderer';
import { buildSemanticClusters, type GalaxyView, type QueryVisual, type SemanticCluster } from '../rendering/galaxyModel';
import { useLanguage } from '../i18n/LanguageContext';
import type { GraphicsQuality } from '../rendering/SemanticNebula';
import type { Edge, Paper } from '../types/scholar';
import GalaxyLabels from './GalaxyLabels';
import { backendIsConnected } from '../api/client';

interface Props {
  papers:Paper[]; edges:Edge[];
  onSelect:(paper:Paper,screenPos:{x:number;y:number})=>void;
  onRequestAddToChat?:(paper:Paper)=>void;
  highlights?:string[]; hideLabels?:boolean;
  searchText:string; setSearchText:(text:string)=>void; results:Paper[]; onResultClick:(paper:Paper)=>void;
  view:GalaxyView; onViewChange:(view:GalaxyView)=>void; queryVisual:QueryVisual;
  previewCitationId:string|null; onCitationSelect:(paperId:string)=>void; onClearSources:()=>void;
  onNavigationSettled:(paperId?:string,screenPos?:{x:number;y:number})=>void; onNavigationInterrupted:()=>void;
  chatCollapsed:boolean; onToggleChat:()=>void;
  htmlPortalTargetRef:React.RefObject<HTMLDivElement>;
}

const TOPIC_NAMES:Record<string,[string,string]> = {
  'Computer Graphics':['计算机图形学','Computer Graphics'],
  'Information Retrieval':['信息检索','Information Retrieval'],
  'Multimodal Learning':['多模态学习','Multimodal Learning'],
  'Human–Computer Interaction':['人机交互','Human–Computer Interaction'],
  '计算机图形学':['计算机图形学','Computer Graphics'],
  '信息检索':['信息检索','Information Retrieval'],
  '多模态学习':['多模态学习','Multimodal Learning'],
  '人机交互':['人机交互','Human–Computer Interaction'],
};

export default function GalaxyArea(props:Props) {
  const { tr }=useLanguage();
  const [quality,setQuality]=useState<GraphicsQuality>(() => {
    try { return localStorage.getItem('scholar:graphics-quality')==='balanced' ? 'balanced' : 'research'; } catch { return 'research'; }
  });
  const [compact,setCompact]=useState(() => {
    try { return localStorage.getItem('scholar:label-mode')==='compact'; } catch { return false; }
  });
  const [snapshot,setSnapshot]=useState<ProjectionSnapshot|null>(null);
  const [hoveredId,setHoveredId]=useState<string|null>(null);
  const [backendState,setBackendState]=useState<'checking'|'online'|'offline'|'demo'>('checking');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('graphicsDemo')==='1') { setBackendState('demo'); return; }
    let cancelled=false;
    const check=async () => {
      const connected=await backendIsConnected();
      if (!cancelled) setBackendState(connected ? 'online' : 'offline');
    };
    void check();
    const timer=window.setInterval(check,15000);
    return () => { cancelled=true; window.clearInterval(timer); };
  },[]);
  const reportProjection=useCallback((next:ProjectionSnapshot) => setSnapshot(next),[]);
  const clusters=useMemo(() => buildSemanticClusters(props.papers),[props.papers]);
  const clusterTitle=(cluster:SemanticCluster) => {
    const translated=TOPIC_NAMES[cluster.title];
    return translated ? tr(...translated) : cluster.title || tr(`主题 ${cluster.id+1}`,`Topic ${cluster.id+1}`);
  };
  const clusterId=props.view.level!=='overview' ? props.view.clusterId : undefined;
  const paperId=props.view.level==='paper' ? props.view.paperId : undefined;
  const activeCluster=clusters.find(c => c.id===clusterId);
  const activePaper=props.papers.find(p => p.id===paperId);
  const sourceHighlights=useMemo(() => [...new Set([...(props.highlights||[]),...(props.previewCitationId ? [props.previewCitationId] : [])])],[props.highlights,props.previewCitationId]);
  const combinedHighlights=useMemo(() => [...new Set([...sourceHighlights,...(hoveredId ? [hoveredId] : [])])],[sourceHighlights,hoveredId]);
  const citedPapers=props.queryVisual.paperIds.map(id => props.papers.find(p => p.id===id)).filter((p):p is Paper => !!p);
  const hasQueryStatus=props.queryVisual.phase!=='idle';
  const reserved=useMemo(() => snapshot ? [
    {x:0,y:0,width:snapshot.width,height:130},
    {x:0,y:snapshot.height-(hasQueryStatus ? 200 : 104),width:snapshot.width,height:hasQueryStatus ? 200 : 104},
    ...(props.view.level==='paper' ? [{x:Math.max(0,snapshot.width-395),y:155,width:395,height:Math.max(0,snapshot.height-270)}] : []),
  ] : [],[snapshot?.width,snapshot?.height,hasQueryStatus,props.view.level]);
  const changeView=(view:GalaxyView) => { setHoveredId(null); props.onViewChange(view); };
  const switchQuality=() => setQuality(current => {
    const next=current==='research' ? 'balanced' : 'research';
    try { localStorage.setItem('scholar:graphics-quality',next); } catch {}
    return next;
  });
  const switchLabels=() => setCompact(current => {
    try { localStorage.setItem('scholar:label-mode',current ? 'all' : 'compact'); } catch {}
    return !current;
  });
  return <main className="relative min-w-0 flex-1 overflow-hidden bg-[#02050b]">
    <GalaxyRenderer papers={props.papers} edges={props.edges} clusters={clusters} view={props.view}
      queryVisual={props.queryVisual} onSelect={props.onSelect} onRequestAddToChat={props.onRequestAddToChat}
      highlights={combinedHighlights} hoveredId={hoveredId||props.previewCitationId}
      onHover={setHoveredId} onProjection={reportProjection} graphicsQuality={quality}
      onNavigationSettled={props.onNavigationSettled} onNavigationInterrupted={props.onNavigationInterrupted} />

    <div ref={props.htmlPortalTargetRef} className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
      <GalaxyLabels papers={props.papers} clusters={clusters} snapshot={snapshot} view={props.view}
        compact={compact} hidden={!!props.hideLabels} highlightedIds={sourceHighlights} hoveredId={hoveredId}
        reserved={reserved} clusterTitle={clusterTitle} onSelect={props.onSelect} onHover={setHoveredId}
        onCluster={cluster => changeView({level:'cluster',clusterId:cluster.id})} onRequestAddToChat={props.onRequestAddToChat} />
    </div>

    <header className="galaxy-header absolute inset-x-0 top-0 z-30 px-6 pt-5 pb-4 pointer-events-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] tracking-[0.32em] text-slate-500 font-mono">GALAXAI / KNOWLEDGE OBSERVATORY</div>
          <h1 className="mt-1.5 text-lg font-light tracking-[0.10em] text-slate-100">{tr('深空知识地图','Deep-space Knowledge Atlas')}</h1>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={switchQuality} className="galaxy-tool" title={tr('切换体积采样与渲染分辨率','Switch volume samples and render resolution')}>
            <Gauge className="h-3.5 w-3.5" /><span className="hidden xl:inline">{quality==='research' ? tr('高画质','High') : tr('低画质','Low')}</span>
            <span className="xl:hidden text-[10px]">{quality==='research' ? tr('高','H') : tr('低','L')}</span>
          </button>
          <button type="button" onClick={switchLabels} className="galaxy-tool" title={compact ? tr('显示全部文件名','Show all filenames') : tr('切换简洁浏览：远景显示主题，近景展开文件名','Compact view: topics at a distance, filenames up close')} aria-pressed={!compact}>
            {compact ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span className="hidden xl:inline">{compact ? tr('简洁浏览','Compact') : tr('全部文件名','Filenames')}</span>
          </button>
          <button type="button" className="galaxy-tool" onClick={props.onToggleChat}
            aria-label={props.chatCollapsed ? tr('展开问答面板','Show Q&A panel') : tr('收起问答面板','Hide Q&A panel')}
            title={props.chatCollapsed ? tr('展开问答面板','Show Q&A panel') : tr('收起问答面板','Hide Q&A panel')}>
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
        <nav className="flex min-w-0 items-center gap-1 text-[11px] text-slate-400" aria-label={tr('星云导航','Galaxy navigation')}>
          <button type="button" className="flex items-center gap-1.5 hover:text-white" onClick={() => changeView({level:'overview'})}>
            <Compass className="h-3.5 w-3.5" />{tr('全景','Overview')}
          </button>
          {activeCluster && <>
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-600" />
            <button type="button" className="max-w-[120px] truncate hover:text-white" onClick={() => changeView({level:'cluster',clusterId:activeCluster.id})}>{clusterTitle(activeCluster)}</button>
          </>}
          {activePaper && <><ChevronRight className="h-3 w-3 shrink-0 text-slate-600" /><span className="max-w-[110px] truncate text-slate-200" title={activePaper.filename}>{activePaper.filename}</span></>}
          {props.view.level!=='overview' && <button type="button" className="ml-2 galaxy-tool !px-2 !py-1"
            onClick={() => changeView(activeCluster && props.view.level==='paper' ? {level:'cluster',clusterId:activeCluster.id} : {level:'overview'})}
            title={tr('返回上一级','Back one level')}><ArrowLeft className="h-3 w-3" /></button>}
        </nav>
        <div className="relative">
          <label className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#060d18]/75 px-3 py-1.5 backdrop-blur-md">
            <Search className="h-3 w-3 text-slate-500" />
            <input value={props.searchText} onChange={e => props.setSearchText(e.target.value)}
              className="w-36 bg-transparent text-[11px] text-slate-200 outline-none placeholder:text-slate-600"
              placeholder={tr('搜索文献…','Find a paper…')} aria-label={tr('搜索文献','Search papers')} />
            {props.searchText && <button type="button" onClick={() => props.setSearchText('')} aria-label={tr('清空搜索','Clear search')}><X className="h-3 w-3 text-slate-500" /></button>}
          </label>
          {props.searchText.trim() && <div className="absolute right-0 top-10 max-h-64 w-72 overflow-y-auto rounded-xl border border-white/10 bg-[#060c17]/95 p-2 shadow-xl backdrop-blur-xl">
            {!props.results.length && <div className="p-3 text-xs text-slate-500">{tr('无匹配项','No matches')}</div>}
            {props.results.map(p => <button key={p.id} type="button" className="w-full rounded-lg p-2 text-left hover:bg-white/5" onClick={() => props.onResultClick(p)}>
              <div className="truncate text-xs text-slate-200">{p.displayTitle||p.title}</div><div className="mt-1 truncate text-[10px] text-slate-500">{p.filename}</div>
            </button>)}
          </div>}
        </div>
      </div>
    </header>

    {!props.papers.length && <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="max-w-sm text-center"><div className="mb-4 text-[10px] font-mono tracking-[0.3em] text-slate-600">AWAITING YOUR CONSTELLATION</div>
        <p className="text-base text-slate-300">{tr('从一篇文献，开始探索','Start exploring with a paper')}</p>
        <p className="mt-2 text-xs leading-6 text-slate-500">{tr('使用左侧上传按钮导入 PDF，主题星云将由文献内容生成。','Upload PDFs using the left toolbar. Topics will emerge from your papers.')}</p>
      </div>
    </div>}

    <footer className="galaxy-footer absolute inset-x-0 bottom-0 z-30 px-6 pb-5 pt-7 pointer-events-none">
      {hasQueryStatus && <div className="mb-4 max-w-2xl rounded-xl border border-white/[0.07] bg-[#050b14]/80 px-3.5 py-3 backdrop-blur-xl pointer-events-auto">
        <div className="flex items-center justify-between gap-2 text-[11px]" role="status" aria-live="polite">
          <span className="flex items-center gap-2 text-slate-300"><span className={`h-1.5 w-1.5 rounded-full ${props.queryVisual.phase==='waiting' ? 'bg-slate-400 animate-pulse' : props.queryVisual.phase==='error' ? 'bg-rose-400' : 'bg-cyan-200'}`} />
            {props.queryVisual.phase==='waiting' ? tr('正在等待回答与来源结果…','Waiting for the answer and sources…')
              : props.queryVisual.phase==='error' ? tr('请求失败，请检查问答面板','Request failed. See the Q&A panel.')
              : citedPapers.length ? tr(`回答引用了 ${citedPapers.length} 篇文献 · 点击定位并打开原文`,`${citedPapers.length} cited papers · click to locate and read`)
              : props.queryVisual.paperIds.length ? tr('引用文献当前不在星云中','Cited papers are not currently in this galaxy')
              : tr('本次回答没有文献引用','No paper citations in this answer')}
          </span>
          {props.queryVisual.phase!=='waiting' && <button type="button" onClick={props.onClearSources} aria-label={tr('清除引用高亮','Clear citation highlights')}><X className="h-3 w-3 text-slate-500" /></button>}
        </div>
        {citedPapers.length>0 && <div className="mt-2 flex max-h-16 flex-wrap gap-1.5 overflow-y-auto">
          {citedPapers.map((p,index) => <button type="button" key={p.id} className="galaxy-source-chip" onClick={() => props.onCitationSelect(p.id)} title={p.filename}
            style={{'--topic-color':p.color} as React.CSSProperties}>
            <span className="font-mono opacity-60">{String(index+1).padStart(2,'0')}</span><span className="max-w-[130px] truncate">{p.filename||p.title}</span>
          </button>)}
        </div>}
      </div>}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 text-[9px] font-mono tracking-[0.22em] text-slate-600">{tr('主题星座','TOPIC CONSTELLATIONS')}</div>
          <div className="flex flex-wrap gap-1.5 pointer-events-auto">
            {clusters.map(cluster => <button type="button" key={cluster.id} className={`galaxy-cluster-chip ${activeCluster?.id===cluster.id ? 'is-active' : ''}`}
              style={{'--topic-color':cluster.color} as React.CSSProperties}
              onClick={() => changeView({level:'cluster',clusterId:cluster.id})} title={clusterTitle(cluster)}>
              <span className="h-1.5 w-1.5 rounded-full" style={{background:cluster.color}} />
              <span className="max-w-[120px] truncate">{clusterTitle(cluster)}</span><span className="font-mono opacity-45">{cluster.paperCount}</span>
            </button>)}
          </div>
        </div>
        <div className="shrink-0 text-right text-[9px] leading-5 text-slate-600">
          <div className={backendState==='online' ? 'text-emerald-400/70' : backendState==='offline' ? 'text-amber-400/80' : 'text-slate-500'}>
            {backendState==='online' ? tr('后端已连接','Backend connected') : backendState==='offline' ? tr('后端未连接','Backend offline')
              : backendState==='demo' ? tr('样例数据演示','Sample data demo') : tr('正在连接后端…','Connecting backend…')}
          </div>
          <div><span className="font-mono text-slate-400">{props.papers.length}</span> {tr('文献','papers')} · <span className="font-mono text-slate-400">{props.edges.length}</span> {tr('关联','links')}</div>
          <div className="hidden 2xl:block">{tr('左键旋转 · 中键平移 · 滚轮缩放','Left: orbit · Middle: pan · Scroll: zoom')}</div>
        </div>
      </div>
    </footer>
  </main>;
}
