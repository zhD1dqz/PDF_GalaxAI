import type { Edge, Paper, QueryResponse } from '../types/scholar';

export type Vec3 = [number, number, number];
export type GalaxyView =
  | { level: 'overview' }
  | { level: 'cluster'; clusterId: number }
  | { level: 'paper'; clusterId: number; paperId: string };
export type QueryVisual = {
  phase: 'idle' | 'waiting' | 'sources' | 'error';
  paperIds: string[];
  sequence: number;
};
export type SemanticCluster = {
  id: number;
  center: Vec3;
  radius: number;
  color: string;
  density: number;
  paperCount: number;
  paperIds: string[];
  title: string;
  angle: number;
  axes: Vec3;
  morphology: number;
};

export const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export const paperRadius = (paper: Paper) => 0.22 + clamp01(paper.confidence) * 0.12;

export function stableUnit(value: string, salt = 0): number {
  let hash = (2166136261 ^ salt) >>> 0;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

/** Geometry follows the data covariance; only the surrounding dust is animated. */
export function buildSemanticClusters(papers: Paper[]): SemanticCluster[] {
  const groups = new Map<number, Paper[]>();
  for (const paper of papers) {
    if (!paper.pos.every(Number.isFinite)) continue;
    const id = Number.isFinite(paper.cluster) ? paper.cluster : 0;
    groups.set(id, [...(groups.get(id) || []), paper]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([id, members]) => {
    const center = [0, 0, 0] as Vec3;
    for (const paper of members) paper.pos.forEach((value, axis) => { center[axis] += value / members.length; });
    let xx = 0, yy = 0, xy = 0, spread = 0;
    for (const paper of members) {
      const [x, y, z] = paper.pos.map((value, axis) => value - center[axis]);
      xx += x * x; yy += y * y; xy += x * y;
      spread = Math.max(spread, Math.hypot(x, y, z));
    }
    const angle = Math.abs(xx - yy) + Math.abs(xy) < 1e-6 ? 0 : Math.atan2(2 * xy, xx - yy) / 2;
    const c = Math.cos(angle), s = Math.sin(angle);
    const extent = [0, 0, 0];
    const titles = new Map<string, number>();
    for (const paper of members) {
      const [x, y, z] = paper.pos.map((value, axis) => value - center[axis]);
      extent[0] = Math.max(extent[0], Math.abs(x * c + y * s));
      extent[1] = Math.max(extent[1], Math.abs(-x * s + y * c));
      extent[2] = Math.max(extent[2], Math.abs(z));
      const title = paper.field || paper.category || paper.keywords?.[0] || '';
      if (title) titles.set(title, (titles.get(title) || 0) + 1);
    }
    const confidence = members.reduce((sum, p) => sum + clamp01(p.confidence), 0) / members.length;
    return {
      id, center, angle, paperIds: members.map(p => p.id), paperCount: members.length,
      title: [...titles].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '',
      radius: Math.max(1.6, spread + 0.9), color: members[0].color || '#60a5fa',
      axes: [Math.max(1.8, extent[0] + 1.35), Math.max(1.2, extent[1] + 0.85), Math.max(1.3, extent[2] + 0.9)] as Vec3,
      density: Math.min(1.3, 0.68 + Math.sqrt(members.length) * 0.12 + confidence * 0.1),
      morphology: (Math.abs(id) % 3),
    };
  });
}

export function cameraDestination(view: GalaxyView, papers: Paper[], clusters: SemanticCluster[], aspect: number, fov = 45) {
  const paper = view.level === 'paper' ? papers.find(p => p.id === view.paperId) : undefined;
  if (paper) {
    const radius = paperRadius(paper);
    // Reserve a little room on the right for the detail card.
    const distance = Math.max(3.2, radius * 12 / Math.min(Math.max(aspect, 0.35), 1));
    const horizontalOffset = distance * Math.tan(fov * Math.PI / 360) * Math.max(0.25, aspect) * 0.44;
    const target: Vec3 = [paper.pos[0] + horizontalOffset, paper.pos[1], paper.pos[2]];
    return { target, position: [target[0], target[1] + distance * 0.055, target[2] + distance] as Vec3, minDistance: 1.3 };
  }
  const cluster = view.level !== 'overview' ? clusters.find(c => c.id === view.clusterId) : undefined;
  const members = (cluster ? papers.filter(p => cluster.paperIds.includes(p.id)) : papers).filter(p => p.pos.every(Number.isFinite));
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of members) p.pos.forEach((v, i) => {
    if (Number.isFinite(v)) { min[i] = Math.min(min[i], v); max[i] = Math.max(max[i], v); }
  });
  if (!members.length) return { target: [0, 0, 0] as Vec3, position: [0, 0, 28] as Vec3, minDistance: 2 };
  const target = min.map((v, i) => (v + max[i]) / 2) as Vec3;
  const tan = Math.tan(fov * Math.PI / 360);
  const padding = cluster ? 1.4 : 2.5;
  const halfW = (max[0] - min[0]) / 2 + padding;
  const halfH = (max[1] - min[1]) / 2 + padding;
  const distance = Math.max(8, halfH / tan, halfW / (tan * Math.max(0.25, aspect))) * 1.16 + (max[2] - min[2]) / 2;
  return { target, position: [target[0], target[1] + distance * 0.035, target[2] + distance] as Vec3, minDistance: 2 };
}

export function edgeEmphasis(edge: Edge, selectedId: string | undefined, citedIds: ReadonlySet<string>, hasFocus: boolean) {
  const weight = clamp01(edge.weight);
  const selected = !!selectedId && (edge.source === selectedId || edge.target === selectedId);
  const cited = citedIds.has(edge.source) && citedIds.has(edge.target);
  return {
    opacity: cited ? 0.66 : selected ? 0.28 + weight * 0.32 : hasFocus ? 0.025 : 0.025 + weight * 0.065,
    width: cited || selected ? 0.9 + weight * 0.7 : 0.45 + weight * 0.4,
    animate: cited,
  };
}

/** Never invent retrieval candidates while the synchronous query is pending. */
export function citationPaperIds(response: Pick<QueryResponse, 'cites' | 'cite_details' | 'answer'>): string[] {
  const explicit = (response.cites || []).map(c => typeof c === 'string' ? c : c.paper_id || '');
  const details = (response.cite_details || []).map(c => c.paper_id);
  const markers = [...(response.answer || '').matchAll(/\[CITE:([^\]]+)\]/g)].map(m => m[1].trim());
  return [...new Set([...explicit, ...details, ...markers].filter(Boolean))];
}
