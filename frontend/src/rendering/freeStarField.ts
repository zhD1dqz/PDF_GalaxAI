import { stableUnit } from './galaxyModel';

export const FREE_STAR_DRIFT_RATE = 0.08;
export const FREE_STAR_DRIFT_AMPLITUDE = 10;

/** Independent deep-space population: no paper, cluster, orbit-center or attraction input. */
export function createFreeStarField(highQuality: boolean) {
  const count = highQuality ? 9000 : 5200;
  const positions = new Float32Array(count * 3), velocities = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  const phases = new Float32Array(count), sizes = new Float32Array(count), brightness = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const unit = (salt: number) => stableUnit(`free-star:${i}`, salt);
    const theta = unit(1) * Math.PI * 2;
    const z = unit(2) * 2 - 1;
    const radialXY = Math.sqrt(Math.max(0, 1 - z * z));
    const radius = 42 + Math.pow(unit(3), 0.65) * 68;
    positions.set([Math.cos(theta) * radialXY * radius, Math.sin(theta) * radialXY * radius, z * radius], i * 3);
    const direction = unit(4) * Math.PI * 2;
    const speed = 0.16 + unit(5) * 0.12;
    velocities.set([Math.cos(direction) * speed, Math.sin(direction) * speed, (unit(6) - 0.5) * speed * 0.7], i * 3);
    phases[i] = unit(7) * Math.PI * 2;
    const prominent = unit(8) > 0.96;
    sizes[i] = prominent ? 4.8 + unit(9) * 1.6 : 1.3 + Math.pow(unit(9), 1.7) * 2.1;
    brightness[i] = prominent ? 1.55 + unit(10) * 0.4 : 0.82 + unit(10) * 0.45;
    // Mostly white/cool starlight, with a few warm stars; not semantic-topic colors.
    const temperature = unit(11);
    const color = temperature < 0.13 ? [1.0, 0.86, 0.70] : temperature > 0.68 ? [0.72, 0.86, 1.0] : [0.91, 0.95, 1.0];
    colors.set(color, i * 3);
  }
  return { positions, velocities, colors, phases, sizes, brightness };
}

/** CPU mirror of the GPU drift for deterministic, browser-independent tests. */
export function freeStarOffset(time: number, phase: number, velocity: readonly number[]) {
  const drift = (Math.sin(time * FREE_STAR_DRIFT_RATE + phase) - Math.sin(phase)) * FREE_STAR_DRIFT_AMPLITUDE;
  return velocity.map(component => component * drift);
}
