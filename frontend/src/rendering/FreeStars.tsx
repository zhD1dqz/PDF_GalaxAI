import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createFreeStarField, FREE_STAR_DRIFT_AMPLITUDE, FREE_STAR_DRIFT_RATE } from './freeStarField';

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aVelocity, aColor;
  attribute float aPhase, aSize, aBrightness;
  uniform float uTime, uPixelRatio;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    // Every star drifts in its own direction; no rotation around a nebula center.
    float drift = (sin(uTime*${FREE_STAR_DRIFT_RATE.toFixed(2)}+aPhase)-sin(aPhase))*${FREE_STAR_DRIFT_AMPLITUDE.toFixed(1)};
    vec3 animated = position+aVelocity*drift;
    vec4 mv = modelViewMatrix*vec4(animated,1.0);
    gl_Position = projectionMatrix*mv;
    gl_PointSize = clamp(aSize*uPixelRatio*85.0/max(8.0,-mv.z),1.7*uPixelRatio,6.0*uPixelRatio);
    vColor = aColor*aBrightness;
    vTwinkle = 0.80+sin(uTime*0.58+aPhase)*0.15;
  }
`;
const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    float r = length(gl_PointCoord-0.5)*2.0;
    if (r>1.0) discard;
    float core = exp(-r*r*14.0);
    float glow = exp(-r*r*3.5)*(1.0-smoothstep(0.64,1.0,r));
    vec3 radiance = vColor*(0.62+core*1.10);
    gl_FragColor = vec4(radiance,(core*0.76+glow*0.18)*vTwinkle);
    #include <colorspace_fragment>
  }
`;

export default function FreeStars({ highQuality }: { highQuality: boolean }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const { gl } = useThree();
  const buffers = useMemo(() => createFreeStarField(highQuality), [highQuality]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: 1 } }), []);
  useFrame(({ clock }) => {
    if (!material.current) return;
    material.current.uniforms.uTime.value = clock.elapsedTime;
    material.current.uniforms.uPixelRatio.value = Math.min(1.75, gl.getPixelRatio());
  });
  return <points renderOrder={-5} frustumCulled={false} raycast={() => null}>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[buffers.positions,3]} />
      <bufferAttribute attach="attributes-aVelocity" args={[buffers.velocities,3]} />
      <bufferAttribute attach="attributes-aColor" args={[buffers.colors,3]} />
      <bufferAttribute attach="attributes-aPhase" args={[buffers.phases,1]} />
      <bufferAttribute attach="attributes-aSize" args={[buffers.sizes,1]} />
      <bufferAttribute attach="attributes-aBrightness" args={[buffers.brightness,1]} />
    </bufferGeometry>
    <shaderMaterial ref={material} uniforms={uniforms} vertexShader={VERTEX_SHADER} fragmentShader={FRAGMENT_SHADER}
      transparent depthWrite={false} depthTest blending={THREE.AdditiveBlending} toneMapped={false} />
  </points>;
}
