import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {FileBlob,PresentationFile} from 'file:///C:/Users/Asus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
import {finalizePresentation} from 'file:///C:/Users/Asus/.codex/plugins/cache/openai-primary-runtime/presentations/26.1009.11318/skills/presentations/container_tools/artifact_tool_utils.mjs';
const ROOT='C:/Users/Asus/Desktop/PDF_GalaxAI';
const DIR=ROOT+'/.portfolio-compress';
const SOURCE='C:/Users/Asus/Desktop/作品集/PDF_GalaxAI_Portfolio_LiShouchuan.pptx';
const SKILL='C:/Users/Asus/.codex/plugins/cache/openai-primary-runtime/presentations/26.1009.11318/skills/presentations';
process.env.RUNTIME_NODE_MODULES='C:/Users/Asus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const C={navy:'#101B40',blue:'#8FA4C1',muted:'#536681',white:'#FFFFFF'};
try{
 const p=await PresentationFile.importPptx(await FileBlob.load(SOURCE));
 if(p.slides.items.length!==12)throw new Error('The current source is no longer a 12-slide deck.');
 const original=[...p.slides.items];
 const originalBodies=original.map(s=>s.speakerNotes.text);
 const sourceHash=crypto.createHash('sha256').update(await fs.readFile(SOURCE)).digest('hex');
 await fs.writeFile(DIR+'/original.pptx',await fs.readFile(SOURCE));
 const records=(await p.inspect({kind:'shape,textbox,image',maxChars:400000})).ndjson.split('\n').filter(Boolean).map(x=>JSON.parse(x));
 function replace(s,oldText,newText){const q=s.shapes.items.find(x=>x.text.toString()===oldText);if(!q)throw new Error('Missing source text: '+oldText);q.text=newText;return q;}
 function tx(s,text,x,y,w,h,size=28,bold=false,color=C.navy){
  const q=s.shapes.add({geometry:'textbox',name:text.slice(0,70),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
  q.text=text;q.text.style={typeface:bold?'Montserrat Bold':'Montserrat',fontSize:size,bold,color,insets:0,alignment:'left',verticalAlignment:'top',autoFit:'none',wrap:'square'};return q;
 }
 function box(s,title,body,x,y){
  const q=s.shapes.add({geometry:'roundRect',name:title,position:{left:x,top:y,width:300,height:160},fill:C.white,line:{fill:C.blue,width:1.7},borderRadius:18});
  tx(s,title,x+17,y+19,266,48,28,true);tx(s,body,x+17,y+78,266,67,25,false,C.muted);return q;
 }
 function arrow(s,a,b,from='right',to='left'){
  const q=s.shapes.connect(a,b,{kind:'straight',fromSide:from,toSide:to,line:{fill:C.blue,width:3},tail:{type:'triangle',width:'med',length:'med'}});q.bringToFront();
 }

 // Merge the existing product concept into the existing workflow slide.
 const workflow=original[8];
 replace(workflow,'Interactive Workflow & Model Choice','Product Concept & Workflow');
 replace(workflow,'The same workspace supports broad discovery and focused reading with a user-selected inference provider.','A selected paper links galaxy exploration, contextual questions and original-source reading.');
 replace(workflow,'Select or search a paper','Select a paper in the galaxy');
 replace(workflow,'Choose context and mode','Add a reference and choose a model');
 replace(workflow,'Open cited source text','Open the cited page in the reader');
 workflow.speakerNotes.text=originalBodies[2]+'\n\n'+originalBodies[8];

 // Merge PDF processing and dual indexing into the existing RAG slide.
 const rag=original[5];
 const frameRecord=records.find(r=>r.slideIndex===5&&r.name?.startsWith('Screenshot placeholder:'));
 const labelRecord=records.find(r=>r.slideIndex===5&&r.text==='【此处放智能文献问答截图】');
 const cropRecord=records.find(r=>r.slideIndex===5&&r.text==='Interface crop');
 if(!frameRecord||!labelRecord||!cropRecord)throw new Error('The existing RAG screenshot slot was not found.');
 const keepIds=new Set([frameRecord.id,labelRecord.id,cropRecord.id]);
 p.delete(records.filter(r=>r.slideIndex===5&&r.position&&r.position.top>=180&&r.position.top<1000&&!keepIds.has(r.id)).map(r=>r.id));
 const frame=p.resolve(frameRecord.id),label=p.resolve(labelRecord.id),crop=p.resolve(cropRecord.id);
 frame.position={left:1200,top:425,width:575,height:540};
 label.position={left:1222,top:650,width:531,height:78};
 crop.text='Chat panel crop';crop.position={left:1595,top:443,width:155,height:56};
 tx(rag,'PDF Processing & RAG Engineering',130,205,1645,88,59,true);
 tx(rag,'Paper vectors organise the collection. Passage vectors support contextual question answering.',132,305,1615,85,30,false,C.muted);
 const a=box(rag,'Parse PDF','Native text / OCR\nOptional MinerU',130,425);
 const b=box(rag,'Prepare text','Abstract + keywords\nOverlapping chunks',490,425);
 const c=box(rag,'BGE-M3 + Chroma','Two vector indexes\nLocal Chroma store',850,425);
 const d=box(rag,'Retrieve passages','Question vector\nPaper context',850,665);
 const e=box(rag,'Rerank evidence','Semantic + lexical\nText quality',490,665);
 const f=box(rag,'Generate answer','Local / cloud model\nAnswer + sources',130,665);
 arrow(rag,a,b);arrow(rag,b,c);arrow(rag,c,d,'bottom','top');arrow(rag,d,e,'left','right');arrow(rag,e,f,'left','right');
 tx(rag,'Two indexes, two tasks',130,863,1005,42,31,true);
 tx(rag,'Paper vectors map topics. Passage vectors support RAG.',130,914,1005,44,26,false,C.muted);
 tx(rag,'Auto / RAG / Chat modes make retrieval behaviour explicit.',130,958,1005,38,25,false,C.muted);
 tx(rag,'Source evidence needs human review.',1200,978,575,32,23,true);
 rag.speakerNotes.text=originalBodies[4]+'\n\n'+originalBodies[5];

 // Merge evaluation evidence into the existing engineering-decision matrix.
 const engineering=original[9];
 replace(engineering,'Engineering Challenges & Design Decisions','Engineering Decisions & Evaluation');
 replace(engineering,'I translated interaction failures into explicit rendering, retrieval and recovery rules.','Implementation choices and test evidence show what works and what still needs evaluation.');
 replace(engineering,'Reliability: connection checks, index warnings, parser fallback and graph-refresh retries support recovery.','Validation: frontend build passes. Earlier manual tests cover previews, tooltips and nebula visibility.');
 engineering.speakerNotes.text=originalBodies[9]+'\n\n'+originalBodies[10];

 // Keep the existing nine owner slides, then place the workflow before the galaxy.
 p.slides.keep([0,1,3,5,6,7,8,9,11]);
 workflow.moveTo(2);
 const expected=[original[0],original[1],workflow,original[3],rag,original[6],original[7],engineering,original[11]].map(s=>s.id);
 if(JSON.stringify(p.slides.items.map(s=>s.id))!==JSON.stringify(expected))throw new Error('Unexpected final slide order.');
 for(let i=0;i<9;i++){
  const s=p.slides.items[i],active=i===0?0:i<=3?1:i<=6?2:3;
  for(const q of s.shapes.items){const text=q.text.toString(),pos=q.position;
   if(/^\d{2}\s*\/\s*12$/.test(text))q.text=String(i+1).padStart(2,'0')+' / 09';
   else if(pos.left>1700&&pos.top<150&&/^\d{2}$/.test(text))q.text=String(i+1).padStart(2,'0');
   else if(['VISION','DESIGN','SYSTEM','REVIEW'].includes(text)){
    const n=['VISION','DESIGN','SYSTEM','REVIEW'].indexOf(text);
    q.text.style={typeface:'Montserrat',fontSize:24,color:n===active?'#FFFFFF':C.navy,bold:n===active,alignment:'center',insets:0};
   }else if(q.name.startsWith('Freeform')&&pos.top<160&&pos.width>140&&pos.width<190&&pos.height<80){
    q.position={left:[477,740,993,1244][active],top:66,width:active===2?175:active===3?179:154,height:62};
   }
  }
 }
 await fs.mkdir(DIR+'/after',{recursive:true});await fs.mkdir(DIR+'/output',{recursive:true});
 await(await PresentationFile.exportPptx(p)).save(DIR+'/candidate.pptx');
 for(let i=0;i<9;i++){
  const s=p.slides.items[i];await fs.writeFile(DIR+`/after/slide-${i+1}.png`,new Uint8Array(await(await p.export({slide:s,format:'png',scale:0.75})).arrayBuffer()));
  await fs.writeFile(DIR+`/after/slide-${i+1}.layout.json`,await(await s.export({format:'layout'})).text());
 }
 await fs.writeFile(DIR+'/merge-map.json',JSON.stringify({source:SOURCE,sourceSha256:sourceHash,originalSlideCount:12,finalSlideCount:9,map:[[1],[2],[3,9],[4],[5,6],[7],[8],[10,11],[12]],existingSlidesReused:9,bodyUnchangedPages:[1,2,4,6,7,9]},null,2));
 const final=await finalizePresentation({workspaceDir:ROOT,candidatePath:DIR+'/candidate.pptx',finalPath:DIR+'/output/final9-v2.pptx',explicitTotalSlideCount:9,pythonExecutable:'C:/Users/Asus/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',integrityValidatorPath:SKILL+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:SKILL+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','18288000,10287000','--validate-heading-fit'],requiredNativeTableOwnerSlides:[],fontPolicy:{basis:'reference',families:['Montserrat','Montserrat Bold'],referencePath:SOURCE,referenceSha256:sourceHash,scriptFonts:{ea:'Microsoft YaHei'}},verifyArtifactToolImport:true,receiptPath:DIR+'/validation-v2.json'});
 console.log(JSON.stringify({finalPath:final.finalPath,slides:final.packageIntegrity.slide_count,findings:final.presentationLayout.findingCount,importPassed:final.firstPartyImport.passed}));
}catch(e){console.error(e.message);console.error(String(e.stack).split('\n').filter(x=>x.includes('compact.mjs')).join('\n'));process.exitCode=1;}
