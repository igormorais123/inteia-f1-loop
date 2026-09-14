import {ENGINE_INTRO,ENGINE_LESSONS,engineBeat} from './engine/chapter.js';
import {monitorTimeline} from './monitor-scene.js';
import {mountLearning} from './learning/index.js';
import {CHAPTERS,FIELDS} from './content.js';
import {sampleStory,assessChoice,exportNotebook} from './story.js';

document.body.classList.add('enhanced');
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
// "Continue" inside the practice opens the next chapter's dialog; the lab already advanced its own stage.
const learningLab = mountLearning($('#lesson-dialog'), {chapterIndex: 0, onNavigate: i=>openLesson(i,true)});
$('#quiz').hidden = true;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),storageKey='inteia-f1-loop-notebook-v1';
const state={values:{},answers:{},chapter:-1,reading:reduced.matches};
const SCENE_LABELS=['BOX','BANCADA','TÚNEL DE VENTO','ESTAÇÃO DE DADOS','BOX','DEBRIEF','MOTOR DO LOOP'];
const HOTSPOTS=['DEFINIR O CRITÉRIO','TESTAR UMA MUDANÇA','GUARDAR O PEDIDO','CONFERIR NA FONTE','CORRIGIR O QUE FALHOU','REGISTRAR A DECISÃO'];
let frameId=null,loading=null,loadAbort=null,scene=null,positions=[],activeDialog=null,opener=null,currentLesson=0;
let targetP=0,shownP=0,lastTime=performance.now(),lastInput=0,snap=true,pose=sampleStory(0);
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');for(const [key] of FIELDS)if(typeof saved[key]==='string')state.values[key]=saved[key].slice(0,10000);if(['','aceitar','reverter','revisar','inconclusivo','decisao-necessaria'].includes(saved.decision))state.values.decision=saved.decision;}catch{/* Empty notebook is usable even when browser storage is unavailable. */}
function save(){scene?.setNotebook(state.values,FIELDS);try{localStorage.setItem(storageKey,JSON.stringify(state.values));$('#storage-state').textContent='As anotações ficam somente neste navegador.';return true;}catch{$('#storage-state').textContent='Este navegador não permitiu salvar. Baixe uma cópia para preservar suas anotações.';if(activeDialog?.id==='lesson-dialog')$('#feedback').textContent='Não foi possível salvar neste navegador. A nota continua nesta sessão: abra Meu registro e baixe uma cópia antes de sair.';return false;}}

// Titles become per-letter spans for the reveal/dissolve; the heading keeps its text for assistive tech.
for(const h of $$('.chapter h1, .chapter h2')){
 const lines=h.innerHTML.split(/<br\s*\/?>/i).map(html=>{const d=document.createElement('div');d.innerHTML=html;return d.textContent.trim();});
 h.setAttribute('aria-label',lines.join(' '));let i=0;
 h.replaceChildren(...lines.map(line=>{const row=document.createElement('span');row.className='t-line';row.setAttribute('aria-hidden','true');
  line.split(' ').forEach((word,w)=>{const box=document.createElement('span');box.className='t-word';for(const ch of word){const c=document.createElement('span');c.className='t-char';c.textContent=ch;c.style.setProperty('--i',i);c.style.setProperty('--r',((i*7919)%13/12).toFixed(2));i++;box.append(c);}if(w)row.append(' ');row.append(box);});return row;}));
 h.style.setProperty('--n',i);
}

function measure(){positions=$$('.chapter').map(s=>s.offsetTop);schedule();}
function monitorState(){const el=$('#analise-no-box');return monitorTimeline(scrollY,el.offsetTop,el.offsetHeight);}
function progress(){const y=window.scrollY;let i=0;while(i<positions.length-1&&y>=positions[i+1])i++;
 if(!state.reading&&i===3){const top=$('#analise-no-box').offsetTop;return y<top?3+.64*Math.max(0,(y-positions[3])/(top-positions[3])):monitorState().story;}
 return i===6?6+Math.min(1,Math.max(0,(y-positions[6])/Math.max(1,$('#motor-do-loop').offsetHeight-innerHeight))):i+Math.max(0,Math.min(1,(y-positions[i])/(positions[i+1]-positions[i])));}
function goMonitor(beat){const el=$('#analise-no-box');if(beat>2){$('#corrigir').scrollIntoView();return;}if(beat<0){$('#avaliar').scrollIntoView();return;}const m=monitorState();window.scrollTo({top:el.offsetTop+el.offsetHeight*(m.enter+(beat+.5)/3*(m.exit-m.enter)),behavior:'instant'});snap=true;schedule();}
$('[data-monitor-prev]').onclick=()=>goMonitor(monitorState().beat-1);
$('[data-monitor-next]').onclick=()=>goMonitor(monitorState().beat+1);
// Copy reads during the drift and dissolves before the camera travels (R7).
function paintCopy(){
 const vh=innerHeight,narrow=innerWidth<761;let shown=0;
 $$('.chapter').forEach((s,i)=>{const r=s.getBoundingClientRect();if(r.bottom<-vh*.5||r.top>vh*1.3)return;
  // An opened "what changes in my work" note holds the copy on screen until it is closed.
  // On phones the copy appears only once the chapter is pinned, so it never slides up under the dots and footer.
  const raw=-r.top/Math.max(1,r.height-vh),enter=i===0?1:(i===2||i===3)?smooth((raw-.02)/.08):i===4?smooth((raw+.04)/.08):narrow?smooth((raw+.03)/.03):(i===1||i===5)?smooth((raw+.1)/.1):smooth((raw+.34)/.3),leave=i===5||s.querySelector('.lesson[open]')?0:smooth((raw-.74)/.18);
  s.style.setProperty('--in',enter.toFixed(3));s.style.setProperty('--out',leave.toFixed(3));
  s.classList.toggle('dissolving',leave>.001);s.classList.toggle('copy-off',enter*(1-leave)<.04);shown=Math.max(shown,enter*(1-leave));});
 // Between reading windows the camera travels: the chapter dots recede so they never sit on the hero.
 document.body.classList.toggle('travel',shown<.15);
}
function paint(){
 const p=targetP,index=Math.min(6,Math.floor(p)),local=p-index;
 if(index!==state.chapter){state.chapter=index;if(!state.reading)$$('.lesson[open]').forEach(d=>d.open=false);document.body.dataset.chapter=String(index);$$('.chapters-nav a').forEach((a,i)=>{if(i===index)a.setAttribute('aria-current','step');else a.removeAttribute('aria-current');});$('#scene-label').textContent=SCENE_LABELS[index];}
 document.body.classList.toggle('arriving',index>0&&index<5&&local<.16);
 $('#progress-bar').style.transform=`scaleX(${Math.min(1,p/7)})`;
 if(!state.reading)paintCopy();
}
function placeHotspot(){
 const hs=$('#hotspot');if(!scene||state.reading||shownP>=6||innerWidth<761){hs.classList.add('off');return;}
 const i=pose.index,a=scene.anchor(i),inWindow=i===5?(shownP>4.995?1:0):smooth((pose.local-.07)/.08)*(1-smooth((pose.local-.36)/.08));
 const vis=a.ok&&!activeDialog?inWindow:0;
 if(hs.dataset.index!==String(i)){hs.dataset.index=String(i);$('#hotspot-label').textContent=HOTSPOTS[i];}
 // The disc floats in free air beside the part (up-left unless that enters the text column), tied to it by a leader line.
 // Hipótese marks the floor under the opened body, so its disc climbs above the car instead of landing on the bodywork.
 const dx=i===1?60:a.x-120<innerWidth*.46?120:-120,dy=i===1?-Math.min(260,a.y-120):a.y-110<90?90:-90;
 hs.style.setProperty('--len',(Math.hypot(dx,dy)-46).toFixed(1)+'px');hs.style.setProperty('--ang',Math.atan2(-dy,-dx).toFixed(3)+'rad');
 hs.style.transform=`translate3d(${(a.x+dx).toFixed(1)}px,${(a.y+dy).toFixed(1)}px,0) scale(${(.86+.14*vis).toFixed(3)})`;hs.style.opacity=vis.toFixed(3);hs.classList.toggle('off',vis<.05);
}
function schedule(){if(frameId===null&&!document.hidden)frameId=requestAnimationFrame(frame);}
function frame(now){
 frameId=null;
 if(document.body.classList.contains('engine-open'))return;
 targetP=progress();
 // At rest (camera settled, no pointer for 1.5 s) the ambient motion runs at ~30 fps to spare the GPU.
 const idle=scene&&!state.reading&&shownP===targetP&&!snap&&now-lastInput>1500;
 if(idle&&now-lastTime<32){schedule();return;}
 const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;
 // The camera trails the scroll with a damped follow: inertia without hijacking the page.
 if(snap||reduced.matches){shownP=targetP;snap=false;}else{shownP+=(targetP-shownP)*(1-Math.exp(-dt*5));if(Math.abs(targetP-shownP)<1e-4)shownP=targetP;}
 paint();
 if(state.reading||!scene)return;
 const monitor=monitorState();document.body.classList.toggle('monitor-focused',monitor.active&&monitor.weight>.98);
 const label=`${monitor.beat+1} / 3 · ${['Observação','Comparação','Conclusão'][monitor.beat]}`;
 if($('#monitor-page').textContent!==label)$('#monitor-page').textContent=label;
 const nextLabel=monitor.beat===2?'Seguir para Corrigir →':'Próxima →';if($('[data-monitor-next]').textContent!==nextLabel)$('[data-monitor-next]').textContent=nextLabel;
 pose=sampleStory(Math.min(shownP,5));
 const engineLocal=Math.max(0,shownP-6);pose.engineChapter=shownP>=6;pose.engineProgress=engineLocal;pose.enginePaused=enginePaused;
 document.body.classList.toggle('in-engine-chapter',pose.engineChapter);
 // Outside the chapter the copy returns to the opening, so a later pass through Encerrar never shows a lesson left from an earlier visit.
 {const put=(s,v)=>{const e=$(s);if(e.textContent!==v)e.textContent=v;};
 const beat=copyBeat(engineLocal),lesson=ENGINE_LESSONS[beat],inside=pose.engineChapter&&engineLocal>.27;
 put('#title-motor-do-loop',inside?lesson.title:ENGINE_INTRO.title);
 put('#engine-chapter-text',inside?lesson.text:ENGINE_INTRO.text);
 put('#engine-part-label',inside?lesson.part:ENGINE_INTRO.part);$('#engine-source').hidden=inside;
 put('#engine-lesson-count',inside?`${beat+1} / 3`:'Motor V6');
 put('[data-engine-chapter="next"]',!inside?'Entrar no motor →':beat<2?'Próxima →':'Voltar ao início ↗');
 }
 pose.monitorScene=monitor.active?monitor.weight:0;pose.monitorReading=monitor.active?monitor.reading:null;const place=pose.engineChapter?'MOTOR DO LOOP':monitor.active&&monitor.weight>.5?'ANÁLISE NO BOX':pose.world==='track'?'PISTA':pose.world==='tunnel'?'TÚNEL DE VENTO':pose.index===2?'ESTAÇÃO DE DADOS':SCENE_LABELS[pose.index];if($('#scene-label').textContent!==place)$('#scene-label').textContent=place;scene.setPose(pose);scene.render(dt,now/1000,idle?1000/30:1000/60);placeHotspot();
 schedule();
}
function setReading(on){state.reading=on;if(on){$('#title-motor-do-loop').textContent=ENGINE_INTRO.title;$('#engine-chapter-text').textContent=ENGINE_INTRO.text;$('#engine-part-label').textContent=ENGINE_INTRO.part;$('#engine-source').hidden=false;}document.body.classList.remove('in-engine-chapter');document.body.classList.remove('monitor-focused');document.body.classList.toggle('reading',on);$('#reading').setAttribute('aria-pressed',String(on));$('#reading').textContent=on?'Modo cinema':'Modo leitura';$$('.lesson').forEach(d=>d.open=on);$$('.chapter').forEach(s=>{s.style.removeProperty('--in');s.style.removeProperty('--out');s.classList.remove('copy-off','dissolving');});measure();if(on){$('#load-state').textContent='Leitura · movimento pausado';$('#hotspot').classList.add('off');paint();}else{if(scene)$('#load-state').textContent='';else loadScene();snap=true;schedule();}}
let enginePaused=false;
function goEngine(p){const el=$('#motor-do-loop');window.scrollTo({top:el.offsetTop+p*(el.offsetHeight-innerHeight),behavior:reduced.matches?'instant':'smooth'});snap=reduced.matches;schedule();}
// Each lesson's copy and its Next/Back targets switch shortly after the camera settles on the part (windows in engine-shot.js).
function copyBeat(p){return engineBeat(Math.max(0,p-.05));}
$('[data-engine-chapter="next"]').onclick=()=>{const p=Math.max(0,shownP-6),beat=copyBeat(p);if(p<.27)goEngine(.35);else if(beat<2)goEngine(beat===0?.58:.82);else $('#preparar').scrollIntoView();};
$('[data-engine-chapter="back"]').onclick=()=>{const p=Math.max(0,shownP-6),beat=copyBeat(p);if(p<.27)$('#encerrar').scrollIntoView();else goEngine(beat===2?.58:beat===1?.35:0);};
$('#engine-motion').onclick=()=>{enginePaused=!enginePaused;$('#engine-motion').setAttribute('aria-pressed',String(enginePaused));$('#engine-motion').textContent=enginePaused?'Mover motor':'Pausar motor';};
$('#reading').addEventListener('click',()=>{const id=(CHAPTERS[state.chapter]?.id||'motor-do-loop');setReading(!state.reading);document.getElementById(id).scrollIntoView();measure();snap=true;paint();});
$('#preload-read').addEventListener('click',()=>{if(loading)loadAbort?.abort();setReading(true);document.body.classList.add('scene-ready');const h=$('#title-preparar');h.tabIndex=-1;h.focus({preventScroll:true});});
reduced.addEventListener('change',e=>setReading(e.matches));
function openDialog(dialog){if(dialog.open)return;opener=document.activeElement;activeDialog=dialog;document.body.classList.add('modal-open');dialog.showModal();}
function closeDialog(dialog){dialog.close();}
$$('dialog').forEach(d=>{d.addEventListener('close',()=>{document.body.classList.remove('modal-open');activeDialog=null;
 // "Continue" may have moved the page on: focus returns to the action of the chapter now on screen, not to one scrolled away.
 const back=opener?.matches?.('[data-open]')&&Number(opener.dataset.open)!==state.chapter?$(`[data-open="${state.chapter}"]`):opener;back?.focus({preventScroll:true});measure();});d.querySelector('[data-close]').onclick=()=>closeDialog(d);});
function openLesson(index,fromLab){if(fromLab)document.getElementById(CHAPTERS[index].id).scrollIntoView();else learningLab.updateChapter(index);currentLesson=index;const c=CHAPTERS[index];$('#dialog-step').textContent=`0${index+1} / ${c.name}`;$('#dialog-title').textContent=c.title.replaceAll('\n',' ');$('#dialog-f1').textContent=c.lesson;$('#dialog-source').textContent=c.sourceName+' ↗';$('#dialog-source').href=c.source;$('#question').textContent=c.question;$('#quick-label').textContent=c.prompt;$('#dialog-example').hidden=!c.example||!learningLab.getState().completed.includes(index);$('#dialog-example').textContent=c.example||'';$('#quick-note').value=state.values[c.field]||'';$('#feedback').textContent='';$('#choices').replaceChildren();
 const choose=i=>{state.answers[c.id]=i;$$('#choices button').forEach((el,n)=>el.setAttribute('aria-pressed',String(n===i)));const result=assessChoice(c,i);$('#feedback').textContent=result.correct?result.message:`Reveja a decisão. A alternativa mais sustentada é “${c.choices[c.correct]}”. ${result.message}`;};
 c.choices.forEach((choice,i)=>{const b=document.createElement('button');b.type='button';b.textContent=choice;b.setAttribute('aria-pressed','false');b.onclick=()=>choose(i);$('#choices').append(b);});
 if(state.answers[c.id]!==undefined)choose(state.answers[c.id]);
 // Task, source and decision are asked inside the path, not only in the notebook.
 $('#extra-fields').replaceChildren(...(c.extra||[]).map(key=>{const label=document.createElement('label'),span=document.createElement('span');label.className='field';label.htmlFor='extra-'+key;
  let input;if(key==='decision'){span.textContent='Decisão na minha tarefa real';input=$('#decision').cloneNode(true);input.removeAttribute('name');input.value=state.values.decision||'';input.onchange=()=>{state.values.decision=input.value;save();};}
  else{const [,text,hint]=FIELDS.find(f=>f[0]===key);span.textContent=text;input=document.createElement('textarea');input.rows=2;input.maxLength=10000;input.placeholder=hint;input.value=state.values[key]||'';input.oninput=()=>{state.values[key]=input.value;save();};}
  input.id='extra-'+key;label.append(span,input);return label;}));
 openDialog($('#lesson-dialog'));}
$$('[data-open]').forEach(b=>b.onclick=()=>openLesson(Number(b.dataset.open)));
// The worked example is a model answer: it appears only after the student completes this chapter's practice step.
$('#lesson-dialog').addEventListener('learning-action',()=>{$('#dialog-example').hidden=!CHAPTERS[currentLesson].example||!learningLab.getState().completed.includes(currentLesson);});
$$('.lesson-close').forEach(b=>b.onclick=()=>{const d=b.closest('details');d.open=false;d.querySelector('summary').focus();});
$('#hotspot').onclick=()=>openLesson(Number($('#hotspot').dataset.index||0));
$('#quick-note').addEventListener('input',e=>{state.values[CHAPTERS[currentLesson].field]=e.target.value;save();});
$('#save-note').onclick=()=>{state.values[CHAPTERS[currentLesson].field]=$('#quick-note').value;if(save())closeDialog($('#lesson-dialog'));};
$('#notebook').onclick=()=>{for(const [key] of FIELDS)$('#field-'+key).value=state.values[key]||'';$('#decision').value=state.values.decision||'';openDialog($('#notebook-dialog'));};
$('#notebook-form').addEventListener('input',e=>{if(e.target.name){state.values[e.target.name]=e.target.value;save();}});
$('#notebook-form').addEventListener('submit',e=>e.preventDefault());
$('#export').onclick=()=>{const data=exportNotebook(state.values);const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='meu-loop-inteia.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#prompt').onclick=()=>{const v=k=>state.values[k]?.trim()||'[preencher]',decision=state.values.decision?$('#decision').querySelector(`option[value="${state.values.decision}"]`).textContent:'[ainda não decidi]';$('#prompt-output').value=`Atue como revisor crítico da minha tarefa. Procure falhas concretas e confira a evidência disponível. Não invente resultados nem aprove pelo estilo do texto.\n\nTarefa: ${v('task')}\nFonte e versão de referência: ${v('reference')}\nCritério e o que não pode piorar: ${v('criterion')}\nHipótese: ${v('hypothesis')}\nFerramenta, modelo e configuração: ${v('setup')}\nTeste e limite: ${v('test')}\nEvidência já observada: ${v('evidence')}\nCorreção feita: ${v('correction')}\nPendências: ${v('next')}\nDecisão provisória: ${decision}\n\nMinhas anotações acima não são prova: confira cada uma na fonte e marque, por critério, atende, não atende ou não verificado.\n\nSaída a revisar:\n[cole aqui a versão candidata]\n\nTrecho da fonte para conferência:\n[cole aqui o trecho ou indique onde encontrá-lo]\n\nPara cada crítica, indique o trecho ou teste que a sustenta. Separe observado, inferido e não verificado. Se houver falha demonstrada, proponha a menor correção útil e como conferir regressões; se não encontrar falha, diga o que verificou e o que ficou sem verificar, sem inventar problema. Se faltar acesso à fonte ou execução, declare inconclusivo e diga o que falta. Não altere os critérios para acomodar a resposta. Termine com a próxima decisão que a evidência permite.`;$('#prompt-wrap').hidden=false;$('#copy-row').hidden=false;$('#copy-state').textContent='';$('#prompt-output').focus();$('#prompt-output').select();};
$('#copy-prompt').onclick=()=>navigator.clipboard.writeText($('#prompt-output').value).then(()=>{$('#copy-state').textContent='Copiado';},()=>{$('#prompt-output').select();$('#copy-state').textContent='Texto selecionado: copie com Ctrl+C';});
window.addEventListener('scroll',()=>{remember();schedule();},{passive:true});
// Resizing or rotating keeps the reader at the same relative place inside the current section (sections are sized in svh).
let anchor=null;function remember(){const s=[...$$('.chapter'),$('#analise-no-box')].find(el=>el&&scrollY>=el.offsetTop&&scrollY<el.offsetTop+el.offsetHeight);anchor=s?{s,rel:(scrollY-s.offsetTop)/Math.max(1,s.offsetHeight)}:null;}
window.addEventListener('resize',()=>{if(anchor)window.scrollTo(0,anchor.s.offsetTop+anchor.rel*anchor.s.offsetHeight);measure();scene?.resize();snap=true;schedule();});
window.addEventListener('hashchange',()=>{measure();snap=true;schedule();});
window.addEventListener('pageshow',()=>{measure();schedule();});
window.addEventListener('pointermove',e=>{lastInput=performance.now();scene?.setPointer(e.clientX/innerWidth*2-1,e.clientY/innerHeight*2-1);},{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastTime=performance.now();schedule();}});
function preload(fraction,text){$('#preloader').style.setProperty('--f',fraction.toFixed(3));$('#preload-pct').textContent=String(Math.round(fraction*100)).padStart(2,'0');if(text)$('#preload-text').textContent=text;}
async function loadScene(){if(scene||state.reading||loading)return;loading=true;loadAbort=new AbortController();const signal=loadAbort.signal;$('#load-state').textContent='Carregando o carro 3D…';try{const {createScene}=await import('./scene.js');scene=await createScene($('#stage'),{signal,onProgress:(f,text)=>{preload(f,text);if(!state.reading)$('#load-state').textContent=text+'…';},onError:()=>{const id=monitorState().active?'analise-no-box':(CHAPTERS[Math.max(0,state.chapter)]?.id||'motor-do-loop');$('#stage canvas')?.remove();scene=null;$('#reading').hidden=true;setReading(true);document.getElementById(id).scrollIntoView();$('#load-state').textContent='3D indisponível · aula em modo leitura';}});scene.setNotebook(state.values,FIELDS);snap=true;schedule();$('#load-state').textContent=state.reading?'Leitura · movimento pausado':'';requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.classList.add('scene-ready')));}catch(e){scene=null;if(signal.aborted){$('#load-state').textContent='Leitura · movimento pausado';}else{console.error('F1 Loop: falha na cena',e);$('#reading').hidden=true;setReading(true);document.body.classList.add('scene-ready');$('#load-state').textContent='3D indisponível · aula em modo leitura';}}finally{loading=false;if(signal.aborted&&!scene&&!state.reading)loadScene();}}
// Capture hook for visual QA: jump to an absolute story position without damping.
// goto(p) follows the story clock: inside Avaliar, 3.64–4 runs through the monitor scene (monitor-scene.js timeline), so captures labelled p show p.
window.__aula={goto(p){measure();const i=Math.min(6,Math.floor(p)),l=p-i,mon=$('#analise-no-box');let y;if(i>=6)y=positions[6]+l*($('#motor-do-loop').offsetHeight-innerHeight);else if(i===3&&mon&&!state.reading){const top=mon.offsetTop,h=mon.offsetHeight,start=monitorTimeline(top,top,h).story;if(p<start)y=positions[3]+(p-3)/(start-3)*(top-positions[3]);else{const hold=p<=3.74;let lo=0,hi=1;if(hold&&p>=3.74)lo=hi=monitorTimeline(top,top,h).enter;for(let k=0;k<30;k++){const mid=(lo+hi)/2,s=monitorTimeline(top+mid*h,top,h).story;if(hold?s<p:s<=p)lo=mid;else hi=mid;}y=top+(hold?lo:hi)*h;}}else y=positions[i]+l*(positions[i+1]-positions[i]);window.scrollTo(0,y);snap=true;schedule();},get ready(){return !!scene&&document.body.classList.contains('scene-ready');}};
document.fonts.ready.then(()=>{measure();if(location.hash){const target=document.getElementById(location.hash.slice(1));target?.scrollIntoView();}snap=true;schedule();});
if(state.reading)document.body.classList.add('scene-ready');
setReading(state.reading);measure();paint();

// "Dentro do motor" leads to chapter 07, which shows the engine in this renderer (the old fullscreen viewer leaked memory per opening).
window.addEventListener('engine:closed',()=>{lastTime=performance.now();snap=true;schedule();});
const inspectEngineButton=document.getElementById('inspect-engine');
inspectEngineButton?.addEventListener('click',()=>{document.getElementById('motor-do-loop')?.scrollIntoView({behavior:reduced.matches?'auto':'smooth'});});
