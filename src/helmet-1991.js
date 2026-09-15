import * as THREE from 'three';

// Hand-built reconstruction from Morio's photographs of the 1991 Honda exhibition helmet.
// Metres, +Z forward; shared by the cockpit and the inspection gallery.
export function createHelmet1991({detail=128}={}) {
 const root=new THREE.Group();root.name='Ayrton Senna · Rheos 1991';
 const gs=[],ms=[],ts=[];const material=p=>{const m=new THREE.MeshPhysicalMaterial(p);ms.push(m);return m;};
 const yellow=material({color:'#ffc900',roughness:.25,metalness:0,clearcoat:1,clearcoatRoughness:.16});
 const black=material({color:'#111419',roughness:.7});
 const trim=material({color:'#202326',roughness:.38});
 const lining=material({color:'#25262b',roughness:1,side:THREE.BackSide});
 const silver=material({color:'#b8c0c3',metalness:1,roughness:.25});
 const green=material({color:'#167747',roughness:.25,clearcoat:1});
 const blue=material({color:'#041f51',roughness:.23,clearcoat:1});
 const white=material({color:'#eee9d7',roughness:.32,clearcoat:.8});
 const visorMat=material({color:'#071d21',roughness:.12,metalness:.28,clearcoat:1,clearcoatRoughness:.08,side:THREE.DoubleSide});
 // Microscopic lacquer texture and fine visor wear; no baked highlights.
 const grain=document.createElement('canvas');grain.width=grain.height=512;const gc=grain.getContext('2d'),pixels=gc.createImageData(512,512);let seed=1991;for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const v=122+(seed%13);pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;}gc.putImageData(pixels,0,0);const micro=new THREE.CanvasTexture(grain);ts.push(micro);for(const m of [yellow,green,blue]){m.bumpMap=micro;m.bumpScale=.000018;}
 function add(g,m,parent=root){gs.push(g);const o=new THREE.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 // Smooth crown, fuller rear shell, flattened cheek and projecting chin.
 const profile=[[-.14,.116],[-.13,.126],[-.10,.132],[-.05,.139],[0,.143],[.05,.142],[.09,.133],[.12,.113],[.145,.082],[.162,.04],[.168,0]];
 function radius(y){let i=1;while(i<profile.length-1&&y>profile[i][0])i++;const a=profile[i-1],b=profile[i],prev=profile[Math.max(0,i-2)],next=profile[Math.min(profile.length-1,i+1)];const t=THREE.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1),h=b[0]-a[0],m0=(b[1]-prev[1])/(b[0]-prev[0]),m1=(next[1]-a[1])/(next[0]-a[0]);return Math.max(0,(2*t*t*t-3*t*t+1)*a[1]+(t*t*t-2*t*t+t)*h*m0+(-2*t*t*t+3*t*t)*b[1]+(t*t*t-t*t)*h*m1);}
 function point(y,a,lift=0){
  const r=radius(y)+lift,c=Math.cos(a),f=Math.max(0,c),side=Math.pow(Math.abs(Math.sin(a)),6)*Math.max(0,c+.2);
  // Oval plan, flatter cheeks and a rearward crown: the helmet is not a surface of revolution.
  const cheek=1-.065*Math.exp(-Math.pow((y+.075)/.05,2));
  const x=Math.sin(a)*r*.90*cheek;
  const crownShift=-.018*THREE.MathUtils.smoothstep(y,.03,.168);
  const z=c*r*(c<0?1.19:1.02)+f*f*(.005+.055*(1-THREE.MathUtils.smoothstep(y,-.065,.075)))+crownShift;
  const shapedY=y*.96+side*(.024*Math.exp(-Math.pow((y+.035)/.043,2))-.010*Math.exp(-Math.pow((y-.06)/.03,2)));
  return new THREE.Vector3(x,shapedY,z);
 }
 function patch(y0,y1,a0,a1,m,lift=0,rows=36,cols=detail,parent=root){const p=[],uv=[],idx=[];for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){const a=THREE.MathUtils.lerp(a0,a1,i/cols),y=THREE.MathUtils.lerp(y0,y1,j/rows);p.push(...point(y,a,lift).toArray());uv.push(i/cols,j/rows);}for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const k=j*(cols+1)+i;idx.push(k,k+1,k+cols+1,k+1,k+cols+2,k+cols+1);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return add(g,m,parent);}
 // A real aperture, not a black sticker over a closed sphere.
 patch(.065,.168,-Math.PI,Math.PI,yellow,0,64);
 patch(-.14,-.035,-Math.PI,Math.PI,yellow);
 patch(-.035,.065,1.24,Math.PI*2-1.24,yellow);
 patch(-.14,.155,-Math.PI,Math.PI,lining,-.009,60);
 // Period paint: green above the opening, navy below, with fine contrasting pinstripes.
 for(const [lo,hi,m] of [[.055,.087,green],[-.065,-.032,blue]]){
  const start=lo>0?1.24:-Math.PI,end=lo>0?Math.PI*2-1.24:Math.PI;
  patch(lo,hi,start,end,m,.00045,10);
  for(const y of [lo-.002,hi+.0004]){patch(y,y+.0014,start,end,white,.0007,2);patch(y+.0016,y+.0022,start,end,lo>0?blue:green,.0007,2);}
 }
 patch(.069,.087,-1.24,1.24,green,.0005,8);patch(.088,.0895,-1.24,1.24,white,.0007,2);
 patch(-.14,-.132,-Math.PI,Math.PI,trim,.001,4);
 // Tubular aperture bead follows the cut-out boundary.
 function tube(points,r,m,parent=root){return add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),points.length*3,r,8,false),m,parent);}
 const perimeter=[];for(let i=0;i<=60;i++)perimeter.push(point(.065,-1.24+2.48*i/60,.001));for(let i=1;i<=20;i++)perimeter.push(point(.065-.1*i/20,1.24,.001));for(let i=1;i<=60;i++)perimeter.push(point(-.035,1.24-2.48*i/60,.001));for(let i=1;i<=20;i++)perimeter.push(point(-.035+.1*i/20,-1.24,.001));tube(perimeter,.0018,black);
 const shield=new THREE.Group();shield.name='Viseira · policarbonato fumê';root.add(shield);
 patch(-.033,.062,-1.27,1.27,visorMat,.003,28,detail,shield);
 patch(.041,.064,-1.26,1.26,blue,.004,8,detail,shield);
 // Canvas labels are independent textures, not baked lighting or a photo pasted on the shell.
 function label(y0,y1,a0,a1,draw,parent=root){const c=document.createElement('canvas');c.width=1024;c.height=256;const x=c.getContext('2d');draw(x,1024,256);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;ts.push(t);const m=material({map:t,transparent:true,depthWrite:false,roughness:.3,clearcoat:.8,polygonOffset:true,polygonOffsetFactor:-2});return patch(y0,y1,a0,a1,m,parent===shield?.0048:.001,12,64,parent);}
 function text(x,s,font,color='#f2f0e8'){x.fillStyle=color;x.font=font;x.textAlign='center';x.textBaseline='middle';x.fillText(s,512,128,960);}
 function emblem(x){x.fillStyle='#082353';x.translate(512,128);for(let i=0;i<3;i++){x.rotate(Math.PI*2/3);x.beginPath();x.moveTo(0,0);x.arc(0,0,113,0,Math.PI*.51);x.closePath();x.fill();}}
 function national(x){x.fillStyle='#071f48';x.fillRect(0,12,1024,232);text(x,'NACIONAL','bold 170px Arial');}
 label(-.124,-.085,-.48,.64,national);label(-.122,-.083,-.82,-.51,emblem);
 for(const side of [-1,1]){
  const angle=side*1.60;label(.096,.124,angle-.54,angle+.54,national);label(.129,.151,angle-.18,angle+.18,emblem);
  label(-.112,-.075,side*.95-.28,side*.95+.28,x=>{x.fillStyle='#eee9de';x.fillRect(0,0,1024,256);x.fillStyle='#16181b';x.strokeRect(4,4,1016,248);x.textAlign='center';x.font='bold 165px Georgia';x.fillText('BOSS',512,161);x.font='44px Arial';x.fillText("MEN’S FASHION",512,228);});
  label(-.105,-.08,side*1.62-.26,side*1.62+.26,x=>{x.fillStyle='#101317';x.fillRect(0,0,1024,256);text(x,'RHEOS','italic bold 165px Arial');x.font='35px Arial';x.fillText('H E L M E T',512,230);});
 }
 label(.119,.158,-.6,.6,x=>{x.fillStyle='#f4f0e5';x.fillRect(0,0,1024,256);x.fillStyle='#e23217';x.beginPath();x.moveTo(10,8);x.lineTo(1014,8);x.lineTo(1014,109);x.lineTo(512,52);x.lineTo(10,109);x.fill();x.fillStyle='#121212';x.font='bold 145px Georgia';x.textAlign='center';x.fillText('Marlboro',512,239);});
 label(.041,.063,-.89,.89,x=>text(x,'HONDA','bold 180px Georgia'),shield);
 for(const side of [-1,1])label(.041,.063,side*1.04-.1,side*1.04+.1,x=>{x.strokeStyle='#f0eee4';x.lineWidth=14;x.strokeRect(90,12,844,232);text(x,'H','bold 225px Arial');},shield);
 // Metal visor pivots, slotted heads and tear-off posts.
 function screw(a,y,r){const p=point(y,a,.005),o=add(new THREE.CylinderGeometry(r,r,.005,32),silver);o.position.copy(p);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(Math.sin(a),0,Math.cos(a)));const slot=add(new THREE.BoxGeometry(r*1.45,.001,r*.18),trim,o);slot.position.y=.0028;}
 for(const side of [-1,1]){screw(side*1.27,.036,.012);screw(side*1.06,.038,.0065);screw(side*.96,-.025,.003);}
 // Recessed chin vent surround with two narrow intake slots.
 patch(-.067,-.044,-.48,.48,yellow,.002,10);
 for(const side of [-1,1]){const pts=[];for(let i=0;i<16;i++)pts.push(point(-.053,side*.25-.15+.3*i/15,.003));tube(pts,.0011,trim);}
 // Interior roll and chin strap remain visible when inspecting from below.
 const interior=new THREE.Group();interior.name='Forro e cinta';root.add(interior);
 const ring=[];for(let i=0;i<=100;i++){const a=i/100*Math.PI*2;ring.push(new THREE.Vector3(Math.sin(a)*.104,-.133,Math.cos(a)*.12));}tube(ring,.012,black,interior);
 const strap=add(new THREE.BoxGeometry(.019,.11,.003),black,interior);strap.position.set(.07,-.171,.005);strap.rotation.z=.3;
 const buckle=add(new THREE.TorusGeometry(.014,.0025,8,32),silver,interior);buckle.position.set(.047,-.218,.005);buckle.scale.y=.7;
 root.userData.reference='https://commons.wikimedia.org/wiki/Category:Helmets_of_Ayrton_Senna_in_1991';
 return {root,shield,dispose(){root.removeFromParent();gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());}};
}
