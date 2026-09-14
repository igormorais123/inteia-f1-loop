// Chapter 07 staging as a pure function of the chapter progress (0..1): camera, lens, engine cover,
// section cut and work light. scene.js blends it over the closing story pose; tests/engine-chapter.test.mjs
// checks continuity, reversibility and that each lesson has its own frame on its own part.
const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};

// Power-unit parts in the car's world frame, as seated by in-car.js (assembly boxes measured in the browser).
export const ENGINE_PARTS={
 crank:[0,.37,-.60],     // assembly_rotating: crankshaft, rods and pistons
 pistons:[-.02,.47,-.62],
 intake:[0,.59,-.70],    // assembly_intake: plenum and runners
 runners:[.05,.52,-.50],
 turbo:[-.03,.40,-.95]   // assembly_turbo, at the rear of the bay
};
// Reading windows of the three lessons; engineBeat (chapter.js) switches the copy between them.
export const ENGINE_WINDOWS=[[.30,.45],[.55,.67],[.77,.90]];
// Portrait aim: the middle of the power unit (block and crank), between the lesson parts.
const MOBILE_AIM=[0,.45,-.66];

// Camera keys [progress, camera, target]. Readings drift (never a frozen plate); travels between them
// are short and motivated: rise from the block to the air that enters, orbit to what is coupled at the rear.
const KEYS=[
 [.00,[2.90,2.45,2.90],[0,.55,-.40]],   // wide 3/4 from the closing side: the cover lifts
 [.14,[2.45,2.05,1.45],[0,.50,-.60]],
 [.24,[1.60,1.35,.15],[0,.42,-.62]],    // over the sidepod, into the bay
 [.30,[1.34,.92,-.26],[0,.42,-.60]],    // 1 block: the section opens on the crank
 [.45,[1.18,.84,-.86],[0,.41,-.64]],
 [.55,[.95,1.62,.30],[0,.52,-.68]],     // 2 intake: from above and aside, where the air enters
 [.67,[.62,1.58,-.05],[0,.54,-.76]],
 [.72,[1.15,1.65,-1.05],[0,.46,-.84]],  // up and over the plenum, never through it
 [.77,[1.00,1.02,-1.85],[-.02,.42,-.92]], // 3 turbo: from the rear, what is coupled and measured
 [.90,[.78,.94,-1.70],[-.02,.40,-.90]],
 [1.0,[2.70,2.30,-1.10],[0,.50,-.62]]   // pull out while the car closes
];
// Rack focus [progress, point]: equal neighbours hold, a change racks.
const FOCUS=[
 [0,[0,.55,-.45]],[.24,[0,.45,-.60]],
 [.30,[.10,.30,-.40]],[.37,ENGINE_PARTS.crank],[.45,ENGINE_PARTS.crank],
 [.55,ENGINE_PARTS.runners],[.61,ENGINE_PARTS.intake],[.67,ENGINE_PARTS.intake],
 [.77,ENGINE_PARTS.pistons],[.83,ENGINE_PARTS.turbo],[.90,ENGINE_PARTS.turbo],
 [1,[0,.50,-.60]]
];
// Sharp depth (m) and bokeh scale: wide while the car opens, a thin slice on each part during readings.
const RANGE=[[0,3],[.2,1.2],[.30,.36],[.45,.36],[.50,.7],[.55,.40],[.67,.40],[.72,.7],[.77,.30],[.90,.30],[1,3]];
const BOKEH=[[0,1.2],[.2,2.2],[.30,3.6],[.45,3.6],[.50,2.6],[.55,3.4],[.67,3.4],[.72,2.6],[.77,3.8],[.90,3.8],[1,1.2]];
const FOV=[[0,34],[.24,32],[.30,30],[.90,30],[1,34]];

function segment(keys,p){let i=0;while(i<keys.length-2&&p>keys[i+1][0])i++;return i;}
// Monotone-limited Catmull-Rom tangent (as in story.js): no axis overshoots its keys.
function tangent(keys,i,slot,axis){
 const a=keys[Math.max(0,i-1)],b=keys[i],c=keys[Math.min(keys.length-1,i+1)];
 if(a===b)return (c[slot][axis]-b[slot][axis])/(c[0]-b[0]);
 if(b===c)return (b[slot][axis]-a[slot][axis])/(b[0]-a[0]);
 const d0=(b[slot][axis]-a[slot][axis])/(b[0]-a[0]),d1=(c[slot][axis]-b[slot][axis])/(c[0]-b[0]);
 if(d0*d1<=0)return 0;
 const m=(c[slot][axis]-a[slot][axis])/(c[0]-a[0]),cap=3*Math.min(Math.abs(d0),Math.abs(d1));
 return Math.sign(m)*Math.min(Math.abs(m),cap);
}
function spline(slot,p){
 const i=segment(KEYS,p),k1=KEYS[i],k2=KEYS[i+1],dt=k2[0]-k1[0],t=clamp((p-k1[0])/dt),t2=t*t,t3=t2*t;
 const h00=2*t3-3*t2+1,h10=t3-2*t2+t,h01=-2*t3+3*t2,h11=t3-t2;
 return k1[slot].map((v,axis)=>h00*v+h10*tangent(KEYS,i,slot,axis)*dt+h01*k2[slot][axis]+h11*tangent(KEYS,i+1,slot,axis)*dt);
}
function eased(keys,p){
 const i=segment(keys,p),[t0,a]=keys[i],[t1,b]=keys[i+1],s=smooth((p-t0)/(t1-t0));
 return Array.isArray(a)?a.map((v,k)=>v+(b[k]-v)*s):a+(b-a)*s;
}

/** Chapter 07 shot at progress p (0..1). weight blends it over the closing story pose. */
export function engineShot(progress,mobile=false){
 const p=clamp(Number.isFinite(progress)?progress:0);
 let camera=spline(1,p),target=spline(2,p);
 let fov=eased(FOV,p);
 // Portrait: the engine sits above the copy (upper half), so the lens pulls back and opens instead of
 // cropping the part under the header; the aim leans towards the engine centre so a part at the edge of the
 // bay (the turbo) does not push the block out of the narrow frame.
 if(mobile){const aim=target.map((v,i)=>v+(MOBILE_AIM[i]-v)*.4);camera=camera.map((v,i)=>aim[i]+(v-target[i])*1.6);target=aim;fov+=9;}
 return {
  weight:smooth(p/.12),
  camera,target,fov,
  focus:eased(FOCUS,p),range:eased(RANGE,p),bokeh:eased(BOKEH,p),
  // The engine cover rises with the first move and settles back while the camera leaves.
  open:smooth((p-.03)/.17)*(1-smooth((p-.93)/.07)),
  // The section sweeps through the block as the lens enters the bay, and closes before the cover.
  cut:smooth((p-.20)/.10)*(1-smooth((p-.905)/.05)),
  light:smooth((p-.06)/.2)*(1-smooth((p-.94)/.06))
 };
}
