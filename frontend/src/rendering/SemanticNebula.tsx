import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { stableUnit, type SemanticCluster } from './galaxyModel';
import { createPeripheralStars } from './peripheralStars';

export type { SemanticCluster } from './galaxyModel';
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
  uniform float uTime, uDensity, uSeed, uSteps, uMorphology, uVisibility;
  uniform vec3 uColor, uAccent, uCameraLocal;
  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
          mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
          mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.52;
    mat3 turn = mat3(0.0,0.8,0.6,-0.8,0.36,-0.48,-0.6,-0.48,0.64);
    for (int i = 0; i < 3; i++) {
      v += noise3(p) * a;
      p = turn * p * 2.03 + 0.17;
      a *= 0.48;
    }
    return v;
  }
  void main() {
    // Analytic ray/sphere interval also handles a camera inside the volume.
    vec3 rd = normalize(vLocalPosition - uCameraLocal);
    float b = dot(uCameraLocal, rd);
    float discriminant = b*b - dot(uCameraLocal,uCameraLocal) + 1.0;
    if (discriminant <= 0.0) discard;
    float root = sqrt(discriminant);
    float entry = max(0.0, -b - root), exitPoint = -b + root;
    float dt = (exitPoint - entry) / uSteps;
    vec4 acc = vec4(0.0);
    for (int i = 0; i < 48; i++) {
      if (float(i) >= uSteps) break;
      vec3 p = uCameraLocal + rd * (entry + (float(i) + 0.5) * dt);
      vec3 drift = vec3(uTime*0.012, -uTime*0.009, uTime*0.006);
      vec3 q = p + (vec3(
        noise3(p*2.4 + drift + uSeed),
        noise3(p*2.4 - drift + uSeed + 17.0),
        noise3(p*2.4 + drift + uSeed + 31.0)) - 0.5) * 0.34;
      float bend = sin(q.x*3.2 + uSeed)*0.16;
      float ribbon = exp(-pow(q.y - bend,2.0)*9.0 - q.x*q.x*2.4 - q.z*q.z*4.0);
      float fork = exp(-pow(q.y + bend + 0.19,2.0)*19.0 - q.x*q.x*3.0 - q.z*q.z*5.0);
      float lobes = exp(-dot(q-vec3(-0.30,0.16,0), q-vec3(-0.30,0.16,0))*7.0)
                  + exp(-dot(q-vec3(0.30,-0.12,0.08), q-vec3(0.30,-0.12,0.08))*8.0)*0.7;
      float shape = uMorphology < 0.5 ? ribbon + fork*0.45
        : uMorphology < 1.5 ? lobes : ribbon*0.65 + lobes*0.45;
      float boundary = 1.0 - smoothstep(0.62,1.0,length(p));
      if (shape*boundary < 0.012) continue;
      float n = fbm(q*4.5 + drift + uSeed);
      float fine = noise3(q*9.0 - drift + uSeed*0.4);
      float filaments = smoothstep(0.31,0.70,n) * (0.55 + fine*0.65);
      float lane = exp(-pow(q.y-bend+0.05,2.0)*180.0) * smoothstep(0.42,0.72,fine);
      // A continuous low-frequency mist under the filaments makes the volume
      // visible without turning its brightest parts into flat white blobs.
      float density = shape * (0.14+filaments*0.94) * (1.0-lane*0.72) * boundary * uDensity;
      float alpha = (1.0-exp(-density*dt*1.65))*uVisibility;
      vec3 sampleColor = mix(uColor*0.34,uAccent*0.68,smoothstep(0.40,0.72,n));
      acc.rgb += (1.0-acc.a) * alpha * sampleColor;
      acc.a += (1.0-acc.a) * alpha;
      if (acc.a > 0.88) break;
    }
    // Normal blending expects straight alpha, not premultiplied RGB.
    gl_FragColor = vec4(acc.rgb/max(acc.a,0.0001), acc.a*0.70);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const PARTICLE_VERTEX_SHADER = /* glsl */ `
  attribute float aPhase, aSize, aSpeed;
  uniform float uTime, uPixelRatio, uVisibility;
  uniform vec3 uColor;
  varying float vEnergy;
  void main() {
    // Restore continuous orbital motion, rather than barely visible jitter.
    // XY ellipses follow the cloud axes and keep the cloud's center clear.
    float angle = uTime*aSpeed;
    mat2 orbit = mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
    vec2 rotated = orbit*position.xy;
    rotated *= 1.0+sin(uTime*0.16+aPhase)*0.015;
    vec3 animated = vec3(rotated,position.z+sin(uTime*0.20+aPhase)*0.035);
    vec4 mv = modelViewMatrix*vec4(animated,1.0);
    gl_Position = projectionMatrix*mv;
    gl_PointSize = clamp(aSize*uPixelRatio*100.0/max(3.0,-mv.z),1.6,4.6);
    // A tilted orbital ellipse can project across the cloud center. Fade those
    // projections too, so rotating the camera doesn't reintroduce central dots.
    vec4 centerClip = projectionMatrix*modelViewMatrix*vec4(0.0,0.0,0.0,1.0);
    vec4 xClip = projectionMatrix*modelViewMatrix*vec4(1.0,0.0,0.0,1.0);
    vec4 yClip = projectionMatrix*modelViewMatrix*vec4(0.0,1.0,0.0,1.0);
    vec2 centerNdc = centerClip.xy/max(abs(centerClip.w),0.001);
    float extent = max(length(xClip.xy/max(abs(xClip.w),0.001)-centerNdc),
                       length(yClip.xy/max(abs(yClip.w),0.001)-centerNdc));
    float projectedRadius = length(gl_Position.xy/max(abs(gl_Position.w),0.001)-centerNdc)/max(extent,0.001);
    float clearCore = smoothstep(0.38,0.68,projectedRadius)*step(0.05,centerClip.w);
    vEnergy = (0.82+sin(uTime*0.65+aPhase)*0.16)*uVisibility*clearCore;
  }
`;
const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  varying float vEnergy;
  void main() {
    float r = length(gl_PointCoord-0.5)*2.0;
    if (r>1.0) discard;
    float core = exp(-r*r*7.0);
    float halo = exp(-r*r*2.8)*(1.0-smoothstep(0.65,1.0,r));
    vec3 color = mix(uColor,vec3(0.92,0.97,1.0),core*0.74);
    gl_FragColor = vec4(color,(core*0.66+halo*0.24)*vEnergy);
    #include <colorspace_fragment>
  }
`;

function Cloud({ cluster, quality, visibility }: { cluster: SemanticCluster; quality: GraphicsQuality; visibility: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const { camera } = useThree();
  const uniforms = useMemo(() => {
    const color = new THREE.Color(cluster.color).offsetHSL(0,-0.22,-0.02);
    return {
      uTime: { value: 0 }, uSeed: { value: stableUnit(String(cluster.id),13)*20 },
      uDensity: { value: cluster.density }, uSteps: { value: quality === 'research' ? 46 : 28 },
      uMorphology: { value: cluster.morphology }, uVisibility: { value: visibility },
      uColor: { value: color }, uAccent: { value: color.clone().lerp(new THREE.Color('#b8c9df'),0.42) },
      uCameraLocal: { value: new THREE.Vector3() },
    };
  }, [cluster, quality]);
  useFrame(({ clock }, delta) => {
    if (!mesh.current || !material.current) return;
    material.current.uniforms.uTime.value = clock.elapsedTime;
    material.current.uniforms.uVisibility.value = THREE.MathUtils.damp(material.current.uniforms.uVisibility.value,visibility,3,delta);
    mesh.current.updateWorldMatrix(true,false);
    material.current.uniforms.uCameraLocal.value.copy(camera.position);
    mesh.current.worldToLocal(material.current.uniforms.uCameraLocal.value);
  });
  return <mesh ref={mesh} position={cluster.center} rotation={[0,0,cluster.angle]} scale={cluster.axes} renderOrder={-3}>
    <sphereGeometry args={[1,32,24]} />
    <shaderMaterial ref={material} uniforms={uniforms} vertexShader={VOLUME_VERTEX_SHADER} fragmentShader={VOLUME_FRAGMENT_SHADER}
      side={THREE.BackSide} transparent depthWrite={false} depthTest={false} blending={THREE.NormalBlending} />
  </mesh>;
}

function OrbitingStars({ cluster, quality, visibility }: { cluster: SemanticCluster; quality: GraphicsQuality; visibility: number }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const { gl } = useThree();
  const buffers = useMemo(() => createPeripheralStars(cluster.id,cluster.paperCount,quality==='research'),[cluster.id,cluster.paperCount,quality]);
  const uniforms = useMemo(() => ({
    uTime:{value:0},uPixelRatio:{value:1},uVisibility:{value:visibility},
    uColor:{value:new THREE.Color(cluster.color).lerp(new THREE.Color('#c7ddf5'),0.45)},
  }),[cluster.color]);
  useFrame(({ clock },delta) => {
    if (!material.current) return;
    material.current.uniforms.uTime.value=clock.elapsedTime;
    material.current.uniforms.uPixelRatio.value=Math.min(1.75,gl.getPixelRatio());
    material.current.uniforms.uVisibility.value=THREE.MathUtils.damp(material.current.uniforms.uVisibility.value,visibility,3,delta);
  });
  return <points position={cluster.center} rotation={[0,0,cluster.angle]} scale={cluster.axes} frustumCulled={false} renderOrder={-1} raycast={() => null}>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[buffers.positions,3]} />
      <bufferAttribute attach="attributes-aPhase" args={[buffers.phases,1]} />
      <bufferAttribute attach="attributes-aSpeed" args={[buffers.speeds,1]} />
      <bufferAttribute attach="attributes-aSize" args={[buffers.sizes,1]} />
    </bufferGeometry>
    <shaderMaterial ref={material} uniforms={uniforms} vertexShader={PARTICLE_VERTEX_SHADER} fragmentShader={PARTICLE_FRAGMENT_SHADER}
      transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
  </points>;
}

export function SemanticNebulaField({ clusters, quality, focusedCluster }: { clusters: SemanticCluster[]; quality: GraphicsQuality; focusedCluster?: number }) {
  return <group>{clusters.map(cluster => {
    const visibility = focusedCluster === undefined || focusedCluster === cluster.id ? 1 : 0.24;
    return <group key={cluster.id}>
      <Cloud cluster={cluster} quality={quality} visibility={visibility} />
      <OrbitingStars cluster={cluster} quality={quality} visibility={visibility} />
    </group>;
  })}</group>;
}
