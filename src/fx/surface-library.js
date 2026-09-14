/**
 * Deterministic surface details, authored in metres. No external texture fetch.
 *
 * const surfaces = createSurfaceLibrary(THREE, {renderer, mobile});
 * surfaces.applyTo(material, 'rubber', {uvSpanMeters: 0.65});
 * surfaces.maps.carbon // {color, normal, roughness, tileMeters}
 * surfaces.dispose(); // releases owned GPU textures, never caller materials
 *
 * applyTo creates per-material texture transforms: UV span is the physical
 * length represented by one UV unit, not a claim about arbitrary imported UVs.
 * Existing studio carbon projection is detected and retained at physical scale;
 * its roughness/albedo use triplanar coordinates, so UV normal maps are omitted.
 * The original asset has solid paint: its optional microdetail affects only
 * lacquer roughness/normal. It introduces neither metallic pigment nor glitter.
 */
export function createSurfaceLibrary(THREE, {renderer, mobile = false} = {}) {
 const size=mobile?256:512, owned=new Set(), applied=new WeakMap();
 const anisotropy=Math.min(mobile?4:8,renderer?.capabilities?.getMaxAnisotropy?.()??1);
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 // Coordinate hashing is independent of generation order and repeatable.
 const noise=(x,y,seed)=>{let n=Math.imul(x+seed,374761393)^Math.imul(y-seed,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
 function texture(bytes, color=false){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d');const image=ctx.createImageData(size,size);image.data.set(bytes);ctx.putImageData(image,0,0);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;map.anisotropy=anisotropy;owned.add(map);return map;
 }
 function bake(kind, tileMeters, pixel, normalStrength){
  const heights=new Float32Array(size*size),colors=new Uint8ClampedArray(size*size*4),rough=new Uint8ClampedArray(size*size*4),normals=new Uint8ClampedArray(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const i=y*size+x,j=i*4,{height,value,roughness}=pixel(x,y);heights[i]=height;
   colors[j]=colors[j+1]=colors[j+2]=Math.round(clamp(value)*255);colors[j+3]=255;
   rough[j]=rough[j+1]=rough[j+2]=Math.round(clamp(roughness)*255);rough[j+3]=255;
  }
  // Central differences wrap at each edge: tiles have no normal-map seam.
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const left=heights[y*size+(x+size-1)%size],right=heights[y*size+(x+1)%size],up=heights[((y+size-1)%size)*size+x],down=heights[((y+1)%size)*size+x];
   const resolutionScale=size/512,nx=(left-right)*normalStrength*resolutionScale,ny=(up-down)*normalStrength*resolutionScale,nz=1,length=Math.hypot(nx,ny,nz),j=(y*size+x)*4;
   normals[j]=(nx/length*.5+.5)*255;normals[j+1]=(ny/length*.5+.5)*255;normals[j+2]=(nz/length*.5+.5)*255;normals[j+3]=255;
  }
  const maps={color:texture(colors,true),roughness:texture(rough),normal:texture(normals),tileMeters};
  for(const [key,map] of Object.entries(maps))if(map?.isTexture)map.name=`INTEIA ${kind} ${key}`;
  return maps;
 }
 const carbon=bake('carbon',.024,(x,y)=>{
  const u=x/size*8,v=y/size*8,ix=Math.floor(u),iy=Math.floor(v),over=((ix-iy+16)%4)<2;
  const cross=over?v%1:u%1,along=over?u:v;
  const crown=Math.sin(Math.PI*cross)**.7,strand=Math.sin(along*Math.PI*24)*.5+.5;
  const edge=clamp(crown*3),variation=noise(x,y,71)-.5;
  return {height:crown*.65+strand*.035*edge,value:.13+crown*.055+strand*.01+variation*.006,roughness:.78+(1-crown)*.12+variation*.025};
 },1.3);
 const rubber=bake('rubber',.08,(x,y)=>{
  const grain=noise(x,y,139),soft=(noise(x>>2,y>>2,47)+noise(x>>3,y>>3,113))*.5;
  // Fine mould striations stay faint: no cracks, damage or fake wear history.
  const mould=Math.sin(x/size*Math.PI*96)*.5+.5;
  return {height:grain*.055+soft*.035+mould*.008,value:.11+soft*.025,roughness:.9+grain*.06};
 },.7);
 const aluminum=bake('aluminum',.12,(x,y)=>{
  const band=noise(0,y,307),grain=noise(x,y,311),wave=Math.sin(x/size*Math.PI*8+y/size*Math.PI*2)*.5+.5;
  return {height:band*.06+grain*.004,value:.66+band*.035,roughness:.66+band*.16+wave*.025};
 },.6);
 const paint=bake('paint',.035,(x,y)=>{
  const grain=noise(x,y,733),orangePeel=Math.sin(x/size*Math.PI*32)*Math.sin(y/size*Math.PI*28);
  return {height:orangePeel*.022+(grain-.5)*.008,value:1,roughness:.92+orangePeel*.025+(grain-.5)*.018};
 },.4);
 const maps={carbon,rubber,aluminum,paint};
 function transformed(map,repeat){const clone=map.clone();clone.repeat.setScalar(repeat);clone.needsUpdate=true;owned.add(clone);return clone;}
 function applyTo(material,kind,{uvSpanMeters=1}={}){
  if(!maps[kind])throw new Error(`Unknown surface: ${kind}`);
  if(!material?.isMeshStandardMaterial)throw new TypeError('Surface requires MeshStandardMaterial or MeshPhysicalMaterial');
  if(applied.has(material))return material;
  const surface=maps[kind],repeat=clamp(uvSpanMeters/surface.tileMeters,.1,128);
  const roughness=transformed(surface.roughness,repeat),normal=transformed(surface.normal,repeat);
  material.roughnessMap=roughness;material.normalMap=normal;material.bumpMap=null;
  material.normalScale.setScalar(kind==='carbon'?.32:kind==='rubber'?.18:.12);
  if(kind==='carbon'){
   material.map=transformed(surface.color,repeat);material.color.set('#ffffff');material.roughness=.57;material.metalness=.04;
   if(material.isMeshPhysicalMaterial){material.clearcoat=.28;material.clearcoatRoughness=.25;}
   // The lab shader reads raw triplanar UVs, bypassing Texture.repeat.
   const previous=material.onBeforeCompile,cache=material.customProgramCacheKey();
   if(cache.includes('carbon-local-triplanar')){
    material.normalMap=null;
    material.onBeforeCompile=function(shader,...args){previous.call(this,shader,...args);shader.fragmentShader=shader.fragmentShader.replace('vec3 p = vCarbonPosition * 3.0;',`vec3 p = vCarbonPosition * ${(1/surface.tileMeters).toFixed(6)};`);};
    material.customProgramCacheKey=()=>cache+'-physical-twill-24mm';
   }
  }else if(kind==='rubber'){
   material.map=null;material.color.set('#202124');material.metalness=0;material.roughness=.85;
  }else if(kind==='aluminum'){
   material.metalness=.85;material.roughness=.48;
   // Imported steel parts do not guarantee a usable tangent frame. Keep the brushed maps isotropic.
   if(material.isMeshPhysicalMaterial){material.anisotropy=0;material.anisotropyRotation=0;}
  }else {
   material.metalness=0;material.roughness=.27;
   if(material.isMeshPhysicalMaterial){material.clearcoat=.72;material.clearcoatRoughness=.16;}
  }
  material.needsUpdate=true;applied.set(material,kind);return material;
 }
 return {maps,applyTo,metadata:{size,seeded:true,carbonWeave:'2/2 twill, 3 mm tow',paint:'Solid pigment; microdetail in lacquer only'},dispose(){for(const map of owned)map.dispose();owned.clear();}};
}
