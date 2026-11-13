// Synthetic processes only: never load application PDFs, models or settings.
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const self=fileURLToPath(import.meta.url);
if(process.argv[2]==='--owner') {
  const child=spawn(process.argv[3],['-u',process.argv[4],process.execPath,self],{windowsHide:true,stdio:['pipe','pipe','inherit']});
  child.stdout.pipe(process.stdout);
  child.once('exit',code=>{process.exitCode=code;});
} else if(process.argv[2]==='--leaf') {
  const role=process.argv[3];
  const server=net.createServer(socket=>socket.end());
  server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({role,pid:process.pid,port:server.address().port})));
  if(role==='backend')spawn(process.execPath,[self,'--leaf','worker'],{windowsHide:true,stdio:['ignore','inherit','inherit']});
} else {
  for(const role of ['frontend','backend'])spawn(process.execPath,[self,'--leaf',role],{windowsHide:true,stdio:['ignore','inherit','inherit']});
  if(process.argv.includes('--fail'))setTimeout(()=>process.exit(2),1800);
  else setInterval(()=>{},1000);
}
