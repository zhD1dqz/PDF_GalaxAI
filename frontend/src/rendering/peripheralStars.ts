import { stableUnit } from './galaxyModel';

/** Unit-space halo: never seed decorative particles in a nebula's core. */
export function createPeripheralStars(clusterId: number, paperCount: number, highQuality: boolean) {
  const count = Math.min(highQuality ? 2400 : 1200, Math.max(highQuality ? 180 : 100, paperCount * (highQuality ? 76 : 42)));
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count), speeds = new Float32Array(count), sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const unit = (salt: number) => stableUnit(`${clusterId}:orbit:${i}`, salt);
    const angle = unit(1) * Math.PI * 2;
    const radius = 1.02 + Math.pow(unit(2), 0.72) * 0.53;
    positions.set([Math.cos(angle) * radius, Math.sin(angle) * radius, (unit(3) - 0.5) * 0.38], i * 3);
    phases[i] = unit(4) * Math.PI * 2;
    speeds[i] = (0.065 + unit(5) * 0.065) * (clusterId % 2 === 0 ? 1 : -1);
    sizes[i] = 0.9 + unit(6) * 1.25;
  }
  return { positions, phases, speeds, sizes };
}
