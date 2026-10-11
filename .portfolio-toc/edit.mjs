import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {FileBlob,PresentationFile} from 'file:///C:/Users/Asus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
import {finalizePresentation} from 'file:///C:/Users/Asus/.codex/plugins/cache/openai-primary-runtime/presentations/26.1009.11318/skills/presentations/container_tools/artifact_tool_utils.mjs';
const ROOT='C:/Users/Asus/Desktop/PDF_GalaxAI',DIR=ROOT+'/.portfolio-toc';
const SOURCE='C:/Users/Asus/Desktop/作品集/PDF_GalaxAI_Portfolio_LiShouchuan.pptx';
const SKILL='C:/Users/Asus/.codex/plugins/cache/openai-primary-runtime/presentations/26.1009.11318/skills/presentations';
process.env.RUNTIME_NODE_MODULES='C:/Users/Asus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const C={navy:'#101B40',muted:'#536681',blue:'#8FA4C1'};
const bytes=await fs.readFile(SOURCE),sourceHash=crypto.createHash('sha256').update(bytes).digest('hex');
await fs.writeFile(DIR+'/original.pptx',bytes);
const p=await PresentationFile.importPptx(await FileBlob.load(SOURCE));
if(p.slides.items.length!==9)throw new Error('Expected nine slides in current source.');
const originals=[...p.slides.items],arch=originals[6];
function tx(s,text,x,y,w,h,size=30,bold=false,color=C.navy,font){
 const q=s.shapes.add({geometry:'textbox',name:text,position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 q.text=text;q.text.style={typeface:font||(bold?'Montserrat Bold':'Montserrat'),fontSize:size,bold,color,insets:0,alignment:'left',verticalAlignment:'top',autoFit:'none',wrap:'square'};return q;
}
function find(s,text){const q=s.shapes.items.find(q=>q.text.toString()===text);if(!q)throw new Error('Missing anchor: '+text);return q;}
function relocate(s,text,pos,size){const q=find(s,text);q.position=pos;if(size)q.text.style={...q.text.style,fontSize:size};return q;}

// Reuse the source slide's own background, layout and navigation for a contents page.
const toc=originals[1].duplicate();
const records=(await p.inspect({kind:'shape,textbox,image',maxChars:500000})).ndjson.split('\n').filter(Boolean).map(x=>JSON.parse(x));
const tocIndex=p.slides.items.findIndex(s=>s.id===toc.id);
p.delete(records.filter(r=>r.slideIndex===tocIndex&&r.position&&r.position.top>=180&&r.position.top<1000).map(r=>r.id));
toc.moveTo(1);
tx(toc,'Contents',130,205,1645,88,59,true);
tx(toc,'The design rationale, interaction system and engineering behind PDF-GalaxAI.',132,305,1615,85,30,false,C.muted);
const sections=[
 ['01','User Problems & Product Workflow','Research needs and the connected reading experience','03–04'],
 ['02','3D Semantic Knowledge Visualisation','Semantic relationships and interactive exploration','05'],
 ['03','RAG, Evidence & System Architecture','Document processing, source verification and integration','06–08'],
 ['04','Engineering Decisions & Reflection','Implementation trade-offs, evaluation and practical value','09–10']
];
for(let i=0;i<sections.length;i++){
 const [number,title,detail,pages]=sections[i],y=425+i*138;
 tx(toc,number,132,y,110,72,49,true,C.muted);
 tx(toc,title,290,y+3,1190,62,36,true);
 tx(toc,detail,290,y+65,1210,48,26,false,C.muted);
 const q=tx(toc,pages,1540,y+9,230,60,36,true);q.text.style={...q.text.style,alignment:'right'};
}
toc.speakerNotes.text='Portfolio structure: pages 3–4 explain research needs and the user workflow. Page 5 explains semantic exploration. Pages 6–8 connect retrieval, original-source reading and system integration. Pages 9–10 discuss engineering choices, evaluation and reflection.';

// Compress the existing native architecture diagram vertically; retain all six modules.
const shapes=arch.shapes.items;
const topFrames=shapes.filter(q=>q.position.top===425&&q.text.toString()==='');
const bottomFrames=shapes.filter(q=>q.position.top===745&&q.text.toString()==='');
for(const q of topFrames)q.position={...q.position,top:365,height:110};
for(const q of bottomFrames)q.position={...q.position,top:495,height:110};
const textMap=[
 ['React web application',152,378,446,'Vite + TypeScript\nShared paper and interaction state'],
 ['FastAPI service',757,378,481,'Upload, graph, query and file APIs\nProvider resolution and error states'],
 ['Inference providers',1397,378,356,'Local Ollama\nGemini / OpenAI-compatible APIs'],
 ['Interaction modules',152,508,446,'Three.js / GLSL galaxy\nPDF.js reader and chat'],
 ['Processing modules',757,508,481,'Parsing, chunking, embeddings\nKMeans, UMAP/PCA, retrieval'],
 ['Local persistence',1397,508,356,'PDF files + JSON metadata\nChroma paper and chunk vectors']
];
for(const [title,x,y,w,body] of textMap){
 relocate(arch,title,{left:x,top:y,width:w,height:36},26);
 const q=relocate(arch,body,{left:x,top:y+38,width:w,height:52},22);
 if(title==='Inference providers')q.text='Local Ollama\nCloud Gemini / OpenAI APIs';
 if(title==='FastAPI service')q.text='Upload, graph, query and file APIs\nProvider routing and error states';
 if(title==='Local persistence')q.text='PDF files + JSON metadata\nChroma paper / chunk vectors';
}
for(const q of shapes){const pos=q.position;
 if(pos.top===522.5&&pos.height===0)q.position={...pos,top:420};
 else if(pos.top===620&&pos.width===0)q.position={...pos,top:475,height:20};
 else if(pos.top===832.5&&pos.height===0)q.position={...pos,top:550};
}
relocate(arch,'A shared paper identity connects semantic processing, WebGL exploration and evidence-based reading.',{left:132,top:305,width:1615,height:47});
relocate(arch,'Privacy decision: files and vectors stay local. Cloud inference receives the selected context and any submitted image.',{left:130,top:620,width:1645,height:36},22);
function slot(x,title,label){
 tx(arch,title,x,670,795,40,27,true);
 const frame=arch.shapes.add({geometry:'roundRect',name:'Screenshot placeholder: '+title,position:{left:x,top:720,width:795,height:270},fill:'none',line:{fill:C.blue,width:1.7},borderRadius:18});
 const q=tx(arch,label,x+30,822,735,76,28,false,C.muted,'Microsoft YaHei');
 q.text.style={...q.text.style,alignment:'center',verticalAlignment:'middle'};
 return frame;
}
slot(130,'User-controlled model integration','【此处放模型管理与连接测试截图】');
slot(980,'Backend API communication','【此处放后端接口文档截图】');
arch.speakerNotes.text += '\n\nSuggested evidence crops: show the model manager with its provider configuration and connection-test control (hide any API keys). Show the FastAPI /docs page with upload, graph, query and file endpoints. Both are observable software interfaces, while the native diagram explains module relationships. Source anchors: frontend/src/ui/ModelManager.tsx; backend/api.py (FastAPI application and API routes).';

// Update page markers without changing user-provided screenshots, text or identity.
for(let i=0;i<10;i++){
 const s=p.slides.items[i];
 for(const q of s.shapes.items){const text=q.text.toString(),pos=q.position;
  if(/^\d{2}\s*\/\s*09$/.test(text))q.text=String(i+1).padStart(2,'0')+' / 10';
  else if(pos.left>1700&&pos.top<150&&/^\d{2}$/.test(text))q.text=String(i+1).padStart(2,'0');
 }
}
// Keep the contents in the vision section using the source navigation treatment.
for(const q of toc.shapes.items){const text=q.text.toString();
 if(['VISION','DESIGN','SYSTEM','REVIEW'].includes(text))q.text.style={...q.text.style,color:text==='VISION'?'#FFFFFF':C.navy,bold:text==='VISION'};
 else if(q.name.startsWith('Freeform')&&q.position.top<160&&q.position.width<190&&q.position.height<80)q.position={left:477,top:66,width:154,height:62};
}
await fs.mkdir(DIR+'/after',{recursive:true});await fs.mkdir(DIR+'/output',{recursive:true});
await(await PresentationFile.exportPptx(p)).save(DIR+'/candidate.pptx');
for(let i=0;i<10;i++){
 const s=p.slides.items[i];await fs.writeFile(DIR+`/after/slide-${i+1}.png`,new Uint8Array(await(await p.export({slide:s,format:'png',scale:0.75})).arrayBuffer()));
 await fs.writeFile(DIR+`/after/slide-${i+1}.layout.json`,await(await s.export({format:'layout'})).text());
}
await fs.writeFile(DIR+'/source-hash.txt',sourceHash);
const final=await finalizePresentation({workspaceDir:ROOT,candidatePath:DIR+'/candidate.pptx',finalPath:DIR+'/output/final10-v2.pptx',explicitTotalSlideCount:10,pythonExecutable:'C:/Users/Asus/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',integrityValidatorPath:SKILL+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:SKILL+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','18288000,10287000','--validate-heading-fit'],requiredNativeTableOwnerSlides:[],fontPolicy:{basis:'reference',families:['Montserrat','Montserrat Bold'],referencePath:SOURCE,referenceSha256:sourceHash,scriptFonts:{ea:'Microsoft YaHei'}},verifyArtifactToolImport:true,receiptPath:DIR+'/validation-v2.json'});
console.log(JSON.stringify({path:final.finalPath,slides:final.packageIntegrity.slide_count,findings:final.presentationLayout.findingCount}));
