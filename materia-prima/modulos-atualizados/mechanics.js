import * as THREE from 'three';
const names={main_body:'Carroceria',main_body_inside:'Interior do cockpit',main_body_glass:'Defletor transparente',front_tire:'Pneu dianteiro',rear_tire:'Pneu traseiro',front_wheel_cover:'Roda dianteira',rear_wheel_cover:'Roda traseira',front_control_arms:'Braços da suspensão dianteira',rear_control_arms:'Braços da suspensão traseira',front_pushrod:'Pushrod dianteiro',rear_driveshaft:'Semieixo traseiro',front_wing:'Asa dianteira',rear_wing:'Asa traseira',floor:'Assoalho',side_mirrors:'Retrovisor',steering_wheel:'Volante',exhaust:'Escapamento',antennas:'Antenas',drs:'Mecanismo da asa',lcd_screen:'Display do volante',inside_cover:'Cobertura interna',rear_inside_cover:'Cobertura interna traseira',sw_connection:'Conexão do volante',top_intake_details:'Detalhes da entrada de ar',rear_led:'Luz traseira',new_rear_LED:'Conjunto da luz traseira'};
export function createMechanics(model){
 const roots=[],records=[];model.traverse(o=>{if(o.userData.assemblyComponent)roots.push(o);});
 if(!roots.length)roots.push(...model.children);
 model.updateMatrixWorld(true);for(const root of roots)model.attach(root);
 const worldOrigin=model.position.clone();
 const categoryFor=n=>/tire|wheel_cover|inside_cover/.test(n)?'wheels':/control_arms|pushrod|driveshaft/.test(n)?'suspension':/wing|drs|floor/.test(n)?'aero':/steering|lcd|sw_connection/.test(n)?'cockpit':/main_body|side_mirror/.test(n)?'body':'details';
 for(const root of roots){
  const box=new THREE.Box3().setFromObject(root);if(box.isEmpty())continue;
  const center=box.getCenter(new THREE.Vector3()).sub(worldOrigin),size=box.getSize(new THREE.Vector3());
  const source=root.userData.sourceObject||root.userData.sourceName||root.name;
  const key=Object.keys(names).sort((a,b)=>b.length-a.length).find(k=>source.toLowerCase().startsWith(k.toLowerCase()));
  const side=Math.abs(center.x)>.1?(center.x>0?'direita':'esquerda'):'';
  const category=root.userData.category||categoryFor(source);
  const label=root.userData.label||((names[key]||source.replaceAll('_',' '))+(side&&category!=='body'?' · '+side:''));
  let direction=new THREE.Vector3();
  if(category==='wheels')direction.set(Math.sign(center.x)*1.65,.18,Math.sign(center.z)*.18);
  else if(category==='suspension')direction.set(Math.sign(center.x||1)*1.25,.45,Math.sign(center.z)*.3);
  else if(/front_wing/.test(source))direction.set(center.x*.5,.1,1.85);
  else if(/rear_wing|drs/.test(source))direction.set(center.x*.6,.75,-1.55);
  else if(/floor/.test(source))direction.set(center.x*.25,.05,-.15);
  else if(/main_body$/.test(source))direction.set(0,1.65,0);
  else if(category==='cockpit')direction.set(center.x*.6,1.1,.35);
  else direction.set(center.x*.75,.9,center.z*.55);
  const index=records.filter(r=>r.source===source&&Math.sign(r.center.x)===Math.sign(center.x)).length;direction.y+=Math.min(index*.06,.35);
  if(category==='wheels')direction.x=Math.sign(center.x)*(1.35+(/tire/.test(source)?0:.45)+index*.22);
  const r={id:records.length,root,source,label,category,center,size,base:root.position.clone(),rotation:root.quaternion.clone(),direction,manual:0,hidden:false,custom:new THREE.Vector3()};
  root.traverse(o=>{if(o.isMesh)o.userData.recordId=r.id;});records.push(r);
 }
 let amount=0,target=0,playing=false,phase='out',phaseStart=0,selected=null,isolated=false,spin=false,spinAngle=0,steering=0,drs=0,dragging=false;
 const wheels=[];
 for(const front of [true,false])for(const side of [-1,1]){
  const tire=records.find(r=>r.source.includes(front?'front_tire':'rear_tire')&&Math.sign(r.center.x)===side);if(!tire)continue;
  const pivot=new THREE.Group();pivot.name='Wheel steering carrier';pivot.position.copy(tire.center);model.add(pivot);const spinPivot=new THREE.Group();spinPivot.name='Wheel rotation';pivot.add(spinPivot);
  const members=records.filter(r=>/tire|wheel_cover/.test(r.source)&&r.source.includes(front?'front_':'rear_')&&Math.sign(r.center.x)===side);
  const covers=records.filter(r=>(front?r.source==='inside_cover':r.source==='rear_inside_cover')&&Math.sign(r.center.x)===side);
  model.updateMatrixWorld(true);for(const r of members){spinPivot.attach(r.root);r.base.copy(r.root.position);}for(const r of covers){pivot.attach(r.root);r.base.copy(r.root.position);}wheels.push({pivot,spinPivot,front,members,covers});
 }
 const flap=records.find(r=>r.source==='rear_wing_drs'||r.source.startsWith('rear_wing_drs__'));
 let flapPivot=null;
 if(flap){flapPivot=new THREE.Group();flapPivot.position.copy(flap.center);flapPivot.position.y+=flap.size.y*.4;flapPivot.position.z-=flap.size.z*.35;model.add(flapPivot);model.updateMatrixWorld(true);flapPivot.attach(flap.root);flap.base.copy(flap.root.position);}
 function apply(){
  const moved=amount>.001||records.some(r=>Math.abs(r.manual)>.001||r.custom.lengthSq()>.000001),motion=moved?0:1;
  for(const w of wheels){w.pivot.rotation.set(0,w.front?steering*motion:0,0);w.spinPivot.rotation.x=spinAngle*motion;}
  if(flapPivot)flapPivot.rotation.x=-drs*motion;
  for(const r of records){
   if(dragging&&r.id===selected)continue;
   const delay={wheels:0,aero:.12,suspension:.18,body:.24,cockpit:.3,details:.32}[r.category];
   const t=THREE.MathUtils.smoothstep(amount,delay,1);
   r.root.position.copy(r.base).addScaledVector(r.direction,t+r.manual).add(r.custom);
   r.root.visible=!r.hidden&&(!isolated||selected===r.id);
  }
 }
 return {records,wheels,flap,get amount(){return amount;},get target(){return target;},get playing(){return playing;},get selected(){return selected;},get isolated(){return isolated;},get motionAvailable(){return amount<.001&&!records.some(r=>Math.abs(r.manual)>.001||r.custom.lengthSq()>.000001);},
  drag(v){if(selected===null)return;const r=records[selected];if(v){playing=false;spin=false;steering=0;drs=0;apply();dragging=true;}else{const actual=r.root.position.clone();dragging=false;apply();r.custom.add(actual.sub(r.root.position));apply();}},
  restoreParts(){isolated=false;records.forEach(r=>{r.manual=0;r.custom.set(0,0,0);r.root.quaternion.copy(r.rotation);});},
  setAmount(v){target=THREE.MathUtils.clamp(v,0,1);playing=false;},
  setManual(v){if(selected!==null){records[selected].manual=v;apply();}},
  select(id){selected=id;isolated=false;apply();},
  isolate(){if(selected!==null){isolated=!isolated;apply();}},
  setSpin(v){spin=v;},setSteering(v){steering=THREE.MathUtils.degToRad(v);},setDRS(v){drs=THREE.MathUtils.degToRad(v);},
  toggleLoop(){playing=!playing;phase=amount>.5?'in':'out';phaseStart=performance.now();},
  reset(){target=0;playing=false;selected=null;isolated=false;spin=false;spinAngle=0;steering=0;drs=0;dragging=false;records.forEach(r=>{r.manual=0;r.hidden=false;r.custom.set(0,0,0);r.root.quaternion.copy(r.rotation);});},
  update(dt,now,reduced){if(playing){const elapsed=(now-phaseStart)/1000;if(phase==='out'){target=1;if(amount>.999&&elapsed>4){phase='in';phaseStart=now;}}else{target=0;if(amount<.001&&elapsed>4){phase='out';phaseStart=now;}}}amount=reduced?target:THREE.MathUtils.damp(amount,target,4,dt);if(Math.abs(amount-target)<.0002)amount=target;if(spin&&amount<.001)spinAngle+=dt*1.2;apply();}
 };
}
