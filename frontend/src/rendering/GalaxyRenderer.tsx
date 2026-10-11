import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { Edge, Paper } from '../types/scholar';
import {
  SemanticNebulaField,
  type GraphicsQuality,
  type SemanticCluster,
} from './SemanticNebula';

function buildSemanticClusters(papers: Paper[]): SemanticCluster[] {
  const groups = new Map<number, Paper[]>();
  papers.forEach((paper) => {
    const clusterId = Number.isFinite(paper.cluster) ? paper.cluster : 0;
    const current = groups.get(clusterId) || [];
    current.push(paper);
    groups.set(clusterId, current);
  });

  return Array.from(groups.entries()).map(([id, members]) => {
    const center = members.reduce(
      (sum, paper) => [
        sum[0] + paper.pos[0],
        sum[1] + paper.pos[1],
        sum[2] + paper.pos[2],
      ] as [number, number, number],
      [0, 0, 0] as [number, number, number],
    );
    center[0] /= members.length;
    center[1] /= members.length;
    center[2] /= members.length;

    const spread = members.reduce((maxDistance, paper) => {
      const dx = paper.pos[0] - center[0];
      const dy = paper.pos[1] - center[1];
      const dz = paper.pos[2] - center[2];
      return Math.max(maxDistance, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }, 0);
    const meanConfidence = members.reduce(
      (sum, paper) => sum + Math.max(0, Math.min(1, paper.confidence || 0)),
      0,
    ) / members.length;

    return {
      id,
      center,
      radius: Math.max(1.65, Math.min(5.4, spread + 1.25 + Math.sqrt(members.length) * 0.28)),
      color: members[0]?.color || '#60a5fa',
      density: Math.min(1.45, 0.72 + members.length * 0.055 + meanConfidence * 0.24),
      paperCount: members.length,
    };
  });
}

// --- 连线组件：科技感渐变与交互 ---
function EdgeConnection({ from, to }: { from: Paper; to: Paper }) {
  const [hovered, setHover] = useState(false);
  
  // 预计算颜色对象
  const colors = useMemo(() => {
    return [new THREE.Color(from.color), new THREE.Color(to.color)];
  }, [from.color, to.color]);

  return (
    <group>
      {/* 1. 可见线：极简渐变，悬停时高亮并发光 */}
      <Line
        points={[from.pos, to.pos]}
        vertexColors={colors}
        lineWidth={hovered ? 3 : 1} // 悬停变粗
        transparent
        opacity={hovered ? 1.0 : 0.2} // 平时低透明度，悬停完全不透明
        depthWrite={false}
        toneMapped={false} // 允许颜色溢出产生辉光
      />
      
      {/* 2. 交互热区：不可见的粗线，用于捕捉鼠标事件 */}
      <Line
        points={[from.pos, to.pos]}
        lineWidth={12} // 增加点击范围
        transparent
        opacity={0} // 完全透明
        onPointerOver={(e) => {
          e.stopPropagation(); // 防止穿透
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
      />
    </group>
  );
}

// OrbitControls normally treats Ctrl/Meta/Shift + left drag as pan even when
// LEFT is mapped to rotate. Suppress only that modified drag path so navigation
// has one clear policy: left rotates, middle pans. A stationary Ctrl+Click still
// reaches PaperNode and keeps the "add to chat" shortcut working.
function ModifiedLeftPanGuard() {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    let modifiedLeftDown = false;

    const handlePointerDown = (event: PointerEvent) => {
      modifiedLeftDown = event.button === 0
        && (event.ctrlKey || event.metaKey || event.shiftKey);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (modifiedLeftDown && (event.buttons & 1) === 1) {
        event.stopImmediatePropagation();
      }
    };
    const handlePointerUp = () => {
      modifiedLeftDown = false;
    };

    canvas.addEventListener('pointerdown', handlePointerDown, true);
    canvas.addEventListener('pointermove', handlePointerMove, true);
    canvas.addEventListener('pointerup', handlePointerUp, true);
    canvas.addEventListener('pointercancel', handlePointerUp, true);
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown, true);
      canvas.removeEventListener('pointermove', handlePointerMove, true);
      canvas.removeEventListener('pointerup', handlePointerUp, true);
      canvas.removeEventListener('pointercancel', handlePointerUp, true);
    };
  }, [gl]);

  return null;
}

const PLANET_VERTEX_SHADER = /* glsl */ `
  varying vec3 vObjectPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vObjectPosition = position;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const PLANET_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vObjectPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSeed;
  uniform float uActive;
  uniform float uVariation;
  uniform float uConfidence;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float result = 0.0;
    float amplitude = 0.56;
    for (int octave = 0; octave < 4; octave++) {
      result += noise3(p) * amplitude;
      p = p * 2.07 + vec3(0.31, 0.17, 0.23);
      amplitude *= 0.48;
    }
    return result;
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 lightDirection = normalize(vec3(-0.48, 0.72, 0.5));

    // Normalize the object position so texture scale is independent of node size.
    // The mesh itself performs the physical axial rotation in PaperNode.
    vec3 point = normalize(vObjectPosition);

    float continents = fbm(point * (2.45 + uVariation * 0.8) + uSeed * 0.41);
    float mediumDetail = fbm(point * (6.2 + uVariation * 2.6) - uSeed * 0.23);
    float fineDetail = noise3(point * (19.0 + uVariation * 8.0) + uSeed);
    float ridges = 1.0 - smoothstep(0.055, 0.19, abs(mediumDetail - 0.5));
    float basinNoise = fbm(point * (3.5 + uVariation * 1.4) - uSeed * 0.17);
    float craterFields = smoothstep(0.58, 0.82, fineDetail)
      * (1.0 - smoothstep(0.77, 0.94, fineDetail));

    vec3 nearWhite = mix(uColor, vec3(0.94, 0.975, 1.0), 0.64);
    vec3 deepColor = mix(vec3(0.008, 0.014, 0.032), uColor * 0.24, 0.72);

    // Unified moon-like art direction: every paper is a softly mottled rocky
    // world. Stable per-paper variation changes maria, highlands and craters
    // without changing the shared visual language.
    float maria = smoothstep(0.4 + uVariation * 0.06, 0.69, continents);
    float highlands = smoothstep(0.34, 0.76 - uVariation * 0.05, mediumDetail);
    float darkBasins = smoothstep(0.5, 0.76, basinNoise);
    vec3 albedo = mix(uColor * (0.25 + uVariation * 0.08), nearWhite * 0.88,
      maria * 0.62 + highlands * 0.22);
    albedo = mix(albedo, deepColor * 1.45, darkBasins * (0.22 + uVariation * 0.13));
    albedo *= 0.75 + fineDetail * 0.31;
    albedo += nearWhite * ridges * (0.055 + uVariation * 0.045);
    albedo -= uColor * craterFields * (0.035 + uVariation * 0.045);
    float specularStrength = 0.035;

    float directLight = max(dot(normal, lightDirection), 0.0);
    float hemisphere = normal.y * 0.5 + 0.5;
    float illumination = 0.2 + directLight * 0.72 + hemisphere * 0.08;
    float viewDot = max(dot(normal, viewDirection), 0.0);
    float limb = pow(1.0 - viewDot, 2.7);
    vec3 halfVector = normalize(lightDirection + viewDirection);
    float specular = pow(max(dot(normal, halfVector), 0.0), 34.0) * specularStrength;

    vec3 surface = mix(deepColor, albedo, illumination);
    surface += nearWhite * specular;
    surface += mix(uColor, nearWhite, 0.68) * limb
      * (0.3 + uConfidence * 0.14 + uActive * 0.2);

    gl_FragColor = vec4(surface, 1.0);
  }
`;

const CORONA_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CORONA_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uPhase;
  uniform float uActive;

  void main() {
    vec2 point = (vUv - 0.5) * 2.0;
    float radius = length(point);
    if (radius > 1.0) discard;

    float angle = atan(point.y, point.x);
    // The visible planet edge sits at about 0.345 in this billboard. Start the
    // atmosphere slightly inside that edge so depth occlusion produces a
    // seamless contact instead of a dark circular gap.
    float radialDistance = max(radius - 0.31, 0.0);
    float radialProgress = clamp(radialDistance / 0.69, 0.0, 1.0);

    // Near the planet the atmosphere is dense, bright and coherent. Farther out
    // it becomes irregular, desaturated and exponentially more transparent.
    float breath = sin(uTime * 0.46 + uPhase * 5.0) * 0.5 + 0.5;
    float nearGlow = exp(-radialDistance * mix(8.6, 6.3, breath));
    float outerMist = exp(-radialDistance * mix(4.0, 3.05, breath));
    float dispersion = 1.0
      + sin(angle * 5.0 - uTime * 0.16 + uPhase) * mix(0.025, 0.16, radialProgress)
      + sin(angle * 11.0 + uTime * 0.1) * mix(0.015, 0.075, radialProgress);
    float outsidePlanet = smoothstep(0.285, 0.35, radius);
    float outerFade = 1.0 - smoothstep(0.78, 1.0, radius);
    float energy = mix(0.76, 1.3, uActive);
    float alpha = (nearGlow * 0.165 + outerMist * 0.046)
      * outsidePlanet * outerFade * dispersion * energy;

    float luminance = dot(uColor, vec3(0.2126, 0.7152, 0.0722));
    vec3 desaturatedOuter = mix(uColor, vec3(luminance), 0.76);
    vec3 brightInner = mix(uColor, vec3(0.91, 0.96, 1.0), 0.62);
    vec3 haloColor = mix(brightInner, desaturatedOuter, pow(radialProgress, 0.72));
    float innerIntensity = 1.24 - radialProgress * 0.34;
    gl_FragColor = vec4(haloColor * innerIntensity, alpha);
  }
`;

// --- 节点太阳日冕：固定范围内由边缘向外传播，而不是缩放整个光环 ---
function NodeSolarCorona({
  color,
  radius,
  active,
  phase,
}: {
  color: string;
  radius: number;
  active: boolean;
  phase: number;
}) {
  const billboardRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { camera } = useThree();
  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(color) },
    uTime: { value: 0 },
    uPhase: { value: phase },
    uActive: { value: active ? 1 : 0 },
  }), [color, phase]);

  useFrame(({ clock }, delta) => {
    if (!billboardRef.current || !materialRef.current) return;
    billboardRef.current.quaternion.copy(camera.quaternion);
    materialRef.current.uniforms.uTime.value = clock.elapsedTime;
    materialRef.current.uniforms.uActive.value = THREE.MathUtils.damp(
      materialRef.current.uniforms.uActive.value,
      active ? 1 : 0,
      5,
      delta,
    );
  });

  return (
    <group ref={billboardRef} renderOrder={3}>
      <mesh>
        <planeGeometry args={[radius * 5.8, radius * 5.8]} />
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={CORONA_VERTEX_SHADER}
          fragmentShader={CORONA_FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function stableVisualUnit(value: string, salt: number) {
  let hash = (2166136261 ^ salt) >>> 0;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

// --- 核心渲染组件：低亮星体 + 局部轨道光环 ---
function PaperNode({
  paper,
  isHighlighted,
  onSelect,
  onRequestAddToChat,
  hideLabels,
  isSelected,
  htmlPortalTargetRef
}: {
  paper: Paper;
  isHighlighted: boolean;
  onSelect: (p: Paper, screenPos: { x: number; y: number }) => void;
  onRequestAddToChat?: (p: Paper) => void;
  hideLabels?: boolean;
  isSelected: boolean;
  htmlPortalTargetRef: React.RefObject<HTMLDivElement>;
}) {
  const { camera, gl } = useThree();
  const [hovered, setHover] = useState(false);
  const position = useMemo(() => new THREE.Vector3(...paper.pos), [paper.pos]);

  const baseColor = paper.color;
  const isActive = isHighlighted || hovered || isSelected;
  // 论文置信度只决定恒定半径；检索与呼吸效果不再缩放星体几何体。
  const semanticRadius = 0.19 + Math.max(0, Math.min(1, paper.confidence || 0)) * 0.13;
  const visualSignature = useMemo(
    () => [paper.id, paper.field, ...(paper.keywords || [])].join('|'),
    [paper.field, paper.id, paper.keywords],
  );
  const visualIdentity = useMemo(
    () => ({
      variation: stableVisualUnit(visualSignature, 17),
      phase: stableVisualUnit(visualSignature, 131) * Math.PI * 2,
      spinSpeed: (0.085 + stableVisualUnit(visualSignature, 211) * 0.11)
        * (stableVisualUnit(visualSignature, 307) > 0.5 ? 1 : -1),
      axialTilt: (stableVisualUnit(visualSignature, 401) - 0.5) * 0.58,
    }),
    [visualSignature],
  );
  const phase = visualIdentity.phase;
  const surfaceMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const planetMeshRef = useRef<THREE.Mesh>(null);
  const surfaceUniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(baseColor) },
    uTime: { value: 0 },
    uSeed: { value: phase },
    uActive: { value: isActive ? 1 : 0 },
    uVariation: { value: visualIdentity.variation },
    uConfidence: { value: Math.max(0, Math.min(1, paper.confidence || 0)) },
  }), [baseColor, paper.confidence, phase, visualIdentity.variation]);

  useFrame(({ clock }, delta) => {
    if (planetMeshRef.current) {
      planetMeshRef.current.rotation.y = clock.elapsedTime * visualIdentity.spinSpeed + phase;
    }
    if (!surfaceMaterialRef.current) return;
    surfaceMaterialRef.current.uniforms.uTime.value = clock.elapsedTime;
    surfaceMaterialRef.current.uniforms.uActive.value = THREE.MathUtils.damp(
      surfaceMaterialRef.current.uniforms.uActive.value,
      isActive ? 1 : 0,
      6,
      delta,
    );
  });

  return (
    <group position={position}>
      <NodeSolarCorona
        color={baseColor}
        radius={semanticRadius}
        active={isActive}
        phase={phase}
      />

      {/* 1. 核心球体：程序化颗粒纹理、明暗面与边缘光 */}
      <group rotation={[0, 0, visualIdentity.axialTilt]}>
        <mesh ref={planetMeshRef}
          onClick={(e) => {
            e.stopPropagation();
            // Ctrl/Cmd/Shift+Click：添加到对话框（与右键等价，避免浏览器环境吞右键）
            const native = e.nativeEvent as MouseEvent;
            if (native.ctrlKey || native.metaKey || native.shiftKey) {
              if (onRequestAddToChat) {
                onRequestAddToChat(paper);
                return;
              }
            }
            // Calculate screen position based on actual canvas position within the window
            const vector = position.clone().project(camera);
            const canvasBounds = gl.domElement.getBoundingClientRect();
            const x = canvasBounds.left + (vector.x * 0.5 + 0.5) * canvasBounds.width;
            const y = canvasBounds.top + (-vector.y * 0.5 + 0.5) * canvasBounds.height;
            onSelect(paper, { x, y }); // Pass window-relative screen position
          }}
          onContextMenu={(e) => {
            e.stopPropagation();
            e.nativeEvent.preventDefault();
            onRequestAddToChat?.(paper);
          }}
          onPointerOver={() => setHover(true)}
          onPointerOut={() => setHover(false)}
        >
          <sphereGeometry args={[semanticRadius, 48, 32]} />
          <shaderMaterial
            ref={surfaceMaterialRef}
            uniforms={surfaceUniforms}
            vertexShader={PLANET_VERTEX_SHADER}
            fragmentShader={PLANET_FRAGMENT_SHADER}
            toneMapped
          />
        </mesh>
      </group>

      {/* 文件名常驻显示；交互时提高对比度与字号。 */}
      {!hideLabels && (
        <Html
          distanceFactor={26}
          position={[0, semanticRadius + 0.16, 0]}
          center
          portal={htmlPortalTargetRef}
        >
          <div style={{
            pointerEvents: 'none',
            background: isActive ? 'rgba(2, 6, 12, 0.86)' : 'rgba(2, 6, 12, 0.44)',
            color: 'white',
            padding: isActive ? '4px 10px' : '2px 6px',
            borderRadius: '4px',
            fontSize: isActive ? '11px' : '9px',
            fontWeight: 500,
            border: `1px solid ${baseColor}${isActive ? '88' : '24'}`,
            whiteSpace: 'nowrap',
            boxShadow: isActive ? `0 0 18px ${baseColor}44` : 'none',
            backdropFilter: 'blur(6px)',
            transition: 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)',
            opacity: isActive ? 1 : 0.82,
            textShadow: '0 1px 4px rgba(0, 0, 0, 0.95)',
            transform: isActive ? 'translateY(0) scale(1)' : 'translateY(1px) scale(0.96)',
          }}>
            {paper.filename || paper.displayTitle || paper.title}
          </div>
        </Html>
      )}
    </group>
  );
}

// --- 主渲染组件 ---
export function GalaxyRenderer({
  papers,
  edges,
  onSelect,
  onRequestAddToChat,
  highlights,
  hideLabels,
  focusTarget,
  htmlPortalTargetRef,
  graphicsQuality = 'research',
}: {
  papers: Paper[];
  edges: Edge[];
  onSelect: (p: Paper, screenPos: { x: number; y: number }) => void;
  onRequestAddToChat?: (p: Paper) => void;
  highlights: string[];
  hideLabels?: boolean;
  focusTarget?: Paper | null;
  htmlPortalTargetRef: React.RefObject<HTMLDivElement>;
  graphicsQuality?: GraphicsQuality;
}) {
  const highlightSet = useMemo(() => new Set(highlights), [highlights]);
  const semanticClusters = useMemo(() => buildSemanticClusters(papers), [papers]);
  const paperMap = useMemo(
    () => new Map(papers.map((paper) => [paper.id, paper])),
    [papers],
  );
  // Camera & controls refs
  const controlsRef = useRef<any>(null);

  // Camera animator must run inside the Canvas render context, so define a small component
  function CameraAnimator({ focus }: { focus?: Paper | null }) {
    const { camera } = useThree();
    const animRef = useRef<number | null>(null);
    const startRef = useRef<{ from: THREE.Vector3; to: THREE.Vector3; targetFrom: THREE.Vector3; targetTo: THREE.Vector3; startTime: number; duration: number } | null>(null);

    useEffect(() => {
      if (!focus) return;
      const targetPos = new THREE.Vector3(...focus.pos);
      const offset = new THREE.Vector3(0, 0, 18 + (focus.size || 0));
      const desiredCam = targetPos.clone().add(offset);

      const from = camera.position.clone();
      const to = desiredCam;
      const targetFrom = controlsRef.current ? controlsRef.current.target.clone() : new THREE.Vector3(0, 0, 0);
      const targetTo = targetPos.clone();
      const duration = 600;
      startRef.current = { from, to, targetFrom, targetTo, startTime: performance.now(), duration };

      if (animRef.current) cancelAnimationFrame(animRef.current);

      const step = () => {
        if (!startRef.current) return;
        const now = performance.now();
        const t = Math.min(1, (now - startRef.current.startTime) / startRef.current.duration);
        const ease = t * (2 - t);
        camera.position.lerpVectors(startRef.current.from, startRef.current.to, ease);
        if (controlsRef.current) {
          const newTarget = startRef.current.targetFrom.clone().lerp(startRef.current.targetTo, ease);
          controlsRef.current.target.copy(newTarget);
          controlsRef.current.update();
        }

        if (t < 1) {
          animRef.current = requestAnimationFrame(step);
        } else {
          startRef.current = null;
          animRef.current = null;
        }
      };

      animRef.current = requestAnimationFrame(step);
      return () => {
        if (animRef.current) cancelAnimationFrame(animRef.current);
        animRef.current = null;
      };
    }, [focus]);

    return null;
  }

  return (
    <div
      style={{ width: '100%', height: '100%', background: '#010204', position: 'relative' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Canvas 
        camera={{ position: [0, 0, 31], fov: 50 }}
        dpr={graphicsQuality === 'research' ? [1, 1.75] : [0.85, 1.25]}
        gl={{ 
          antialias: true, 
          toneMapping: THREE.ReinhardToneMapping,
          powerPreference: "high-performance" 
        }}
      >
        <color attach="background" args={['#010204']} />
        
        {/* 背景氛围 */}
        <Stars radius={150} depth={50} count={5000} factor={4} saturation={0.5} fade speed={1.5} />
        <ambientLight intensity={0.2} />
        <pointLight position={[20, 20, 20]} intensity={1.5} color="#ffffff" />

        {/*
          图形学层：每个语义聚类生成一团程序化体积星云；粒子位置由 GPU
          顶点着色器逐帧更新。聚类中心、尺度、颜色和密度均来自论文数据。
        */}
        <SemanticNebulaField clusters={semanticClusters} quality={graphicsQuality} />

        {/* Camera animator listens to focusTarget and performs fly-to */}
        <CameraAnimator focus={focusTarget} />


        {/* 渲染连接线：使用自定义组件实现科技感交互 */}
        {edges.map((edge, i) => {
          const from = paperMap.get(edge.source);
          const to = paperMap.get(edge.target);
          if (!from || !to) return null;
          
          return (
            <EdgeConnection 
              key={`edge-${i}`}
              from={from}
              to={to}
            />
          );
        })}

        {/* 渲染节点 */}
        {papers.map((paper) => (
          <PaperNode 
            key={paper.id} 
            paper={paper} 
            isHighlighted={highlightSet.has(paper.id)}
            onSelect={onSelect}
            onRequestAddToChat={onRequestAddToChat}
            hideLabels={hideLabels}
            isSelected={paper.id === focusTarget?.id}
            htmlPortalTargetRef={htmlPortalTargetRef}
          />
        ))}

        {/* 交互控制 */}
        <ModifiedLeftPanGuard />
        <OrbitControls 
          ref={controlsRef}
          enableDamping 
          enablePan
          screenSpacePanning
          dampingFactor={0.05} 
          rotateSpeed={0.7}
          panSpeed={0.85}
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.PAN,
          }}
          minDistance={10}
          maxDistance={200}
        />

        {/* 关键渲染步骤：辉光后期处理 */}
        <EffectComposer>
          <Bloom 
            luminanceThreshold={0.7} 
            intensity={0.82} 
            mipmapBlur 
            radius={0.42} 
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
