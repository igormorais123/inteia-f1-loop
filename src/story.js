import {FIELDS} from './content.js';
export const clamp = (v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const RAD=Math.PI/180;

// Director's track for one continuous take (R1). Progress p runs 0..5. Chapter i's copy
// is on screen from about i−0.2 to i+0.55, so every chapter reads while the camera
// keeps moving (orbit, dolly, crane) and travels in the text-free stretch (≈0.57–0.8).
// Car coordinates: x ±0.92, y 0–1.1, z −2.55..+2.56, nose at +Z, INTEIA decal on +X.
// Camera keys are cylindrical around the car: [azimuth° from the nose toward +X, distance, height].
// Interpolating azimuth instead of x/z makes an orbit an orbit, not a chord through the car.
// While copy is up, the car stays inside 42–92% of a 1440×900 frame (tools/camera-metrics.mjs).
// aim(): the car point, pushed against the camera's right vector so the hero sits right of centre.
const aim=(az,s,y,z=0)=>[-Math.cos(az*RAD)*s,y,Math.sin(az*RAD)*s+z];
const MONITORS=[-4.72,1.52,-1.35];
const CAMERA=[
 // Reading keys were fitted by search (closest distance that keeps 42–92% with margin, target
 // height that sits the car low in frame); the comment gives the car's share of frame height.
 // 01 Preparar · box. Near-frontal hero at engineer's eye height, orbiting toward the decal
 // while a crane lifts the lens over the car (massa 55% → 27%).
 // The lens sits a little higher and tilts ≈4° down, so the INTEIA sign on the rear wall stays out of
 // the top of the frame instead of being cut by it (0.00 and 5.00 are the same frame).
 [0.00,[8,6.1,2.15],aim(8,.6,.2)],
 [0.25,[24,7.5,3.2],aim(24,.6,.4)],
 [0.50,[58,10,3.6],aim(58,.3,.9)],
 // Travel: text-free travels carry a component close-up (corn-02/09): one part at 55% of the width
 // with focus locked on it (CLOSES) and the rest of the car soft, never past the chapter dots.
 // 0.72: the crane climbs over the right rear quarter on a 20° lens until the rear wing is a third
 // of the frame; only the back half of the car is in shot, cut on the empty text side.
 [0.72,[62,4.8,4.6],[.38,.45,-2.45]],
 // 02 Hipótese · orbit in explosion: high rear orbit around the parts, floor isolated (32% → 43%).
 // The body opens a little later (explode .35 at 1.0), so the orbit can start close to the wing.
 [1.00,[105,9.6,6.3],aim(105,.2,.35)],
 [1.25,[145,11,6],aim(145,0,.35)],
 [1.50,[158,11,4.9],aim(158,0,.35)],
 // Explosion peak: the isolated floor, the hypothesis part, on a 25° lens from the rear-right quarter,
 // 21° down: no model-kit view from above. With the wheels flown out, nothing closer keeps the whole
 // car off the chapter dots (tests: car ≤88% of the width), so the lens does the isolating: focus
 // locked on the floor, the flown parts soft around it.
 // Camera r6 (cinema r5 G4): the crane comes down to 2.4 m on the rear-right quarter while the lens closes to 20°,
 // aimed just screen-right of the floor so the floor sits centred (the desktop frame is offset for the copy);
 // the flown parts around it sit outside the locked focus. The orbit keeps turning through the close, so the lens
 // never stops. A camera 2–3 m from the floor is out of reach from the 1.50 reading pose (≈9 m in 0.14 of
 // progress, 1.7× the speed limit).
 [1.64,[162,8.8,2.4],[-.57,.3,-1.04]],
 // Travel: the crane holds high while the diagonal wipe crosses (1.76–2.00), so the box floor
 // fills the frame until the tunnel covers it; the descent happens inside the tunnel.
 [1.80,[170,9.6,3.2],[.1,.6,-.2]],
 // 03 Executar · tunnel. Rear three-quarter that sinks to a low contra-plongée at 0.75 m once
 // the tunnel owns the frame, then swings out toward the flank (52% → 23%).
 [2.00,[178,6.05,1.5],aim(178,0,.4)],
 [2.25,[158,7.85,.75],aim(158,-.3,.9)],
 [2.50,[124,10.65,2.2],aim(124,.05,.9)],
 // Travel: the track (src/world/track.js). The car never moves: the circuit runs past it in −Z,
 // so these keys are still car coordinates. Three linked takes, no cut (WIPES 2.50–2.64, 2.79–3.00):
 // a low tracking dolly on the flank as the diagonal brings the circuit in, a crane up and round
 // to the high T-cam view behind the car at full speed, then a whip round the right flank into
 // the island while the second diagonal brings the box back.
 [2.62,[92,7.2,.55],[0,.42,.1]],
 // Camera r6 (cinema r5 M1): the T-cam and the whip keep the car ≥60% of the width (the long lens with the
 // +8° speed kick on top, aim closer to the car) so the dark verge no longer fills half the frame.
 [2.74,[168,5.1,2],[-.25,.25,-.8]],
 [2.80,[135,7.2,2.4],[-.35,.6,.3]],
 // 04 Avaliar · engineering island, lit by the evidence. The car stays sharp and clear of the copy
 // while the orbit comes round to the nose; then the push-in to the island (MONITORS).
 // The whip lands softly (tangent ×0.35) so the reading starts at lesson speed.
 [3.00,[60,12.0,2.8],[-4.35,1.2,-3],.35],
 [3.25,[34,9.6,2.2],[-2.2,.9,-2.2]],
 // The lens rides above the car and looks down, so the rear wall panel stays above the frame.
 [3.50,[-5,6,2.7],aim(-5,-.2,.35)],
 // Travel: the push-in keeps the car as the subject past its left front wheel (never the empty floor or
 // the rear panel), then turns onto the island until the central monitor is 35–40% of the width, and
 // only then the rack (RACK from 3.5) hands the focus to the evidence.
 // Camera r6: the aim is already turning onto the island here, so the arrival at the monitor scene frames the
 // three screens on the diagonal rather than the empty chairs in front of them.
 [3.60,[-13.5,3.69,2.95],[-3.1,1.1,-.9]],
 // The monitor holds big and steady while its lesson plays (garage.setLessonProgress beats at 3.70 and
 // 3.77): the lens only creeps up (≈0.7 m), so it never stops and never pulls the screen around.
 [3.70,[-45,1.7,3],[-4.57,1.45,-1.5]],
 // 3.74 is the island pose the dedicated reading scene holds (monitor-scene.js); the only travel to Corrigir
 // starts right after it (camera r6, cinema r5 M2): a crane-pan that climbs over the nose while the aim swings
 // from the monitor to the car, so the monitor leaves on the left as the car enters, and the whole car is in
 // the reading zone (42–92%) from 3.86, looking down its length on a lens that opens from 20 to 31.
 [3.75,[-50.5,1.46,3.3],[-4.57,1.45,-1.5]],
 // Head-on (az −4): the car's length runs down the frame, so its width across the lens is the wheels', not the flank's.
 [3.86,[-4,3,4.55],aim(-4,0,.35)],
 // 05 Corrigir · box. The crane keeps rising and pulls back while the body lifts (explode 3.95–4.2); the 05
 // title opens at 3.96 on the settled car.
 [4.00,[-12,5.2,5.4],aim(-12,-.5,.35),.45],
 // Tilted ≈4° further down than the pull-back suggests: the rear-wall sign leaves the top edge.
 [4.25,[0,8.5,5.2],aim(0,.2,.3)],
 [4.50,[10,9,3.8],aim(10,.2,.4)],
 // Travel: descending crane onto the nose while the car closes, landing on the first frame.
 [4.74,[12,7.4,2.9],aim(12,.5,.35)],
 // 06 Encerrar · the closing frame answers the opening one.
 [5.00,[8,6.1,2.15],aim(8,.6,.2)]
];
const TRACKS={
 // Long-lens zooms at 0.72 and 1.64 make the component close-ups, 30–34 on the track, 20 on the
 // monitor; 38 is back before copy arrives.
 fov:[[0,38],[.5,38],[.6,30],[.72,20],[.84,28],[.94,38],[1.5,38],[1.57,26],[1.64,20],[1.72,24],[1.86,36],[2,38],[2.5,38],[2.62,30],[2.7,24],[2.74,21],[2.84,21],[2.92,32],[3,38],[3.45,36],[3.68,20],[3.75,20],[3.86,40],[3.96,38],[4,38],[4.5,38],[4.66,34],[5,38]],
 // The car opens on the way to the bench, peaks after the copy leaves and slams shut at the wipe.
 explode:[[0,0],[.62,0],[1,.35],[1.45,.6],[1.62,.8],[1.86,0],[3.95,0],[4.2,.45],[4.55,.45],[4.85,0],[5,0]],
 // Shallow focus lives in the closes and the Avaliar rack; reading pauses keep the whole subject sharp;
 // the track keeps it low so the bokeh does not erase the speed streaks.
 bokeh:[[0,.11],[.5,.11],[.72,.5],[.9,.25],[1,.2],[1.5,.2],[1.64,.5],[1.8,.35],[2,.25],[2.5,.25],[2.58,.12],[2.92,.12],[3,.25],[3.5,.25],[3.68,.7],[3.75,.7],[3.84,.3],[3.92,.25],[4,.11],[4.5,.11],[4.66,.22],[5,.11]],
 // Avaliar is lit by the evidence: the room drops and the monitors take over.
 evaluate:[[0,0],[2.95,0],[3.15,1],[3.84,1],[3.98,0],[5,0]],
 exposure:[[0,1],[1.8,1],[2.2,.9],[2.8,.9],[3.2,1],[4.8,1],[5,.92]],
 // The same part carries the loop: the floor is the hypothesis (02) and the revision (05).
 highlight:[[0,0],[.98,0],[1.12,1],[1.6,1],[1.78,0],[4.02,0],[4.16,1],[4.6,1],[4.8,0],[5,0]],
 debrief:[[0,0],[4.7,0],[5,1]],
 // Track run (0..1, 1 = 80 m/s): up to speed as the circuit sweeps in, flat out through the T-cam,
 // braking to a stop before the box owns the frame. shake scales the track camera (speedCamera).
 speed:[[0,0],[2.5,0],[2.64,.85],[2.72,1],[2.84,1],[2.96,0],[5,0]],
 shake:[[0,0],[2.52,0],[2.64,.7],[2.74,1],[2.86,1],[2.96,0],[5,0]],
 // No copy on screen during the run: the frame is centred on the car instead of clearing the text column.
 center:[[0,0],[2.5,0],[2.62,1],[2.86,1],[3,0],[5,0]],
 // Extra pull-back on phones (added to the portrait factor) while copy is still on screen.
 // Camera r6: the Avaliar exit also pulls the phone back while the crane is still close over the nose.
 pull:[[0,0],[2.5,0],[2.62,.75],[2.72,.1],[2.86,0],[3.78,0],[3.87,.45],[3.98,0],[5,0]]
};
// Focus narrates (R8): it rides the face of the car turned to the lens, so the subject of each
// pause is sharp from any angle. Avaliar racks it to the island monitors only once the push-in has
// made them big (3.5 on); each close locks it on its part with a short range (LOCK, CLOSES).
const RACK=[[0,0],[3.5,0],[3.7,1],[3.75,1],[3.82,0],[5,0]];
// Part centres at the explode amount of each close (tools/car-hull.json): rear wing, floor.
const CLOSES=[[.72,[.3,.6,-2.25]],[1.64,[0,.29,-.85]]];
const LOCK=[[0,0],[.58,0],[.66,1],[.8,1],[.9,0],[1.5,0],[1.57,1],[1.7,1],[1.78,0],[5,0]];
const CLOSE_RANGE=1.5;
// Corrigir's descending crane lands on the nose: focus rides to it and leaves before the closing frame.
const NOSE_POINT=[0,.3,2.2],NOSE=[[0,0],[4.52,0],[4.62,1],[4.76,1],[4.9,0],[5,0]];
function focusAt(p,camera,target){
 const [x,,z]=camera,h=Math.hypot(x,z)||1,reach=Math.min(1.35,.25*h),k=scalar(RACK,p),lock=scalar(LOCK,p),nose=scalar(NOSE,p);
 let point=[x/h*reach,Math.max(.5,Math.min(1,target[1])),z/h*reach];
 if(nose>0)point=point.map((v,i)=>v+(NOSE_POINT[i]-v)*nose);
 if(k>0)point=point.map((v,i)=>v+(MONITORS[i]-v)*k);
 if(lock>0){const part=CLOSES.reduce((a,b)=>Math.abs(b[0]-p)<Math.abs(a[0]-p)?b:a)[1];point=point.map((v,i)=>v+(part[i]-v)*lock);}
 return {point,lock};
}
// Environment wipes run in text-free travels and the last one of a chapter finishes on its seam (R6):
// the incoming world owns the frame before the next chapter's copy may appear (main.js opens it
// after the seam). hazeLead: how early the dark haze starts before a wipe (short on the track entry,
// so the end of the Executar reading keeps the tunnel's depth).
const WIPES=[
 {from:1.76,to:2.00,outgoing:'garage',incoming:'tunnel',hazeLead:.22},
 {from:2.50,to:2.64,outgoing:'tunnel',incoming:'track',hazeLead:.06},
 {from:2.79,to:3.00,outgoing:'track',incoming:'garage',hazeLead:.22}
];

function segment(keys,p){let i=0;while(i<keys.length-2&&p>keys[i+1][0])i++;return i;}
function scalar(keys,p){const i=segment(keys,p),[t0,a]=keys[i],[t1,b]=keys[i+1];return a+(b-a)*smooth((p-t0)/(t1-t0));}
// Catmull-Rom tangent at key b (between a and c), limited like Fritsch–Carlson: zero at a
// local extremum and at most 3× the smaller secant, so no coordinate overshoots its keys
// (the camera never dips under the floor between a crane shot and a low shot).
function tangent(a,b,c,slot,axis){
 if(a===b)return (c[slot][axis]-b[slot][axis])/(c[0]-b[0]);
 if(b===c)return (b[slot][axis]-a[slot][axis])/(b[0]-a[0]);
 const d0=(b[slot][axis]-a[slot][axis])/(b[0]-a[0]),d1=(c[slot][axis]-b[slot][axis])/(c[0]-b[0]);
 if(d0*d1<=0)return 0;
 const m=(c[slot][axis]-a[slot][axis])/(c[0]-a[0]),cap=3*Math.min(Math.abs(d0),Math.abs(d1));
 return Math.sign(m)*Math.min(Math.abs(m),cap);
}
// Cubic Hermite over non-uniform key times: C1 in progress, so speed never jumps at a key.
// An optional 4th key element scales that key's tangent: a whip can land softly on a reading key.
function spline(slot,p){
 const i=segment(CAMERA,p),k0=CAMERA[Math.max(0,i-1)],k1=CAMERA[i],k2=CAMERA[i+1],k3=CAMERA[Math.min(CAMERA.length-1,i+2)];
 const dt=k2[0]-k1[0],t=clamp((p-k1[0])/dt),t2=t*t,t3=t2*t;
 const h00=2*t3-3*t2+1,h10=t3-2*t2+t,h01=-2*t3+3*t2,h11=t3-t2,e1=k1[3]??1,e2=k2[3]??1;
 return k1[slot].map((v,axis)=>h00*v+h10*tangent(k0,k1,k2,slot,axis)*e1*dt+h01*k2[slot][axis]+h11*tangent(k1,k2,k3,slot,axis)*e2*dt);
}
function cameraAt(p){const [az,d,y]=spline(1,p);return [Math.sin(az*RAD)*d,y,Math.cos(az*RAD)*d];}

// Pure, absolute sampling: returning to a scroll position restores the same pose.
export function sampleStory(progress){
 const p=clamp(Number.isFinite(progress)?progress:0,0,5),index=Math.min(5,Math.floor(p)),local=p-index;
 const camera=cameraAt(p),target=spline(2,p);
 const {point,lock}=focusAt(p,camera,target);
 const pose={index,local,camera,target,focus:point,tunnel:0,wipe:0,sweep:0,incoming:null};
 for(const [key,keys] of Object.entries(TRACKS))pose[key]=scalar(keys,p);
 pose.explode=clamp(pose.explode);
 // Explicit lens for the engine (scene.js may prefer these over its bokeh mapping): reading pauses
 // get ≈4 m of sharp depth and a 1.5 bokeh scale (ENSAIO-FOCO-BUILD05); Avaliar keeps its rack;
 // a close narrows the sharp zone to its part.
 const range=Math.max(3.4-2.25*pose.bokeh,4.4-4.5*pose.bokeh);
 pose.focusRange=range+(CLOSE_RANGE-range)*lock;
 pose.bokehScale=1+4.4*pose.bokeh;
 // World routing is data: a new world is one more wipe (scene.js keeps a map of worlds by name).
 const w=WIPES.find(w=>p>w.from&&p<w.to);
 const settled=WIPES.reduce((world,x)=>p>=x.to?x.incoming:world,WIPES[0].outgoing);
 pose.outgoing=null;
 if(w){const s=smooth((p-w.from)/(w.to-w.from));pose.sweep=s;pose.incoming=w.incoming;pose.outgoing=w.outgoing;pose.wipe=Math.sin(Math.PI*s);}
 // world: the world that owns most of the frame ('garage' | 'tunnel' | 'track'), stable for labels.
 pose.world=w?(pose.sweep>=.5?w.incoming:w.outgoing):settled;
 // Weight of a named world on screen: the swept share during a wipe, 0 or 1 when settled.
 const weight=name=>w?(w.incoming===name?pose.sweep:w.outgoing===name?1-pose.sweep:0):settled===name?1:0;
 pose.tunnel=weight('tunnel');
 pose.track=weight('track');
 // Dark haze rises just before each wipe and clears after it (scene.js: fog, background, dust).
 pose.haze=Math.max(0,...WIPES.map(x=>Math.min(smooth((p-x.from+x.hazeLead)/Math.min(.16,x.hazeLead)),1-smooth((p-x.to)/.15))));
 return pose;
}

// Portrait framing (phones, ≈390×844), pure so scene.js and the tests share it.
// Copy on phones reads from about i−0.02 to i+0.52 in the lower half, so the 3D is lifted into the
// upper band (offsetY). Outside the copy (PORTRAIT_FREE) the car is the subject: the lens aims at its
// centre, the frame is not lifted, and the car fills ≈62% of the width.
// A narrow frame is filled with the lens before the distance: the camera stays near the desktop take
// (inside the box, this side of the circuit walls, short of the fog) and never goes past 1.5× it.
// The Avaliar push-in stays on the monitor (its subject), and Corrigir's copy opens at 3.96.
const PORTRAIT_FREE=[[0,0],[.52,0],[.58,1],[.94,1],[.99,0],[1.52,0],[1.58,1],[1.97,1],[2,0],[2.46,0],[2.5,1],[2.97,1],[3,0],[4.52,0],[4.58,1],[4.94,1],[4.99,0],[5,0]];
const PORTRAIT_FILL=.62,PORTRAIT_WIDE=72,PORTRAIT_SWING=[[0,0],[.96,0],[1.1,1],[1.7,1],[1.82,0],[5,0]],PORTRAIT_TILT=[[0,.6],[.3,.6],[.45,0],[3.9,0],[4.05,1.5],[4.5,1.5],[4.58,0],[4.85,0],[5,.6]];
const lens=(half,d,aspect,fill=PORTRAIT_FILL)=>2*Math.atan(half/(fill*aspect*d))/RAD;
// The closed car's bounding box seen from eye toward target on a vertical fov f: width (share of the frame) and
// centre offset (share of the frame, + to the right), unclipped.
const CAR_BOX=[-.95,.95].flatMap(x=>[0,1.1].flatMap(y=>[-2.55,2.56].map(z=>[x,y,z])));
function boxSpan(eye,target,f,aspect){
 const fw=target.map((t,i)=>t-eye[i]),n=Math.hypot(...fw)||1;fw.forEach((_,i)=>fw[i]/=n);
 const r=[-fw[2],0,fw[0]],rn=Math.hypot(...r)||1,k=Math.tan(f/2*RAD)*aspect;
 let lo=Infinity,hi=-Infinity;
 for(const c of CAR_BOX){const q=c.map((x,i)=>x-eye[i]),z=Math.max(.05,q[0]*fw[0]+q[1]*fw[1]+q[2]*fw[2]),x=(q[0]*r[0]+q[2]*r[2])/rn/(z*k);lo=Math.min(lo,x);hi=Math.max(hi,x);}
 return {width:(hi-lo)/2,centre:(hi+lo)/4,right:r.map(x=>x/rn)};
}
export function portraitFrame(pose,aspect=390/844){
 const p=pose.index+pose.local,free=scalar(PORTRAIT_FREE,p),explode=pose.explode||0;
 // Reading: the phone pulls back (more when the car is open or on a lateral track take), mostly with
 // the lens, so the camera does not back into the set pieces around the bay.
 const k=1.4+explode*.45+(pose.pull||0),kd=1+(k-1)*.35;
 let target=[...pose.target],camera=target.map((v,i)=>v+(pose.camera[i]-v)*kd);
 // The tyre rack behind the bay (garage.js, az≈138°) lies on the Hipótese orbit line; the portrait
 // orbit runs ≈24° ahead of it (reading and the floor close), so the narrow frame leaves the rack out.
 const swing=scalar(PORTRAIT_SWING,p)*24*RAD,turn=(x,z,cx,cz)=>[cx+(x-cx)*Math.cos(swing)+(z-cz)*Math.sin(swing),cz-(x-cx)*Math.sin(swing)+(z-cz)*Math.cos(swing)];
 if(swing)[camera[0],camera[2]]=turn(camera[0],camera[2],target[0],target[2]);
 // The lifted portrait frame shows more of the rear wall: in Corrigir and on the loop frame the lens
 // rises ≈7° more so the INTEIA sign leaves the top instead of sitting cut under the header logo.
 const tilt=scalar(PORTRAIT_TILT,p);
 if(tilt)camera[1]+=Math.hypot(camera[0]-target[0],camera[2]-target[2])*Math.tan(7*RAD)*tilt;
 let fov=2*Math.atan(Math.tan(pose.fov*1.32/2*RAD)*k/kd)/RAD,offsetY=.2*(1-free);
 if(free>0){
  // Track (camera r6, cinema r5 M6): the car fills more of the width and sits low in the frame; the lens comes
  // down and aims above the car, so the lit stands fill the top instead of dark asphalt filling the bottom.
  const race=pose.track||0,fill=PORTRAIT_FILL+.2*race;
  const centre=[0,.5+.7*race,0],v=pose.camera.map((x,i)=>x-centre[i]);
  v[1]*=1-.3*race;
  if(swing)[v[0],v[2]]=turn(v[0],v[2],0,0);
  const len=Math.hypot(...v)||1,h=Math.hypot(v[0],v[2])||1;
  // Half-width of the car across the lens: the side view shows its length, the end view its width
  // plus the wheels that fly out with the explode.
  const half=Math.abs(v[2])/h*(.95+1.5*explode)+Math.abs(v[0])/h*2.6;
  let d=len,f=lens(half,d,aspect,fill);
  if(f>PORTRAIT_WIDE){f=PORTRAIT_WIDE;d=Math.min(len*1.5,half/(fill*aspect*Math.tan(f/2*RAD)));}
  else if(f<30){f=30;d=Math.max(3.2,half/(fill*aspect*Math.tan(f/2*RAD)));}
  const eye=centre.map((c,i)=>c+v[i]/len*d);
  // On the track the estimate above over-fills the low rear views and under-fills the quarters; the lens is set
  // from the car's projected bounding box instead (≈86% of the width; the silhouette reads ≈65–75%).
  if(race>0){
   const b=boxSpan(eye,centre,f,aspect),dist=Math.hypot(...centre.map((c,i)=>c-eye[i]));
   // Centre the box: slide the aim along the lens's right vector by the box's offset, measured on the lens it was seen with.
   const slide=b.centre*2*dist*Math.tan(f/2*RAD)*aspect*race;
   f+=(Math.min(PORTRAIT_WIDE,Math.max(12,2*Math.atan(Math.tan(f/2*RAD)*b.width/.9)/RAD))-f)*race;
   for(let i=0;i<3;i++)centre[i]+=b.right[i]*slide;
  }
  camera=camera.map((x,i)=>x+(eye[i]-x)*free);
  target=target.map((x,i)=>x+(centre[i]-x)*free);
  fov+=(f-fov)*free;
 }
 // The lesson screen (3.52–3.92) owns the portrait frame: aimed at its centre and not lifted, so the big
 // cards on the monitor are not cut on the left (garage.js anchors.monitors).
 const lesson=smooth((p-3.52)/.12)*(1-smooth((p-3.745)/.075));
 if(lesson>0){target=target.map((v,i)=>v+(MONITORS[i]-v)*lesson);offsetY*=1-lesson;}
 // Reverse shot inside the box (1.68–1.97): a wide lens keeps the lens in front of the rear wall.
 const bay=smooth((p-1.68)/.1)*(1-smooth((p-1.83)/.14));
 if(bay>0){
  camera=[camera[0]+(-1.5-camera[0])*bay,camera[1]+(3.3-camera[1])*bay+4.8*bay*(1-bay),camera[2]+(-5.6-camera[2])*bay];
  target=target.map((v,i)=>v+([0,.4,0][i]-v)*bay);
  fov+=(75-fov)*bay;offsetY*=1-bay;
 }
 return {camera,target,fov,offsetY,free};
}

// Dedicated monitor reading (monitor-scene.js, reading 0..1; camera r6 G2/M5). The shot never locks off: inside
// each page the lens dollies in ≈4% on a slight arc while the focus racks from the card label to its number;
// around each page change (the card swaps at 1/3 and 2/3, garage.js setLessonProgress) a short pan moves it to
// the next station. Screen: garage.js MON, 1.14×0.64 m facing +X; (u,v) are texture coordinates, 0,0 top left.
const SCREEN={c:[-4.716,1.52,-1.35],w:1.14,h:.64};
export const screenPoint=(u,v)=>[SCREEN.c[0],SCREEN.c[1]+SCREEN.h*(.5-v),SCREEN.c[2]+SCREEN.w*(.5-u)];
// Stations at a page start: [yaw° toward +Z (the label side), distance, lift, aim u, aim v].
// wide: the screen ≈60% of the width, clear of the scene title and the controls, never square-on.
// tall (phones): the text block (u .03–.72) spans the width at a steep angle, so the screen is ≥40% of the height.
// arc: yaw drift per page, signed like the pan that follows or precedes it, so the lens never reverses and stalls.
const SHOT={
 wide:{fov:26,dolly:.045,arc:[-4,-4,4],stations:[[16,2.5,.08,.5,.5],[-9,2.44,.02,.5,.5],[11,2.38,-.03,.5,.5]]},
 tall:{fov:34,dolly:.04,arc:[-3,-3,3],stations:[[50,2.55,.06,.375,.5],[46,2.6,.02,.39,.5],[52,2.5,-.02,.375,.5]]}
};
// Label and number of each card (garage.js drawCaseScreen), in texture coordinates.
const CARD_FOCUS=[[[.24,.13],[.33,.4]],[[.24,.13],[.3,.52]],[[.28,.13],[.32,.52]]];
const PAN=.12;
export function monitorShot(reading,aspect=1440/900){
 const x=clamp(Number.isFinite(reading)?reading:0)*3,rig=aspect<1?SHOT.tall:SHOT.wide;
 const page=Math.min(2,Math.floor(x)),u=x-page;
 const at=(k,t)=>{const [yaw,d,lift,au,av]=rig.stations[k];return [yaw+rig.arc[k]*t,d*(1-rig.dolly*t),lift+.03*t,au,av];};
 const mixed=(a,b,k)=>a.map((v,i)=>v+(b[i]-v)*k);
 // Both stations keep drifting under the pan, so the lens never comes to rest where the pan lands.
 const s=page<2&&u>1-PAN?mixed(at(page,u),at(page+1,u-1),smooth((u-1+PAN)/(2*PAN)))
  :page>0&&u<PAN?mixed(at(page-1,u+1),at(page,u),smooth((u+PAN)/(2*PAN))):at(page,u);
 const [yaw,d,lift,au,av]=s,target=screenPoint(au,av);
 const camera=[target[0]+Math.cos(yaw*RAD)*d,target[1]+lift,target[2]+Math.sin(yaw*RAD)*d];
 const [label,number]=CARD_FOCUS[page],k=smooth(u/.45);
 return {camera,target,fov:rig.fov,focus:screenPoint(label[0]+(number[0]-label[0])*k,label[1]+(number[1]-label[1])*k),focusRange:.45+.5*k,bokehScale:2.2-k};
}
export function assessChoice(chapter,choice){return {correct:choice===chapter.correct,message:chapter.feedback};}
export function exportNotebook(values,now=new Date().toISOString()){
 const safe={};for(const [k,v] of Object.entries(values)){if(typeof v==='string')safe[k]=v;}
 // Empty fields are listed, never filled: a gap stays visible to the next reader.
 const camposSemRegistro=[...FIELDS.map(([key])=>key),'decision'].filter(key=>!(typeof values[key]==='string'&&values[key].trim()));
 return {...safe,camposSemRegistro,schemaVersion:1,exportedAt:now,origin:'Anotações do aluno; não verificadas automaticamente'};
}
