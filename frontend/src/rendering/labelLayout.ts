export type LabelAnchor = { id: string; x: number; y: number; width: number; height: number; priority: number; radius: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type PlacedLabel = LabelAnchor & { left: number; top: number };
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** Deterministic screen-space placement. Full mode retains every on-screen filename. */
export function placeLabels(anchors: LabelAnchor[], width: number, height: number, reserved: Rect[] = [], compact = false): PlacedLabel[] {
  const occupied = [...reserved];
  const result: PlacedLabel[] = [];
  const sorted = [...anchors].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  for (const anchor of sorted) {
    let best: Rect | undefined, bestScore = Infinity;
    const w = Math.min(anchor.width, Math.max(20, width - 24));
    // Multiple rings allow dense imported libraries to use nearby free space.
    for (let ring = 0; ring < 7; ring++) {
      const gap = anchor.radius + 12 + ring * 22;
      const positions = [
        [anchor.x - w / 2, anchor.y - gap - anchor.height],
        [anchor.x + gap, anchor.y - anchor.height / 2],
        [anchor.x - gap - w, anchor.y - anchor.height / 2],
        [anchor.x - w / 2, anchor.y + gap],
        [anchor.x + gap * 0.7, anchor.y - gap - anchor.height],
        [anchor.x - gap * 0.7 - w, anchor.y + gap],
      ];
      for (const [x, y] of positions) {
        const rect = { x: Math.max(12, Math.min(x, width - w - 12)), y: Math.max(12, Math.min(y, height - anchor.height - 12)), width: w, height: anchor.height };
        const collisions = occupied.reduce((sum, other) => sum + overlap(rect, other), 0);
        const distance = Math.hypot(rect.x + w / 2 - anchor.x, rect.y + anchor.height / 2 - anchor.y);
        const score = collisions * 1000 + distance + ring * 3;
        if (score < bestScore) { bestScore = score; best = rect; }
      }
    }
    if (!best || (compact && bestScore > 12000 && anchor.priority < 90)) continue;
    result.push({ ...anchor, width: w, left: best.x, top: best.y });
    occupied.push({ x: best.x - 4, y: best.y - 3, width: w + 8, height: anchor.height + 6 });
  }
  return result;
}
