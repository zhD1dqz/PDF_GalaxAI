import { useMemo } from 'react';
import type { Paper } from '../types/scholar';
import type { ProjectionSnapshot } from '../rendering/GalaxyRenderer';
import type { GalaxyView, SemanticCluster } from '../rendering/galaxyModel';
import { placeLabels, type LabelAnchor, type Rect } from '../rendering/labelLayout';

type Props = {
  papers: Paper[]; clusters: SemanticCluster[]; snapshot: ProjectionSnapshot | null;
  view: GalaxyView; compact: boolean; hidden: boolean; highlightedIds: string[]; hoveredId: string | null;
  reserved: Rect[]; clusterTitle: (cluster: SemanticCluster) => string;
  onSelect: (paper: Paper, screenPos: { x: number; y: number }) => void;
  onCluster: (cluster: SemanticCluster) => void; onHover: (id: string | null) => void;
  onRequestAddToChat?: (paper: Paper) => void;
};

export default function GalaxyLabels(props: Props) {
  const { snapshot, view } = props;
  const paperMap = useMemo(() => new Map(props.papers.map(p => [p.id,p])),[props.papers]);
  const highlights = new Set(props.highlightedIds);
  const selectedId = view.level === 'paper' ? view.paperId : undefined;
  const placements = useMemo(() => {
    if (!snapshot) return [];
    const anchors: LabelAnchor[] = snapshot.points.flatMap(point => {
      const paper = paperMap.get(point.id);
      if (!paper) return [];
      const active = point.id === selectedId || props.highlightedIds.includes(point.id);
      if (props.compact && !active && point.id !== props.hoveredId && (view.level === 'overview' || paper.cluster !== view.clusterId)) return [];
      const text = paper.filename || paper.displayTitle || paper.title;
      const textWidth = [...text].reduce((sum, char) => sum + (char.charCodeAt(0)>255 ? 10 : 5.7),0)+18;
      return [{ ...point, width: Math.min(active ? 240 : 170,Math.max(60,textWidth)), height: 24,
        priority: point.id === selectedId ? 100 : active ? 90 : 20 }];
    });
    const planets = snapshot.points.map(p => ({ x:p.x-p.radius-4,y:p.y-p.radius-4,width:p.radius*2+8,height:p.radius*2+8 }));
    const badges = view.level === 'overview' ? snapshot.clusters.map(p => ({x:p.x-95,y:p.y-16,width:190,height:32})) : [];
    return placeLabels(anchors,snapshot.width,snapshot.height,[...props.reserved,...planets,...badges],props.compact);
  },[snapshot,paperMap,selectedId,props.hoveredId,props.highlightedIds,props.compact,props.reserved,view]);
  if (!snapshot || props.hidden) return null;
  return <>
    <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      {placements.map(label => {
        const paper = paperMap.get(label.id)!;
        const x = Math.max(label.left,Math.min(label.x,label.left+label.width));
        const y = Math.max(label.top,Math.min(label.y,label.top+label.height));
        return <line key={label.id} x1={label.x} y1={label.y} x2={x} y2={y}
          stroke={paper.color} strokeWidth="0.65" opacity={label.priority>=90 ? 0.52 : 0.22} />;
      })}
    </svg>
    {view.level === 'overview' && snapshot.clusters.map(point => {
      const cluster = props.clusters.find(c => String(c.id) === point.id);
      if (!cluster) return null;
      return <button key={`topic-${cluster.id}`} type="button" className="galaxy-topic-label"
        style={{left:point.x,top:point.y,'--topic-color':cluster.color} as React.CSSProperties}
        onClick={() => props.onCluster(cluster)} title={props.clusterTitle(cluster)}>
        <span className="galaxy-topic-dot" />
        <span className="truncate">{props.clusterTitle(cluster)}</span>
        <span className="font-mono text-[10px] opacity-45">{String(cluster.paperCount).padStart(2,'0')}</span>
      </button>;
    })}
    {placements.map(label => {
      const paper = paperMap.get(label.id)!;
      const active = label.priority>=90 || props.hoveredId===label.id;
      return <button key={label.id} type="button" className={`galaxy-file-label ${active ? 'is-active' : ''} ${highlights.has(label.id) ? 'is-source' : ''}`}
        style={{left:label.left,top:label.top,width:label.width,'--topic-color':paper.color} as React.CSSProperties}
        title={paper.filename || paper.title}
        onMouseEnter={() => props.onHover(paper.id)} onMouseLeave={() => props.onHover(null)}
        onFocus={() => props.onHover(paper.id)} onBlur={() => props.onHover(null)}
        onClick={event => {
          if (event.ctrlKey || event.metaKey || event.shiftKey) { props.onRequestAddToChat?.(paper); return; }
          const rect = event.currentTarget.getBoundingClientRect();
          props.onSelect(paper,{x:rect.left+rect.width/2,y:rect.top+rect.height/2});
        }}
        onContextMenu={event => { event.preventDefault(); props.onRequestAddToChat?.(paper); }}>
        <span className="galaxy-file-dot" />
        <span className="truncate">{paper.filename || paper.displayTitle || paper.title}</span>
      </button>;
    })}
  </>;
}
