import * as THREE from 'three';

// Ambient dust in the key light (R11): always on, one draw call, catches the warm key.
export function createDust({mobile}) {
  const count = mobile ? 260 : 820, positions = new Float32Array(count * 3), seeds = new Float32Array(count);
  let state = 91;
  const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
  for (let i = 0; i < count; i++) {
    positions.set([(random() * 2 - 1) * 6.5, random() * 3.4, (random() * 2 - 1) * 7], i * 3);
    seeds[i] = random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const uniforms = {uTime: {value: 0}, uScale: {value: 1}, uAmount: {value: 1}, uColor: {value: new THREE.Color('#ffd9b8')}};
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float seed;uniform float uTime;uniform float uScale;varying float vAlpha;
      void main(){
        vec3 p=position;float t=uTime*(.05+seed*.06);
        p.x+=sin(t+seed*31.)*.35;p.y=mod(p.y+t*.3,3.4);p.z+=cos(t*.8+seed*17.)*.35;
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;float d=-mv.z;
        gl_PointSize=uScale*(1.1+seed*2.8)*(6./max(d,1.2));
        vAlpha=smoothstep(1.2,3.5,d)*(1.-smoothstep(12.,22.,d))*(.25+.75*fract(seed*7.))*smoothstep(0.,.5,p.y)*(1.-smoothstep(2.7,3.4,p.y));
      }`,
    fragmentShader: /* glsl */`
      uniform float uAmount;uniform vec3 uColor;varying float vAlpha;
      void main(){float r=length(gl_PointCoord-.5)*2.;float a=exp(-r*r*3.)*(1.-smoothstep(.75,1.,r));gl_FragColor=vec4(uColor*a*vAlpha*uAmount,1.);}`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'Ambient dust';
  points.frustumCulled = false;
  points.renderOrder = 5;
  return {
    points,
    update(time, scale, amount, color) { uniforms.uTime.value = time; uniforms.uScale.value = scale; uniforms.uAmount.value = amount; if (color) uniforms.uColor.value.copy(color); },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
