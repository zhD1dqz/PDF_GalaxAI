// Run pure renderer logic without a browser, PDFs, API keys, or new packages.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const THREE = require('three');

function loadTS(name) {
  const filename = path.resolve(__dirname,'../frontend/src/rendering',name);
  const code = ts.transpileModule(fs.readFileSync(filename,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
  }).outputText;
  const compiled = new Module(filename,module);
  compiled.filename=filename;
  compiled.paths=module.paths;
  compiled.require=request => request.startsWith('./') ? loadTS(`${request.replace(/^\.\//,'')}.ts`) : module.require(request);
  compiled._compile(code,filename);
  return compiled.exports;
}
const { buildSemanticClusters, cameraDestination, edgeEmphasis, citationPaperIds, paperRadius, stableUnit } = loadTS('galaxyModel.ts');
const { placeLabels } = loadTS('labelLayout.ts');
const { PLANET_FRAGMENT_SHADER, HALO_FRAGMENT_SHADER } = loadTS('planetShaders.ts');
const { createPeripheralStars } = loadTS('peripheralStars.ts');
const { createFreeStarField, freeStarOffset } = loadTS('freeStarField.ts');
const paper = (id,pos,cluster=0) => ({id,pos,cluster,color:'#60a5fa',confidence:0.8,field:'Graphics',filename:`${id}.pdf`,title:id,keywords:[]});

test('cloud covariance follows the paper distribution without changing coordinates', () => {
  const papers=[paper('a',[-3,-3,0]),paper('b',[0,0,0]),paper('c',[3,3,0])];
  const original=JSON.stringify(papers);
  const [cluster]=buildSemanticClusters(papers);
  assert.equal(JSON.stringify(papers),original);
  assert.deepEqual(cluster.center,[0,0,0]);
  assert.ok(Math.abs(cluster.angle-Math.PI/4)<1e-8);
  assert.ok(cluster.axes[0]>cluster.axes[1]*2);
  assert.deepEqual(cluster.paperIds,['a','b','c']);
});
test('sparse, coincident and invalid data do not produce NaN cloud parameters', () => {
  const clusters=buildSemanticClusters([paper('a',[0,0,0]),paper('b',[0,0,0]),paper('bad',[NaN,0,0])]);
  assert.equal(clusters[0].paperCount,2);
  for (const value of [...clusters[0].center,...clusters[0].axes,clusters[0].angle]) assert.ok(Number.isFinite(value));
  assert.deepEqual(buildSemanticClusters([]),[]);
});
test('clusters have stable distinct morphologies and membership', () => {
  const papers=[0,1,2,3].map(id => paper(`p${id}`,[id*4,0,0],id));
  const clusters=buildSemanticClusters(papers);
  assert.equal(clusters.length,4);
  assert.equal(new Set(clusters.map(c=>c.morphology)).size,3);
  assert.deepEqual(buildSemanticClusters(papers),clusters);
  assert.equal(stableUnit('a',4),stableUnit('a',4));
});
test('overview fits all paper bounds in portrait and landscape viewports', () => {
  const papers=[paper('a',[-10,-5,-2]),paper('b',[10,5,2])];
  for (const aspect of [0.4,1,2]) {
    const destination=cameraDestination({level:'overview'},papers,buildSemanticClusters(papers),aspect);
    const depth=destination.position[2]-2;
    assert.ok(depth*Math.tan(Math.PI/8)*aspect>10);
    assert.ok(depth*Math.tan(Math.PI/8)>5);
  }
});
test('topic and paper navigation zoom progressively and empty libraries are safe', () => {
  const papers=[paper('a',[-9,0,0],0),paper('b',[-7,1,0],0),paper('c',[9,0,0],1)];
  const clusters=buildSemanticClusters(papers);
  const full=cameraDestination({level:'overview'},papers,clusters,1.5);
  const topic=cameraDestination({level:'cluster',clusterId:0},papers,clusters,1.5);
  const detail=cameraDestination({level:'paper',clusterId:0,paperId:'a'},papers,clusters,1.5);
  assert.ok(full.position[2]>topic.position[2]);
  assert.ok(topic.position[2]>detail.position[2]);
  assert.ok(detail.minDistance<detail.position[2]);
  assert.ok(cameraDestination({level:'overview'},[],[],1).position.every(Number.isFinite));
  assert.ok(cameraDestination({level:'overview'},[paper('bad',[NaN,NaN,NaN])],[],1).position.every(Number.isFinite));
});
test('semantic weight influences line strength; only edges between real cited nodes animate', () => {
  const weak=edgeEmphasis({source:'a',target:'b',weight:0.1},undefined,new Set(),false);
  const strong=edgeEmphasis({source:'a',target:'b',weight:0.9},undefined,new Set(),false);
  assert.ok(strong.opacity>weak.opacity);
  assert.equal(edgeEmphasis({source:'a',target:'b',weight:0.9},'a',new Set(['a']),true).animate,false);
  assert.equal(edgeEmphasis({source:'a',target:'b',weight:0.9},undefined,new Set(['a','b']),true).animate,true);
});
test('citations combine explicit IDs, details and original answer markers without duplicates', () => {
  assert.deepEqual(citationPaperIds({cites:['a',{paper_id:'b'},''],cite_details:[{paper_id:'a'},{paper_id:'c'}],answer:'[CITE:d-123] [CITE:a]'}),['a','b','c','d-123']);
  assert.deepEqual(citationPaperIds({cites:[],answer:'General chat answer.'}),[]);
  assert.deepEqual(citationPaperIds({cites:[],cite_details:[],answer:'[CITE:hyphen-id]'}),['hyphen-id']);
});
test('full filename mode retains dense coincident anchors and respects viewport bounds', () => {
  const anchors=Array.from({length:12},(_,i)=>({id:String(i),x:450,y:300,width:140,height:24,priority:i===0?100:20,radius:10}));
  const reserved=[{x:0,y:0,width:900,height:110}];
  const result=placeLabels(anchors,900,600,reserved);
  assert.equal(result.length,12);
  assert.equal(result[0].id,'0');
  assert.deepEqual(placeLabels(anchors,900,600,reserved),result);
  for (const label of result) {
    assert.ok(label.left>=12 && label.left+label.width<=888);
    assert.ok(label.top>=110 && label.top+label.height<=588);
  }
});
test('filename placement avoids overlap where screen space is available', () => {
  const anchors=Array.from({length:6},(_,i)=>({id:String(i),x:450,y:300,width:100,height:24,priority:20,radius:10}));
  const result=placeLabels(anchors,1000,700);
  for (let i=0;i<result.length;i++) for (let j=i+1;j<result.length;j++) {
    const a=result[i],b=result[j];
    const area=Math.max(0,Math.min(a.left+a.width,b.left+b.width)-Math.max(a.left,b.left))
      *Math.max(0,Math.min(a.top+a.height,b.top+b.height)-Math.max(a.top,b.top));
    assert.equal(area,0);
  }
});
test('pure-color planets omit lunar noise and halo density decays outward', () => {
  assert.doesNotMatch(PLANET_FRAGMENT_SHADER,/fbm|noise3|crater|maria/);
  assert.match(HALO_FRAGMENT_SHADER,/exp\(-distanceFromSurface\*10\.5/);
  const alpha=d=>(Math.exp(-d*10.5)*0.38+Math.exp(-d*5.8)*0.105);
  assert.ok(alpha(0)>alpha(0.1) && alpha(0.1)>alpha(0.3) && alpha(0.3)>alpha(0.6));
  assert.ok(alpha(0.6)<alpha(0)*0.02);
  assert.ok(Number.isFinite(paperRadius(paper('a',[0,0,0]))));
});

test('all planets emit in the default state and retain a rapidly fading halo', () => {
  assert.match(PLANET_FRAGMENT_SHADER,/0\.85\+0\.30\+diffuse\*0\.90/);
  assert.match(PLANET_FRAGMENT_SHADER,/1\.70\+uActive\*0\.45/);
  assert.match(HALO_FRAGMENT_SHADER,/inner\*0\.38\+mist\*0\.105/);
  // Edge luminance in each current topic color exceeds the unchanged Bloom threshold.
  for (const hex of ['#60a5fa','#f59e0b','#10b981','#a78bfa']) {
    const base = new THREE.Color(hex).offsetHSL(0,-0.08,0.04);
    const edge = base.clone().lerp(new THREE.Color().setRGB(0.90,0.96,1.0),0.54).multiplyScalar(1.70);
    const luminance = edge.r*0.2126+edge.g*0.7152+edge.b*0.0722;
    assert.ok(luminance>1.05,`Non-selected ${hex} edge cannot contribute to Bloom`);
  }
});

test('independent stars fill the surrounding sky, not just nebula bands', () => {
  const stars = createFreeStarField(true);
  assert.equal(stars.phases.length,9000);
  assert.equal(createFreeStarField(false).phases.length,5200);
  assert.deepEqual(createFreeStarField(true),stars);
  const octants = new Set();
  for (let i=0;i<stars.phases.length;i++) {
    const p=[...stars.positions.slice(i*3,i*3+3)];
    const radius=Math.hypot(...p);
    assert.ok(radius>=41.99 && radius<=110.01);
    octants.add(p.map(v=>v>=0?'1':'0').join(''));
  }
  assert.equal(octants.size,8);
});

test('free stars change position independently while remaining in deep space', () => {
  const stars=createFreeStarField(true);
  let moving=0;
  for(let i=0;i<stars.phases.length;i++) {
    const velocity=[...stars.velocities.slice(i*3,i*3+3)];
    const start=freeStarOffset(0,stars.phases[i],velocity);
    assert.ok(start.every(v=>Math.abs(v)<1e-9));
    const offset=freeStarOffset(6,stars.phases[i],velocity);
    if(Math.hypot(...offset)>0.15) moving++;
    assert.ok(Math.hypot(...freeStarOffset(10000,stars.phases[i],velocity))<6.0);
  }
  assert.ok(moving>stars.phases.length*0.70,'Most stars must really move, not merely twinkle');
});

test('restored decorative stars stay outside the nebula core throughout their orbit', () => {
  const stars=createPeripheralStars(0,6,true);
  assert.equal(stars.positions.length/3,456);
  for (let i=0;i<stars.phases.length;i++) {
    const radius=Math.hypot(stars.positions[i*3],stars.positions[i*3+1]);
    assert.ok(radius>=1.019 && radius<=1.551);
    assert.ok(radius*0.985>1.0,'Breathing drift entered the nebula core');
    assert.ok(Math.abs(stars.speeds[i])>=0.0649 && Math.abs(stars.speeds[i])<=0.1301);
  }
  const speed=stars.speeds[0],radius=Math.hypot(stars.positions[0],stars.positions[1]);
  assert.ok(2*radius*Math.sin(speed*10/2)>0.6,'Motion must be an orbit, not imperceptible jitter');
});
test('star quality modes are deterministic and cap decorative particle counts', () => {
  assert.deepEqual(createPeripheralStars(2,6,true),createPeripheralStars(2,6,true));
  assert.ok(createPeripheralStars(1,6,false).phases.length<createPeripheralStars(1,6,true).phases.length);
  assert.equal(createPeripheralStars(1,10000,true).phases.length,2400);
  assert.equal(createPeripheralStars(1,10000,false).phases.length,1200);
});
test('cloud has continuous mist and semantic links no longer create floating marker spheres', () => {
  const nebula=fs.readFileSync(path.resolve(__dirname,'../frontend/src/rendering/SemanticNebula.tsx'),'utf8');
  const renderer=fs.readFileSync(path.resolve(__dirname,'../frontend/src/rendering/GalaxyRenderer.tsx'),'utf8');
  assert.match(nebula,/0\.14\+filaments\*0\.94/);
  assert.match(nebula,/acc\.a\*0\.70/);
  assert.doesNotMatch(renderer,/ref=\{tracer\}|sphereGeometry args=\{\[0\.025/);
});

const localMetadata=path.resolve(__dirname,'../backend/data/papers.json');
test('optional local library: overview includes every document and full mode retains its filenames', {skip:!fs.existsSync(localMetadata)}, () => {
  const papers=JSON.parse(fs.readFileSync(localMetadata,'utf8')).papers;
  const before=JSON.stringify(papers);
  const clusters=buildSemanticClusters(papers);
  const width=836,height=800;
  const destination=cameraDestination({level:'overview'},papers,clusters,width/height);
  const camera=new THREE.PerspectiveCamera(45,width/height,0.04,600);
  camera.position.set(...destination.position);
  camera.lookAt(new THREE.Vector3(...destination.target));
  camera.updateMatrixWorld();
  const anchors=papers.map(p => {
    const v=new THREE.Vector3(...p.pos).project(camera);
    assert.ok(Math.abs(v.x)<1 && Math.abs(v.y)<1 && v.z<1 && v.z>-1,`Off-screen document: ${p.id}`);
    return {id:p.id,x:(v.x*.5+.5)*width,y:(-v.y*.5+.5)*height,width:140,height:24,priority:20,radius:10};
  });
  const labels=placeLabels(anchors,width,height,[{x:0,y:0,width,height:130},{x:0,y:height-104,width,height:104}]);
  assert.equal(labels.length,papers.length);
  assert.equal(JSON.stringify(papers),before);
  console.log(`Local library: ${papers.length} documents, ${clusters.length} topic clouds, ${labels.length} filenames; coordinates unchanged.`);
});
