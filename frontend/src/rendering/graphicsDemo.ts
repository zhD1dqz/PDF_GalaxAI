import type { GraphResponse, Paper } from '../types/scholar';

const CLUSTERS = [
  { center: [-5.4, 2.2, -1.2] as const, color: '#38bdf8', field: 'Multimodal Learning' },
  { center: [4.8, 2.8, 0.7] as const, color: '#a78bfa', field: 'Computer Graphics' },
  { center: [-3.2, -4.1, 1.8] as const, color: '#10b981', field: 'Information Retrieval' },
  { center: [5.1, -3.6, -1.5] as const, color: '#fb7185', field: 'Human–Computer Interaction' },
];

function seededUnit(seed: number): number {
  const x = Math.sin(seed * 91.731 + 17.113) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Deterministic portfolio dataset. It is only used when the page URL contains
 * `?graphicsDemo=1`; the normal PDF/backend data path is unchanged.
 */
export function createGraphicsDemoGraph(): GraphResponse {
  const papers: Paper[] = [];
  const edges: GraphResponse['edges'] = [];
  const papersPerCluster = 11;

  CLUSTERS.forEach((cluster, clusterIndex) => {
    for (let i = 0; i < papersPerCluster; i++) {
      const seed = clusterIndex * 1000 + i * 31;
      const angle = (i / papersPerCluster) * Math.PI * 2 + seededUnit(seed) * 0.55;
      const radius = 0.65 + seededUnit(seed + 1) * 2.2;
      const yWave = (seededUnit(seed + 2) - 0.5) * 2.35;
      const id = `graphics-demo-${clusterIndex}-${i}`;
      const confidence = 0.58 + seededUnit(seed + 3) * 0.4;
      const paper: Paper = {
        id,
        title: `${cluster.field}: Semantic Paper ${i + 1}`,
        displayTitle: `${cluster.field} · ${String(i + 1).padStart(2, '0')}`,
        firstSentence: 'A deterministic sample paper used to demonstrate semantic WebGL rendering.',
        abstract: 'Portfolio demonstration data for the real-time semantic nebula renderer.',
        filename: `demo_${clusterIndex}_${i}.pdf`,
        field: cluster.field,
        confidence,
        size: 3 + confidence * 5,
        pos: [
          cluster.center[0] + Math.cos(angle) * radius,
          cluster.center[1] + yWave,
          cluster.center[2] + Math.sin(angle) * radius,
        ],
        color: cluster.color,
        category: cluster.field,
        keywords: [cluster.field, 'WebGL', 'Semantic Visualization'],
        cluster: clusterIndex,
      };
      papers.push(paper);

      if (i > 0) {
        edges.push({
          source: `graphics-demo-${clusterIndex}-${i - 1}`,
          target: id,
          weight: 0.78 + seededUnit(seed + 4) * 0.18,
          type: 'intra',
        });
      }
    }
  });

  // A small number of cross-topic bridges make the global research landscape visible.
  for (let clusterIndex = 0; clusterIndex < CLUSTERS.length; clusterIndex++) {
    const next = (clusterIndex + 1) % CLUSTERS.length;
    edges.push({
      source: `graphics-demo-${clusterIndex}-5`,
      target: `graphics-demo-${next}-5`,
      weight: 0.42,
      type: 'bridge',
    });
  }

  return { papers, edges };
}

