import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

export type SemanticCluster = {
  id: number;
  center: [number, number, number];
  radius: number;
  color: string;
  density: number;
  paperCount: number;
};

export type GraphicsQuality = 'balanced' | 'research';

const VOLUME_VERTEX_SHADER = /* glsl */ `
  varying vec3 vLocalPosition;

  void main() {
    vLocalPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const VOLUME_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vLocalPosition;
  uniform float uTime;
  uniform float uDensity;
  uniform float uSeed;
  uniform float uSteps;
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform vec3 uCameraLocal;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float valueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);
    return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.52;
    mat3 rotation = mat3(
      0.00,  0.80,  0.60,
     -0.80,  0.36, -0.48,
     -0.60, -0.48,  0.64
    );
    for (int octave = 0; octave < 4; octave++) {
      value += valueNoise(p) * amplitude;
      p = rotation * p * 2.03 + 0.17;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    // Render the back faces of the bounding sphere and integrate toward the camera.
    // This is a compact object-space ray marcher: every visible pixel samples a
    // procedural 3D density field instead of reading a flat texture.
    vec3 rayDirection = normalize(uCameraLocal - vLocalPosition);
    vec3 samplePosition = vLocalPosition;
    vec4 accumulated = vec4(0.0);
    float travelStep = 2.05 / max(uSteps, 1.0);

    for (int i = 0; i < 48; i++) {
      if (float(i) >= uSteps) break;
      samplePosition += rayDirection * travelStep;
      float radius = length(samplePosition);
      if (radius > 1.02 && i > 2) break;

      // Let the volume drift with the same slow orbital rhythm as the semantic
      // particles. The two sinusoidal warps keep the cloud alive without making
      // the data positions themselves unstable.
      float flowAngle = uTime * 0.075 + uSeed;
      mat2 flowRotation = mat2(
        cos(flowAngle), -sin(flowAngle),
        sin(flowAngle), cos(flowAngle)
      );
      vec3 flowingPosition = samplePosition;
      flowingPosition.xz = flowRotation * flowingPosition.xz;
      flowingPosition += vec3(
        sin(uTime * 0.16 + samplePosition.y * 2.4 + uSeed),
        cos(uTime * 0.11 + samplePosition.x * 2.0 + uSeed) * 0.65,
        sin(uTime * 0.13 + samplePosition.z * 2.2 + uSeed) * 0.72
      ) * 0.16;
      vec3 flow = vec3(
        sin(uTime * 0.09 + uSeed),
        uTime * 0.065,
        cos(uTime * 0.075 + uSeed)
      );
      float cloud = fbm(flowingPosition * 2.95 + flow + uSeed * 0.31);
      float ridge = 1.0 - abs(cloud * 2.0 - 1.0);
      float radialFalloff = 1.0 - smoothstep(0.08, 1.0, radius);
      float filament = smoothstep(0.48, 0.91, ridge);
      float breathing = 0.82 + sin(uTime * 0.34 + uSeed * 2.0) * 0.08;
      float density = filament * radialFalloff * uDensity * 0.032 * breathing;

      // Keep the cloud below the bloom threshold. It should read as a moving
      // background structure; local node rings now carry the visual emphasis.
      vec3 sampleColor = mix(uColor * 0.16, uAccent * 0.46, cloud);
      sampleColor += uColor * pow(max(0.0, 1.0 - radius), 3.0) * 0.12;
      accumulated.rgb += (1.0 - accumulated.a) * sampleColor * density;
      accumulated.a += (1.0 - accumulated.a) * density;
      if (accumulated.a > 0.52) break;
    }

    float edgeFade = smoothstep(
      0.02,
      0.42,
      abs(dot(normalize(vLocalPosition), rayDirection))
    );
    gl_FragColor = vec4(accumulated.rgb, accumulated.a * edgeFade * 0.42);
  }
`;

const PARTICLE_VERTEX_SHADER = /* glsl */ `
  precision highp float;

  attribute vec3 aCenter;
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aSize;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vEnergy;

  void main() {
    vec3 offset = position - aCenter;
    float radius = length(offset.xz) + 0.001;
    float angle = uTime * (0.035 + aSpeed * 0.095) + aPhase;
    float c = cos(angle);
    float s = sin(angle);
    vec2 rotated = mat2(c, -s, s, c) * offset.xz;

    vec3 animated = aCenter + vec3(rotated.x, offset.y, rotated.y);
    animated.y += sin(uTime * 0.22 + aPhase * 3.0 + radius) * 0.12;
    animated.xz += normalize(rotated + vec2(0.001))
      * sin(uTime * 0.12 + aPhase) * 0.055;

    vec4 mvPosition = modelViewMatrix * vec4(animated, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = min(5.0, aSize * uPixelRatio * (130.0 / max(5.0, -mvPosition.z)));
    vColor = aColor;
    vEnergy = 0.65 + 0.35 * sin(uTime * 0.8 + aPhase * 5.0);
  }
`;

const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vColor;
  varying float vEnergy;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float distanceToCenter = length(centered);
    if (distanceToCenter > 0.5) discard;
    float core = smoothstep(0.5, 0.0, distanceToCenter);
    float halo = pow(core, 2.2);
    gl_FragColor = vec4(vColor * (0.52 + halo * 0.95), core * vEnergy * 0.42);
  }
`;

function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function RayMarchedCluster({
  cluster,
  quality,
}: {
  cluster: SemanticCluster;
  quality: GraphicsQuality;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { camera } = useThree();
  const color = useMemo(() => new THREE.Color(cluster.color), [cluster.color]);
  const accent = useMemo(
    () => color.clone().offsetHSL(0.06, 0.08, 0.24),
    [color],
  );
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDensity: { value: cluster.density },
      uSeed: { value: cluster.id * 1.731 + 0.37 },
      uSteps: { value: quality === 'research' ? 46 : 28 },
      uColor: { value: color },
      uAccent: { value: accent },
      uCameraLocal: { value: new THREE.Vector3() },
    }),
    [accent, cluster.density, cluster.id, color, quality],
  );

  useFrame(({ clock }) => {
    if (!materialRef.current || !meshRef.current) return;
    const time = clock.elapsedTime;
    materialRef.current.uniforms.uTime.value = time;
    materialRef.current.uniforms.uCameraLocal.value.copy(camera.position);
    meshRef.current.worldToLocal(materialRef.current.uniforms.uCameraLocal.value);
    meshRef.current.rotation.y = time * (0.018 + seededUnit(cluster.id + 21) * 0.012);
    meshRef.current.rotation.z = Math.sin(time * 0.07 + cluster.id) * 0.055;
    meshRef.current.position.y = cluster.center[1]
      + Math.sin(time * 0.15 + cluster.id * 1.7) * 0.09;
  });

  const stretch = 0.74 + seededUnit(cluster.id + 9) * 0.34;

  return (
    <mesh
      ref={meshRef}
      position={cluster.center}
      scale={[cluster.radius * 1.35, cluster.radius * stretch, cluster.radius * 1.18]}
      renderOrder={-2}
    >
      <sphereGeometry args={[1, quality === 'research' ? 48 : 28, quality === 'research' ? 32 : 20]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={VOLUME_VERTEX_SHADER}
        fragmentShader={VOLUME_FRAGMENT_SHADER}
        side={THREE.BackSide}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
        toneMapped
      />
    </mesh>
  );
}

function GpuSemanticParticles({
  clusters,
  quality,
}: {
  clusters: SemanticCluster[];
  quality: GraphicsQuality;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { gl } = useThree();
  const buffers = useMemo(() => {
    const particlesPerPaper = quality === 'research' ? 68 : 34;
    const total = clusters.reduce(
      (sum, cluster) => sum + Math.max(72, cluster.paperCount * particlesPerPaper),
      0,
    );
    const positions = new Float32Array(total * 3);
    const centers = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    const phases = new Float32Array(total);
    const speeds = new Float32Array(total);
    const sizes = new Float32Array(total);

    let cursor = 0;
    clusters.forEach((cluster) => {
      const count = Math.max(72, cluster.paperCount * particlesPerPaper);
      const baseColor = new THREE.Color(cluster.color);
      for (let i = 0; i < count; i++, cursor++) {
        const seed = (cluster.id + 1) * 100003 + i * 17;
        const theta = seededUnit(seed + 1) * Math.PI * 2;
        const phi = Math.acos(2 * seededUnit(seed + 2) - 1);
        const radial = Math.pow(seededUnit(seed + 3), 0.58) * cluster.radius * 1.7;
        const flatten = 0.48 + seededUnit(seed + 4) * 0.34;
        const x = Math.sin(phi) * Math.cos(theta) * radial;
        const y = Math.cos(phi) * radial * flatten;
        const z = Math.sin(phi) * Math.sin(theta) * radial;
        const p3 = cursor * 3;
        positions[p3] = cluster.center[0] + x;
        positions[p3 + 1] = cluster.center[1] + y;
        positions[p3 + 2] = cluster.center[2] + z;
        centers[p3] = cluster.center[0];
        centers[p3 + 1] = cluster.center[1];
        centers[p3 + 2] = cluster.center[2];

        const particleColor = baseColor
          .clone()
          .offsetHSL((seededUnit(seed + 5) - 0.5) * 0.07, 0.02, seededUnit(seed + 6) * 0.28);
        colors[p3] = particleColor.r;
        colors[p3 + 1] = particleColor.g;
        colors[p3 + 2] = particleColor.b;
        phases[cursor] = seededUnit(seed + 7) * Math.PI * 2;
        speeds[cursor] = 0.35 + seededUnit(seed + 8) * 0.85;
        sizes[cursor] = 0.8 + seededUnit(seed + 9) * 1.65;
      }
    });

    return { positions, centers, colors, phases, speeds, sizes };
  }, [clusters, quality]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(2, gl.getPixelRatio()) },
    }),
    [gl],
  );

  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = clock.elapsedTime;
  });

  if (buffers.positions.length === 0) return null;

  return (
    <points frustumCulled={false} renderOrder={-1}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buffers.positions, 3]} />
        <bufferAttribute attach="attributes-aCenter" args={[buffers.centers, 3]} />
        <bufferAttribute attach="attributes-aColor" args={[buffers.colors, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[buffers.phases, 1]} />
        <bufferAttribute attach="attributes-aSpeed" args={[buffers.speeds, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[buffers.sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={PARTICLE_VERTEX_SHADER}
        fragmentShader={PARTICLE_FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

export function SemanticNebulaField({
  clusters,
  quality,
}: {
  clusters: SemanticCluster[];
  quality: GraphicsQuality;
}) {
  return (
    <group>
      {clusters.map((cluster) => (
        <RayMarchedCluster key={cluster.id} cluster={cluster} quality={quality} />
      ))}
      <GpuSemanticParticles clusters={clusters} quality={quality} />
    </group>
  );
}
