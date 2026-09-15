const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function orbitCamera(yaw,pitch,distance){
 const d=clamp(distance,4.8,13),p=clamp(pitch,.08,1.15);
 return [Math.sin(yaw)*Math.cos(p)*d,.45+Math.sin(p)*d,Math.cos(yaw)*Math.cos(p)*d];
}

// Optional, locally synthesized soundtrack. No recording or microphone access.
function createV12Sound(){
 let context,gain,voices=[],enabled=false;
 return {
  async toggle(){
   if(!context){
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('Áudio indisponível');
    context=new Audio();gain=context.createGain();gain.gain.value=0;
    const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=5200;
    const limiter=context.createDynamicsCompressor();limiter.threshold.value=-18;limiter.ratio.value=8;
    gain.connect(filter);filter.connect(limiter);limiter.connect(context.destination);
    const real=new Float32Array(14),imag=new Float32Array(14);
    for(let i=1;i<14;i++)imag[i]=1/Math.pow(i,1.35);
    const wave=context.createPeriodicWave(real,imag);
    voices=[0,1].map(i=>{const o=context.createOscillator();o.setPeriodicWave(wave);o.detune.value=i?5:-5;o.connect(gain);o.start();return o;});
   }
   await context.resume();enabled=!enabled;return enabled;
  },
  update(time,active){if(!context)return;
   // Six firing pulses per revolution, with a gentle acceleration/shift cycle.
   const phase=(time%9)/9,rpm=9500+4500*Math.min(1,phase*1.35);
   for(const o of voices)o.frequency.setTargetAtTime(rpm/10,context.currentTime,.12);
   gain.gain.setTargetAtTime(enabled && active ? .024 : 0,context.currentTime,.08);
  },
  mute(){if(context)gain.gain.setTargetAtTime(0,context.currentTime,.03);}
 };
}

export function mountFinaleExperience(){
 const panel=document.createElement('section');panel.id='finale-controls';panel.setAttribute('aria-label','Explorar o carro na pista');
 panel.innerHTML=`<p class="finale-kicker">GRANDE FINAL · VOLTA LIVRE</p><h2>O loop continua.</h2><p id="orbit-hint">Arraste para girar · role para aproximar</p><div class="finale-buttons"><button type="button" id="orbit-lock">Olhar com o mouse</button><button type="button" id="orbit-near" aria-label="Aproximar o carro">+</button><button type="button" id="orbit-far" aria-label="Afastar o carro">−</button><button type="button" id="orbit-auto" aria-pressed="true">Pausar órbita</button><button type="button" id="finale-sound" aria-pressed="false">Ouvir V12</button><button type="button" id="race-pause" aria-pressed="false">Pausar corrida</button><button type="button" id="finale-back">Voltar à aula</button></div><p class="finale-note">Som sintetizado inspirado em V12 · o motor didático da aula é V6.</p><p id="orbit-status" role="status"></p>`;
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
 find('#finale-sound').onclick=async()=>{try{const on=await sound.toggle();find('#finale-sound').textContent=on?'Silenciar V12':'Ouvir V12';find('#finale-sound').setAttribute('aria-pressed',String(on));}catch{status.textContent='Não foi possível iniciar o áudio neste navegador.';}};
 find('#finale-back').onclick=()=>{release();window.__aula.goto(6);};
 document.addEventListener('visibilitychange',()=>{if(document.hidden){release();sound.mute();}});
 return {update(pose,dt,time,reading){
  const next=!reading&&pose?.finale?.race>=.999;
  if(active!==next){active=next;document.body.classList.toggle('orbit-active',active);if(!active){release();sound.mute();}else{yaw=.7;pitch=.25;distance=9;auto=!matchMedia('(prefers-reduced-motion: reduce)').matches;paused=!auto;find('#orbit-auto').textContent=auto?'Pausar órbita':'Retomar órbita';find('#orbit-auto').setAttribute('aria-pressed',String(auto));find('#race-pause').textContent=paused?'Retomar corrida':'Pausar corrida';find('#race-pause').setAttribute('aria-pressed',String(paused));}}
  if(active){if(auto&&!paused&&document.pointerLockElement!==surface&&!drag)yaw+=dt*.075;pose.freeCamera=orbitCamera(yaw,pitch,distance);pose.racePaused=paused;pose.speed=paused?0:1;pose.shake=paused?0:.06;}
  sound.update(time,active&&!paused&&!document.hidden);return active;
 }};
}
