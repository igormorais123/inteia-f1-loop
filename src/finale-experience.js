const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function orbitCamera(yaw,pitch,distance){
 const d=clamp(distance,4.8,13),p=clamp(pitch,.08,1.15);
 return [Math.sin(yaw)*Math.cos(p)*d,.45+Math.sin(p)*d,Math.cos(yaw)*Math.cos(p)*d];
}

// Real Ferrari 312/68 recording by Edvvc, CC BY-SA 3.0 (see asset attribution).
function createV12Sound(){
 let context,gain,source,loading,enabled=false,volume=.45;
 async function prepare(){
  if(source)return;
  if(!loading)loading=(async()=>{
   const response=await fetch('./assets/ferrari-312-v12.ogg');
   if(!response.ok)throw new Error('Gravação indisponível');
   const original=await context.decodeAudioData(await response.arrayBuffer());
   // Overlap the end and beginning into a seamless, sample-accurate loop.
   const fade=Math.min(Math.floor(original.sampleRate*.65),Math.floor(original.length/4));
   const length=original.length-fade,buffer=context.createBuffer(original.numberOfChannels,length,original.sampleRate);
   for(let c=0;c<original.numberOfChannels;c++){
    const input=original.getChannelData(c),output=buffer.getChannelData(c);
    output.set(input.subarray(fade,length));
    for(let i=0;i<fade;i++){const mix=i/fade;output[length-fade+i]=input[length+i]*(1-mix)+input[i]*mix;}
   }
   source=context.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(gain);source.start();
  })().catch(error=>{loading=null;throw error;});
  await loading;
 }
 return {
  async toggle(){
   if(!context){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('Áudio indisponível');context=new Audio();gain=context.createGain();gain.gain.value=0;gain.connect(context.destination);}
   await context.resume();await prepare();enabled=!enabled;return enabled;
  },
  setVolume(value){volume=clamp(value,0,1);},
  update(time,active){if(context)gain.gain.setTargetAtTime(enabled&&active?volume:0,context.currentTime,.12);},
  mute(){if(context)gain.gain.setTargetAtTime(0,context.currentTime,.03);}
 };
}

export function mountFinaleExperience(){
 const panel=document.createElement('section');panel.id='finale-controls';panel.setAttribute('aria-label','Explorar o carro na pista');
 panel.innerHTML=`<p class="finale-kicker">GRANDE FINAL · VOLTA LIVRE</p><h2>O loop continua.</h2><p id="orbit-hint">Arraste para girar · role para aproximar</p><div class="finale-buttons"><button type="button" id="orbit-lock">Olhar com o mouse</button><button type="button" id="orbit-near" aria-label="Aproximar o carro">+</button><button type="button" id="orbit-far" aria-label="Afastar o carro">−</button><button type="button" id="orbit-auto" aria-pressed="true">Pausar órbita</button><button type="button" id="finale-sound" aria-pressed="false">Ouvir V12</button><button type="button" id="race-pause" aria-pressed="false">Pausar corrida</button><button type="button" id="finale-back">Voltar à aula</button></div><label class="finale-volume" for="v12-volume">Volume <input id="v12-volume" type="range" min="0" max="100" value="45"></label><p class="finale-note">Gravação real: Ferrari 312/68 V12 · <a href="https://commons.wikimedia.org/wiki/File:Ferrari_312_68_(1968).ogg" target="_blank" rel="noopener noreferrer">Edvvc</a> · <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 3.0</a> · adaptada em loop.</p><p id="orbit-status" role="status"></p>`;
 const surface=document.createElement('div');surface.id='orbit-surface';surface.tabIndex=0;surface.setAttribute('role','region');surface.setAttribute('aria-label','Câmera do carro. Arraste ou use as setas para girar; mais e menos ajustam o zoom.');
 document.body.append(surface,panel);
 const find=id=>panel.querySelector(id),sound=createV12Sound();
 let active=false,yaw=.7,pitch=.25,distance=9,auto=true,paused=false,drag=null,lockRequested=false;
 const status=find('#orbit-status'),lock=find('#orbit-lock');
 function release(){if(document.pointerLockElement===surface)document.exitPointerLock();drag=null;}
 function rotate(x,y){yaw-=x*.004;pitch=clamp(pitch+y*.003,.08,1.15);auto=false;find('#orbit-auto').textContent='Retomar órbita';find('#orbit-auto').setAttribute('aria-pressed','false');}
 function failed(error){panel.dataset.pointerLockError=error?.message||'Pointer lock rejected';lockRequested=false;status.textContent='Cursor livre: arraste sobre o carro para girar.';}
 lock.onclick=async()=>{if(document.pointerLockElement===surface){release();return;}try{lockRequested=true;await surface.requestPointerLock();}catch(error){failed(error);}};
 document.addEventListener('pointerlockerror',()=>{if(lockRequested)failed();});
 document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===surface;lockRequested=false;lock.textContent=locked?'Liberar cursor (Esc)':'Olhar com o mouse';status.textContent=locked?'Mouse livre para girar · Esc libera o cursor':'Arraste sobre o carro ou ative o mouse livre.';});
 surface.onpointerdown=e=>{if(!active||e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};surface.setPointerCapture(e.pointerId);surface.focus({preventScroll:true});};
 surface.onpointermove=e=>{if(document.pointerLockElement===surface)return;if(drag&&drag.id===e.pointerId){rotate(e.clientX-drag.x,e.clientY-drag.y);drag.x=e.clientX;drag.y=e.clientY;}};
 surface.onpointerup=surface.onpointercancel=()=>{drag=null;};
 document.addEventListener('mousemove',e=>{if(active&&document.pointerLockElement===surface)rotate(e.movementX,e.movementY);});
 surface.addEventListener('wheel',e=>{if(!active)return;e.preventDefault();distance=clamp(distance*Math.exp(clamp(e.deltaY,-150,150)*.0015),4.8,13);},{passive:false});
 surface.onkeydown=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(e.key)){e.preventDefault();if(e.key==='+'||e.key==='=')distance=clamp(distance-.5,4.8,13);else if(e.key==='-')distance=clamp(distance+.5,4.8,13);else rotate(e.key==='ArrowLeft'?-30:e.key==='ArrowRight'?30:0,e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0);}};
 find('#orbit-near').onclick=()=>{distance=clamp(distance-.7,4.8,13);};
 find('#orbit-far').onclick=()=>{distance=clamp(distance+.7,4.8,13);};
 find('#orbit-auto').onclick=()=>{auto=!auto;find('#orbit-auto').textContent=auto?'Pausar órbita':'Retomar órbita';find('#orbit-auto').setAttribute('aria-pressed',String(auto));};
 find('#race-pause').onclick=()=>{paused=!paused;find('#race-pause').textContent=paused?'Retomar corrida':'Pausar corrida';find('#race-pause').setAttribute('aria-pressed',String(paused));};
 find('#v12-volume').oninput=e=>sound.setVolume(Number(e.target.value)/100);
 find('#finale-sound').onclick=async()=>{const button=find('#finale-sound');button.disabled=true;button.textContent='Carregando áudio…';try{const on=await sound.toggle();find('#finale-sound').textContent=on?'Silenciar V12':'Ouvir V12';find('#finale-sound').setAttribute('aria-pressed',String(on));}catch{status.textContent='Não foi possível carregar a gravação. Tente novamente.';button.textContent='Ouvir V12';}finally{button.disabled=false;}};
 find('#finale-back').onclick=()=>{release();window.__aula.goto(6);};
 document.addEventListener('visibilitychange',()=>{if(document.hidden){release();sound.mute();}});
 return {update(pose,dt,time,reading){
  const next=!reading&&pose?.finale?.race>=.999;
  if(active!==next){active=next;document.body.classList.toggle('orbit-active',active);if(!active){release();sound.mute();}else{yaw=.7;pitch=.25;distance=9;auto=!matchMedia('(prefers-reduced-motion: reduce)').matches;paused=!auto;find('#orbit-auto').textContent=auto?'Pausar órbita':'Retomar órbita';find('#orbit-auto').setAttribute('aria-pressed',String(auto));find('#race-pause').textContent=paused?'Retomar corrida':'Pausar corrida';find('#race-pause').setAttribute('aria-pressed',String(paused));}}
  if(active){if(auto&&!paused&&document.pointerLockElement!==surface&&!drag)yaw+=dt*.075;pose.freeCamera=orbitCamera(yaw,pitch,distance);pose.racePaused=paused;pose.speed=paused?0:1;pose.shake=paused?0:.06;}
  sound.update(time,active&&!paused&&!document.hidden);return active;
 }};
}
