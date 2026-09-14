import * as THREE from 'three';

// Screen-space diagonal wipe (Corn Revolution grammar, ≈21°): one camera, two
// environments. During a transition the outgoing world is clipped to one side
// of the diagonal and the incoming world to the other, in a single render, so
// depth of field, bloom and fog stay correct. The post pass draws the edge band
// with the same function, which is why both share WIPE_GLSL.
export const wipeUniforms = {
  uWipePos: {value: -9},
  uWipeRes: {value: new THREE.Vector2(1, 1)},
  // Screen point (0..1, y up) the diagonal crosses mid-sweep; phones raise it into the 3D band above the text.
  uWipeCenter: {value: new THREE.Vector2(.5, .5)},
};

// Signed distance to the wipe line, in screen heights. Negative is lower-right
// (where the incoming world appears first), positive is upper-left.
export const WIPE_GLSL = /* glsl */`
uniform float uWipePos;
uniform vec2 uWipeRes;
uniform vec2 uWipeCenter;
float wipeHash(float n){return fract(sin(n)*43758.5453123);}
float wipeNoise(float x){float i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(wipeHash(i),wipeHash(i+1.),f);}
float wipeSigned(vec2 fragCoord){
  vec2 p=(fragCoord-uWipeCenter*uWipeRes)/uWipeRes.y;
  vec2 n=vec2(-.3535,.9354);
  float along=dot(p,vec2(.9354,.3535));
  float rough=(wipeNoise(along*9.)-.5)*.022+(wipeNoise(along*41.)-.5)*.006;
  return dot(p,n)+rough-uWipePos;
}
`;

// Range the wipe must sweep to cover every aspect ratio, portrait included.
export const WIPE_RANGE = .92;

/**
 * Per-world clip controller. side = 0 renders normally, +1 keeps the region
 * already swept (incoming world), -1 keeps the region not yet swept (outgoing).
 * patch() is safe on materials that already use onBeforeCompile.
 */
export function createWipeClip(name) {
  const uniforms = {uWipeSide: {value: 0}};
  const patched = new Set();
  function inject(shader) {
    Object.assign(shader.uniforms, wipeUniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uWipeSide;\n${WIPE_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\nif(uWipeSide!=0.&&wipeSigned(gl_FragCoord.xy)*uWipeSide>0.)discard;`);
  }
  return {
    name,
    uniforms,
    set side(v) { uniforms.uWipeSide.value = v; },
    get side() { return uniforms.uWipeSide.value; },
    patch(material) {
      if (!material || patched.has(material)) return material;
      patched.add(material);
      if (material.isShaderMaterial) {
        // Custom shaders must declare `uniform float uWipeSide;` + WIPE_GLSL
        // and call wipeDiscard() at the top of main(); see shaderChunk.
        Object.assign(material.uniforms, wipeUniforms, uniforms);
        return material;
      }
      const previous = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey?.bind(material);
      material.onBeforeCompile = (shader, renderer) => { previous?.call(material, shader, renderer); inject(shader); };
      material.customProgramCacheKey = () => (previousKey ? previousKey() : '') + '|wipe-v1';
      material.needsUpdate = true;
      return material;
    },
    patchObject(root) {
      root.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => this.patch(m)); });
    },
  };
}

// For ShaderMaterial / Points: prepend to the fragment shader, then call
// wipeDiscard(); as the first statement of main().
export const WIPE_SHADER_CHUNK = /* glsl */`
uniform float uWipeSide;
${WIPE_GLSL}
void wipeDiscard(){if(uWipeSide!=0.&&wipeSigned(gl_FragCoord.xy)*uWipeSide>0.)discard;}
`;
