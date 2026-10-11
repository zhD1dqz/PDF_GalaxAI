import fs from 'node:fs/promises';
import {FileBlob,PresentationFile} from 'file:///C:/Users/Asus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const d='C:/Users/Asus/Desktop/PDF_GalaxAI/.portfolio-toc';
await fs.mkdir(d+'/before',{recursive:true});
const p=await PresentationFile.importPptx(await FileBlob.load('C:/Users/Asus/Desktop/作品集/PDF_GalaxAI_Portfolio_LiShouchuan.pptx'));
await fs.writeFile(d+'/inspect.ndjson',(await p.inspect({kind:'slide,shape,textbox,image,table,layout',maxChars:400000})).ndjson);
for(let i=0;i<p.slides.items.length;i++)await fs.writeFile(d+`/before/slide-${i+1}.png`,new Uint8Array(await(await p.export({slide:p.slides.items[i],format:'png',scale:0.75})).arrayBuffer()));
console.log('Rendered source:',p.slides.items.length);
