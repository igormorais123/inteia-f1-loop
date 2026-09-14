import {sampleStory} from './story.js';
import {finalePose} from './finale.js';

// Give the return from the engine a quarter of the scene, instead of its last few scroll pixels.
const ENGINE_TIMING=[[0,0],[.20,.24],[.38,.45],[.56,.67],[.74,.90],[1,1]];
function remap(value,reverse=false){
 const from=reverse?1:0,to=reverse?0:1;let i=0;
 while(i<ENGINE_TIMING.length-2&&value>ENGINE_TIMING[i+1][from])i++;
 const a=ENGINE_TIMING[i],b=ENGINE_TIMING[i+1],t=Math.max(0,Math.min(1,(value-a[from])/(b[from]-a[from])));
 return a[to]+(b[to]-a[to])*t;
}
export const engineScroll=p=>remap(p,true);

// The engine extends the return from the monitor, before Corrigir resumes.
export const CHAPTER_IDS=['preparar','hipotese','executar','avaliar','motor-do-loop','corrigir','encerrar'];
export function narrativePose(progress){
 const p=Math.max(0,Math.min(7,progress));
 const engineChapter=p>=4&&p<5;
 const pose=sampleStory(Math.min(5,p<4?p:p<5?4:p-1));
 // After inspecting the engine, correction continues on the assembled car, without another teardown.
 if(p>=4)pose.explode=0;
 else if(p>3.9){const t=(p-3.9)/.1;pose.explode*=1-t*t*(3-2*t);}
 if(p>=6){
  const finish=finalePose(p-6),mix=(a,b)=>a+(b-a)*finish.blend;
  pose.camera=pose.camera.map((v,i)=>mix(v,finish.camera[i]));pose.target=pose.target.map((v,i)=>mix(v,finish.target[i]));
  pose.focus=[0,.5,0];pose.fov=mix(pose.fov,38);pose.center=finish.blend;pose.debrief=1-finish.blend;
  pose.track=finish.sweep;pose.world=finish.sweep>=1?'track':'garage';
  pose.incoming=finish.sweep>0&&finish.sweep<1?'track':null;pose.outgoing=pose.incoming?'garage':null;pose.sweep=finish.sweep;
  pose.speed=finish.speed;pose.shake=.15*finish.blend;pose.focusRange=6;pose.bokehScale=.3;pose.finale=finish;
 }
 return {...pose,engineChapter,engineProgress:engineChapter?remap(p-4):0};
}
