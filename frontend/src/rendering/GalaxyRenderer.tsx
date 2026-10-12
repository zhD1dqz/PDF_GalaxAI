import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { Edge, Paper } from '../types/scholar';
import { SemanticNebulaField, type GraphicsQuality } from './SemanticNebula';
import { cameraDestination, edgeEmphasis, paperRadius, stableUnit, type GalaxyView, type QueryVisual, type SemanticCluster } from './galaxyModel';
import { HALO_FRAGMENT_SHADER, HALO_VERTEX_SHADER, PLANET_FRAGMENT_SHADER, PLANET_VERTEX_SHADER } from './planetShaders';
import FreeStars from './FreeStars';

export type ProjectedPoint = { id: string; x: number; y: number; radius: number; distance: number };
export type ProjectionSnapshot = { width: number; height: number; points: ProjectedPoint[]; clusters: ProjectedPoint[] };

function ModifiedLeftPanGuard() {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    let modifiedLeft = false;
    const down = (event: PointerEvent) => { modifiedLeft = event.button === 0 && (event.ctrlKey || event.metaKey || event.shiftKey); };
    const move = (event: PointerEvent) => { if (modifiedLeft && (event.buttons & 1)) event.stopImmediatePropagation(); };
    const up = () => { modifiedLeft = false; };
    canvas.addEventListener('pointerdown',down,true);
    canvas.addEventListener('pointermove',move,true);
    canvas.addEventListener('pointerup',up,true);
    canvas.addEventListener('pointercancel',up,true);
    return () => {
      canvas.removeEventListener('pointerdown',down,true);
      canvas.removeEventListener('pointermove',move,true);
      canvas.removeEventListener('pointerup',up,true);
      canvas.removeEventListener('pointercancel',up,true);
    };
  },[gl]);
  return null;
}

function PaperNode({ paper, selected, highlighted, dimmed, revealIndex, revealStart, onSelect, onRequestAddToChat, onHover }: {
  paper: Paper; selected: boolean; highlighted: boolean; dimmed: boolean; revealIndex: number;
  revealStart: React.RefObject<number>; onSelect: (p: Paper, pos: { x: number; y: number }) => void;
  onRequestAddToChat?: (p: Paper) => void; onHover: (id: string | null) => void;
}) {
  const { camera, gl } = useThree();
  const [hovered, setHovered] = useState(false);
  const surface = useRef<THREE.ShaderMaterial>(null), halo = useRef<THREE.ShaderMaterial>(null);
  const billboard = useRef<THREE.Group>(null), sphere = useRef<THREE.Mesh>(null);
  const radius = paperRadius(paper);
  const phase = stableUnit(paper.id,131)*Math.PI*2;
  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(paper.color).offsetHSL(0,-0.08,0.04) },
    uActive: { value: 0 }, uVisibility: { value: 1 },
  }),[paper.color]);
  const haloUniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(paper.color) }, uTime:{value:0},uPhase:{value:phase},
    uActive:{value:0},uVisibility:{value:1},
  }),[paper.color,phase]);
  useFrame(({ clock },delta) => {
    // A monochrome sphere still rotates, although rotation has no visible texture.
    if (sphere.current) sphere.current.rotation.y = clock.elapsedTime*(0.15+stableUnit(paper.id,17)*0.1);
    if (billboard.current) billboard.current.quaternion.copy(camera.quaternion);
    const arrival = highlighted ? THREE.MathUtils.clamp((clock.elapsedTime-revealStart.current-revealIndex*0.16)/0.65,0,1) : 0;
    const active = selected || hovered ? 1 : arrival;
    const visibility = dimmed && !highlighted && !hovered && !selected ? 0.38 : 1;
    for (const ref of [surface,halo]) {
      if (!ref.current) continue;
      ref.current.uniforms.uActive.value=THREE.MathUtils.damp(ref.current.uniforms.uActive.value,active,5,delta);
      ref.current.uniforms.uVisibility.value=THREE.MathUtils.damp(ref.current.uniforms.uVisibility.value,visibility,4,delta);
    }
    if (halo.current) halo.current.uniforms.uTime.value=clock.elapsedTime;
  });
  return <group position={paper.pos}>
    <mesh ref={sphere}
      onClick={e => {
        if (e.button !== 0 || e.delta > 4) return;
        e.stopPropagation();
        const native=e.nativeEvent as MouseEvent;
        if (native.ctrlKey || native.metaKey || native.shiftKey) { onRequestAddToChat?.(paper); return; }
        const projected=new THREE.Vector3(...paper.pos).project(camera), bounds=gl.domElement.getBoundingClientRect();
        onSelect(paper,{x:bounds.left+(projected.x*0.5+0.5)*bounds.width,y:bounds.top+(-projected.y*0.5+0.5)*bounds.height});
      }}
      onContextMenu={e => { e.stopPropagation(); e.nativeEvent.preventDefault(); onRequestAddToChat?.(paper); }}
      onPointerOver={e => { e.stopPropagation(); setHovered(true); onHover(paper.id); }}
      onPointerOut={() => { setHovered(false); onHover(null); }}
    >
      <sphereGeometry args={[radius,48,32]} />
      <shaderMaterial ref={surface} uniforms={uniforms} vertexShader={PLANET_VERTEX_SHADER} fragmentShader={PLANET_FRAGMENT_SHADER} toneMapped={false} />
    </mesh>
    {/* The center-plane is occluded by the actual sphere: no detached ring. */}
    <group ref={billboard} renderOrder={2}>
      <mesh raycast={() => null}>
        <planeGeometry args={[radius*3.6,radius*3.6]} />
        <shaderMaterial ref={halo} uniforms={haloUniforms} vertexShader={HALO_VERTEX_SHADER} fragmentShader={HALO_FRAGMENT_SHADER}
          transparent depthWrite={false} depthTest blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  </group>;
}

function EdgeConnection({ edge, from, to, selectedId, citedIds, hasFocus }: {
  edge: Edge; from: Paper; to: Paper; selectedId?: string; citedIds: ReadonlySet<string>; hasFocus: boolean;
}) {
  const style=edgeEmphasis(edge,selectedId,citedIds,hasFocus);
  const line=useRef<any>(null);
  const colors=useMemo(() => [new THREE.Color(from.color),new THREE.Color(to.color)],[from.color,to.color]);
  useFrame(({ clock }) => {
    if (line.current && style.animate) line.current.material.opacity=style.opacity*(0.91+Math.sin(clock.elapsedTime*0.65)*0.09);
  });
  return <group>
    <Line ref={line} points={[from.pos,to.pos]} vertexColors={colors} transparent opacity={style.opacity}
      lineWidth={style.width} depthWrite={false} toneMapped={false} raycast={() => null} />
  </group>;
}

function NavigationRig({ view, papers, clusters, controls, onSettled, onInterrupted }: {
  view: GalaxyView; papers: Paper[]; clusters: SemanticCluster[]; controls: React.RefObject<any>;
  onSettled?: (paperId?: string, screenPos?: { x: number; y: number }) => void; onInterrupted?: () => void;
}) {
  const { camera, size, gl }=useThree();
  const callback=useRef(onSettled);
  callback.current=onSettled;
  const interrupted=useRef(onInterrupted);
  interrupted.current=onInterrupted;
  const animation=useRef<{ from:THREE.Vector3; to:THREE.Vector3; targetFrom:THREE.Vector3; targetTo:THREE.Vector3; elapsed:number; duration:number; paperId?:string } | null>(null);
  const destination=useMemo(() => cameraDestination(view,papers,clusters,size.width/Math.max(1,size.height)),[view,papers,clusters,size.width,size.height]);
  useEffect(() => {
    const control=controls.current;
    if (!control) return;
    control.minDistance=destination.minDistance;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    animation.current={
      from:camera.position.clone(),to:new THREE.Vector3(...destination.position),
      targetFrom:control.target.clone(),targetTo:new THREE.Vector3(...destination.target),
      elapsed:0,duration:reduced ? 0 : view.level === 'paper' ? 0.9 : 1.1,
      paperId:view.level === 'paper' ? view.paperId : undefined,
    };
    const cancel=() => { if (animation.current) { animation.current=null; interrupted.current?.(); } };
    control.addEventListener('start',cancel);
    return () => { animation.current=null; control.removeEventListener('start',cancel); };
  },[destination,view,camera,controls]);
  useFrame((_,delta) => {
    const a=animation.current, control=controls.current;
    if (!a || !control) return;
    a.elapsed+=delta;
    const t=a.duration ? Math.min(1,a.elapsed/a.duration) : 1;
    const ease=t*t*t*(t*(t*6-15)+10);
    camera.position.lerpVectors(a.from,a.to,ease);
    control.target.lerpVectors(a.targetFrom,a.targetTo,ease);
    control.update();
    camera.updateMatrixWorld();
    if (t===1) {
      animation.current=null;
      const bounds=gl.domElement.getBoundingClientRect();
      const paper=papers.find(p => p.id===a.paperId);
      const point=paper ? new THREE.Vector3(...paper.pos).project(camera) : new THREE.Vector3();
      callback.current?.(a.paperId,{x:bounds.left+(point.x*0.5+0.5)*size.width,y:bounds.top+(-point.y*0.5+0.5)*size.height});
    }
  },-0.5);
  return null;
}

function ProjectionReporter({ papers, clusters, onProjection }: {
  papers: Paper[]; clusters: SemanticCluster[]; onProjection: (snapshot: ProjectionSnapshot) => void;
}) {
  const { camera, size }=useThree();
  const last=useRef(-1);
  const point=useMemo(() => new THREE.Vector3(),[]);
  const right=useMemo(() => new THREE.Vector3(),[]);
  useFrame(({ clock }) => {
    if (clock.elapsedTime-last.current<0.08) return;
    last.current=clock.elapsedTime;
    camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld,0);
    const project=(id:string,pos:[number,number,number],radius:number):ProjectedPoint | null => {
      if (!pos.every(Number.isFinite)) return null;
      point.set(...pos);
      const distance=point.distanceTo(camera.position);
      point.project(camera);
      if (point.z<-1 || point.z>1 || Math.abs(point.x)>1.04 || Math.abs(point.y)>1.04) return null;
      const x=(point.x*0.5+0.5)*size.width,y=(-point.y*0.5+0.5)*size.height;
      point.set(...pos).addScaledVector(right,radius).project(camera);
      return {id,x,y,distance,radius:Math.abs((point.x*0.5+0.5)*size.width-x)};
    };
    onProjection({
      width:size.width,height:size.height,
      points:papers.map(p => project(p.id,p.pos,paperRadius(p))).filter((p):p is ProjectedPoint => !!p),
      clusters:clusters.map(c => project(String(c.id),[c.center[0],c.center[1]+Math.abs(Math.sin(c.angle))*c.axes[0]+Math.abs(Math.cos(c.angle))*c.axes[1]+0.35,c.center[2]],0.15)).filter((p):p is ProjectedPoint => !!p),
    });
  });
  return null;
}

function GalaxyScene(props: Props) {
  const controls=useRef<any>(null);
  const [hoveredId,setHoveredId]=useState<string | null>(null);
  const { clock }=useThree();
  const revealStart=useRef(0);
  useEffect(() => { revealStart.current=clock.elapsedTime; },[props.queryVisual.sequence,clock]);
  const citedIds=useMemo(() => new Set(props.queryVisual.phase==='sources' ? props.queryVisual.paperIds : []),[props.queryVisual]);
  const highlights=useMemo(() => new Set(props.highlights),[props.highlights]);
  const paperMap=useMemo(() => new Map(props.papers.map(p => [p.id,p])),[props.papers]);
  const selectedId=props.view.level==='paper' ? props.view.paperId : undefined;
  const focusedCluster=props.view.level==='overview' ? undefined : props.view.clusterId;
  const emphasisId=props.hoveredId || hoveredId || selectedId;
  const relatedIds=useMemo(() => {
    const ids=new Set<string>();
    if (emphasisId) { ids.add(emphasisId); props.edges.forEach(e => {
      if (e.source===emphasisId) ids.add(e.target);
      if (e.target===emphasisId) ids.add(e.source);
    }); }
    citedIds.forEach(id => ids.add(id));
    return ids;
  },[emphasisId,props.edges,citedIds]);
  return <>
    <color attach="background" args={['#02050b']} />
    <FreeStars highQuality={props.graphicsQuality==='research'} />
    <SemanticNebulaField clusters={props.clusters} quality={props.graphicsQuality} focusedCluster={focusedCluster} />
    {props.edges.map((edge,i) => {
      const from=paperMap.get(edge.source),to=paperMap.get(edge.target);
      return from && to ? <EdgeConnection key={`${edge.source}:${edge.target}:${i}`} edge={edge} from={from} to={to} selectedId={emphasisId}
        citedIds={citedIds} hasFocus={!!emphasisId || citedIds.size>0 || focusedCluster!==undefined} /> : null;
    })}
    {props.papers.filter(paper => paper.pos.every(Number.isFinite)).map(paper => <PaperNode key={paper.id} paper={paper} selected={selectedId===paper.id || props.hoveredId===paper.id}
      highlighted={highlights.has(paper.id)} revealIndex={Math.max(0,props.queryVisual.paperIds.indexOf(paper.id))} revealStart={revealStart}
      dimmed={(focusedCluster!==undefined && paper.cluster!==focusedCluster) || (relatedIds.size>0 && !relatedIds.has(paper.id) && !highlights.has(paper.id))}
      onSelect={props.onSelect} onRequestAddToChat={props.onRequestAddToChat}
      onHover={id => { setHoveredId(id); props.onHover(id); }} />)}
    <ModifiedLeftPanGuard />
    <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.065} enablePan screenSpacePanning
      rotateSpeed={0.5} panSpeed={0.7} mouseButtons={{LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.PAN}}
      minDistance={1.3} maxDistance={250} />
    <NavigationRig view={props.view} papers={props.papers} clusters={props.clusters} controls={controls}
      onSettled={props.onNavigationSettled} onInterrupted={props.onNavigationInterrupted} />
    <ProjectionReporter papers={props.papers} clusters={props.clusters} onProjection={props.onProjection} />
    <EffectComposer multisampling={0}>
      <Bloom luminanceThreshold={1.05} luminanceSmoothing={0.18} intensity={0.72} mipmapBlur radius={0.45} />
      <Vignette eskil={false} offset={0.18} darkness={0.38} />
    </EffectComposer>
  </>;
}

type Props = {
  papers:Paper[]; edges:Edge[]; clusters:SemanticCluster[]; view:GalaxyView; queryVisual:QueryVisual;
  onSelect:(p:Paper,screenPos:{x:number;y:number})=>void; onRequestAddToChat?:(p:Paper)=>void;
  highlights:string[]; hoveredId:string|null; onHover:(id:string|null)=>void; onProjection:(snapshot:ProjectionSnapshot)=>void;
  onNavigationSettled?:(paperId?:string,screenPos?:{x:number;y:number})=>void; onNavigationInterrupted?:()=>void;
  graphicsQuality:GraphicsQuality;
};

export const GalaxyRenderer=React.memo(function GalaxyRenderer(props:Props) {
  return <div className="absolute inset-0" onContextMenu={e => e.preventDefault()}>
    <Canvas camera={{position:[0,0,32],fov:45,near:0.04,far:600}}
      dpr={props.graphicsQuality==='research' ? [1,1.75] : [0.85,1.25]}
      gl={{antialias:true,toneMapping:THREE.ACESFilmicToneMapping,powerPreference:'high-performance'}}>
      <GalaxyScene {...props} />
    </Canvas>
  </div>;
});
