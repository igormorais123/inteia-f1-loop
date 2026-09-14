import {
  EffectComposer, RenderPass, EffectPass, Effect, BloomEffect, DepthOfFieldEffect, NoiseEffect,
  VignetteEffect, SMAAEffect, ChromaticAberrationEffect, ToneMappingEffect, ToneMappingMode,
  BlendFunction, KernelSize, SMAAPreset,
} from 'postprocessing';
import {HalfFloatType, Matrix4, Uniform, Vector2, Vector3} from 'three';
import {EffectAttribute} from 'postprocessing';
import {WIPE_GLSL, wipeUniforms} from './wipe-clip.js';
import {SpeedEffect} from './speed.js';
import {TRACK_TOP_SPEED} from '../world/track.js';

// Film skin (R9) plus the diagonal wipe edge (R6) and a per-chapter grade (R10):
// cold shadows, warm highlights. Runs after tone mapping, before grain.
const cinemaFragment = /* glsl */`
uniform float uBand;
uniform float uTime;
uniform vec3 uShadow;
uniform vec3 uHigh;
uniform float uGrade;
${WIPE_GLSL}
float cinemaHash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){
  vec3 c=inputColor.rgb;
  float l=dot(c,vec3(.2126,.7152,.0722));
  c=mix(c,c*mix(uShadow,uHigh,smoothstep(.05,.7,l)),uGrade);
  if(uBand>0.){
    float s=wipeSigned(gl_FragCoord.xy);
    float grit=cinemaHash(floor(gl_FragCoord.xy*.5)+floor(uTime*24.));
    // Soft, grainy shadow edge (R6): the cut reads as a camera wipe, not a drawn line.
    float width=.05*uBand;
    float core=1.-smoothstep(0.,width,abs(s));
    c=mix(c,vec3(.01,.014,.018)*(.6+grit*.8),core*core*.96);
  }
  outputColor=vec4(c,inputColor.a);
}`;

class CinemaEffect extends Effect {
  constructor() {
    super('CinemaEffect', cinemaFragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['uBand', new Uniform(0)], ['uTime', new Uniform(0)], ['uGrade', new Uniform(1)],
        ['uShadow', new Uniform(new Vector3(.9, 1.0, 1.06))], ['uHigh', new Uniform(new Vector3(1.05, 1.0, .94))],
        ['uWipePos', wipeUniforms.uWipePos], ['uWipeRes', wipeUniforms.uWipeRes], ['uWipeCenter', wipeUniforms.uWipeCenter],
      ]),
    });
  }
}

// Camera motion blur by depth reprojection: fast travels smear like a shutter, still frames stay sharp.
const motionFragment = /* glsl */`
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProj;
uniform float uStrength;
void mainImage(const in vec4 inputColor,const in vec2 uv,const in float depth,out vec4 outputColor){
  vec4 world=uInvViewProj*vec4(uv*2.-1.,depth*2.-1.,1.);world/=world.w;
  vec4 prev=uPrevViewProj*world;prev/=prev.w;
  vec2 velocity=(uv-(prev.xy*.5+.5))*uStrength;
  float speed=length(velocity);
  if(speed<.0006){outputColor=inputColor;return;}
  velocity*=min(1.,.035/speed);
  vec3 sum=inputColor.rgb;
  for(int i=1;i<9;i++){sum+=texture2D(inputBuffer,uv+velocity*(float(i)/8.-.5)).rgb;}
  outputColor=vec4(sum/9.,inputColor.a);
}`;

class MotionBlurEffect extends Effect {
  constructor() {
    super('MotionBlurEffect', motionFragment, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([['uInvViewProj', new Uniform(new Matrix4())], ['uPrevViewProj', new Uniform(new Matrix4())], ['uStrength', new Uniform(1)]]),
    });
  }
}

// A single NaN texel from any material is smeared by bloom and DOF blurs into a black frame.
// Replace invalid or runaway values before any blur reads the image.
const sanitizeFragment = /* glsl */`
void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){
  vec4 c=inputColor;
  if(any(isnan(c))||any(isinf(c))||!(c.r+c.g+c.b+c.a<1e5)) c=vec4(0.,0.,0.,1.);
  outputColor=vec4(clamp(c.rgb,0.,64.),clamp(c.a,0.,1.));
}`;

class SanitizeEffect extends Effect {
  constructor() { super('SanitizeEffect', sanitizeFragment, {blendFunction: BlendFunction.SET}); }
}

export function createPost(renderer, scene, camera, {mobile}) {
  const composer = new EffectComposer(renderer, {multisampling: 0, frameBufferType: HalfFloatType});
  composer.addPass(new RenderPass(scene, camera));
  const motion = mobile ? null : new MotionBlurEffect();
  composer.addPass(new EffectPass(camera, ...(motion ? [motion] : []), new SanitizeEffect()));
  const viewProj = new Matrix4(), previous = new Matrix4();
  let fresh = true;
  // Track speed (src/fx/speed.js): world shutter and radial drag in HDR, after sanitize and before
  // DOF/bloom. Off unless the track is running; the lesson cameras follow the car, so no camera blur
  // here (MotionBlurEffect above keeps that job).
  const speed = new SpeedEffect(camera, {samples: mobile ? 7 : 12, topSpeed: TRACK_TOP_SPEED, cameraBlur: false});
  const speedPass = new EffectPass(camera, speed);
  speedPass.enabled = false;
  composer.addPass(speedPass);
  const dof =mobile ? null : new DepthOfFieldEffect(camera, {focusDistance: 7, focusRange: 2.4, bokehScale: 3, resolutionScale: .6});
  const bloom = new BloomEffect({intensity: .55, luminanceThreshold: .82, luminanceSmoothing: .25, mipmapBlur: true, kernelSize: KernelSize.MEDIUM, radius: .68});
  composer.addPass(new EffectPass(camera, ...(dof ? [dof, bloom] : [bloom])));
  const chroma = mobile ? null : new ChromaticAberrationEffect({offset: new Vector2(.0007, .0005), radialModulation: true, modulationOffset: .4});
  if (chroma) composer.addPass(new EffectPass(camera, chroma));
  const tone = new ToneMappingEffect({mode: ToneMappingMode.AGX});
  const cinema = new CinemaEffect();
  const noise = new NoiseEffect({blendFunction: BlendFunction.SOFT_LIGHT, premultiply: false});
  noise.blendMode.opacity.value = mobile ? .08 : .15;
  const vignette = new VignetteEffect({offset: .22, darkness: mobile ? .6 : .8});
  composer.addPass(new EffectPass(camera, tone, cinema, noise, vignette));
  composer.addPass(new EffectPass(camera, new SMAAEffect({preset: mobile ? SMAAPreset.MEDIUM : SMAAPreset.HIGH})));
  const u = name => cinema.uniforms.get(name);
  return {
    composer, dof, bloom, speed,
    setSize(w, h) { composer.setSize(w, h); },
    // amount 0..1 (1 = TRACK_TOP_SPEED); the pass only runs while something moves.
    setSpeed(amount, radial = amount) { speed.setAmount(amount, radial); speedPass.enabled = speed.amount > 0 || speed.radial > 0; },
    render(dt) {
      if (motion) {
        camera.updateMatrixWorld();
        viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        if (fresh) { previous.copy(viewProj); fresh = false; }
        motion.uniforms.get('uInvViewProj').value.copy(viewProj).invert();
        motion.uniforms.get('uPrevViewProj').value.copy(previous);
        previous.copy(viewProj);
      }
      composer.render(dt);
    },
    // A scroll jump (hash, capture) must not smear the first frame.
    resetMotion() { fresh = true; },
    // Focus follows a world point: the director always says what is sharp (R8).
    focus(distance, range, bokeh) {
      if (!dof) return;
      dof.cocMaterial.focusDistance = distance;
      dof.cocMaterial.focusRange = range;
      dof.bokehScale = bokeh;
    },
    setBand(v, time) { u('uBand').value = v; u('uTime').value = time; },
    setGrade(shadow, high, amount = 1) { u('uShadow').value.set(...shadow); u('uHigh').value.set(...high); u('uGrade').value = amount; },
    setBloom(intensity) { bloom.intensity = intensity; },
    dispose() { composer.dispose(); },
  };
}
