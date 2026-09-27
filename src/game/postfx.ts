/**
 * Киношный постпроцессинг в духе TLOU:
 * SSAO → bloom → цветокор (teal-olive тени, тёплые блики) → зерно → виньетка → CA → SMAA.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    hurt: { value: 0 },
    echo: { value: 0 },
    aim: { value: 0 },
    grain: { value: 0.11 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float hurt;
    uniform float echo;
    uniform float aim;
    uniform float grain;
    varying vec2 vUv;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

    vec3 grade(vec3 c){
      // lift / gamma / gain — TLOU: холодные тени, пыльные света
      vec3 shadows = vec3(0.06, 0.09, 0.08);
      vec3 mid = vec3(1.02, 1.00, 0.92);
      vec3 high = vec3(1.08, 1.02, 0.90);
      float l = dot(c, vec3(0.2126,0.7152,0.0722));
      vec3 s = mix(shadows, vec3(1.0), smoothstep(0.0, 0.35, l));
      c *= s * mid;
      c = mix(c, c * high, smoothstep(0.45, 1.0, l));
      // лёгкая десатурация в тенях
      float sat = mix(0.72, 0.92, smoothstep(0.15, 0.7, l));
      c = mix(vec3(l), c, sat);
      // контраст
      c = (c - 0.5) * 1.18 + 0.48;
      return c;
    }

    void main(){
      vec2 uv = vUv;
      // лёгкая хроматическая аберрация по краям
      float r = length(uv - 0.5);
      float ca = 0.0018 * r * r * (1.0 + aim * 0.8);
      float cr = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
      float cg = texture2D(tDiffuse, uv).g;
      float cb = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
      vec3 col = vec3(cr, cg, cb);

      col = grade(col);

      // виньетка
      float vig = smoothstep(1.15, 0.22, r);
      col *= mix(0.22, 1.0, vig);

      // плёночное зерно
      float n = hash(uv * vec2(1920.0,1080.0) + vec2(time * 37.0, time * 19.0));
      col += (n - 0.5) * grain;

      // урон — красная кромка
      col = mix(col, col * vec3(1.35, 0.25, 0.18), hurt * smoothstep(0.35, 1.0, r));

      // эхолокация — почти монохром, инверсия кромок
      if (echo > 0.01) {
        float l = dot(col, vec3(0.3,0.5,0.2));
        vec3 e = vec3(l * 0.15, l * 0.18, l * 0.16);
        e += vec3(0.55, 0.12, 0.08) * step(0.55, l) * 0.35;
        col = mix(col, e, echo);
      }

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

export class PostFX {
  composer: EffectComposer;
  grade: ShaderPass;
  bloom: UnrealBloomPass;
  ssao: SSAOPass | null = null;
  private smaa: SMAAPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    quality: "high" | "low"
  ) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    const pr = renderer.getPixelRatio();
    const w = Math.floor(size.x * pr);
    const h = Math.floor(size.y * pr);

    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(1);
    this.composer.setSize(w, h);

    this.composer.addPass(new RenderPass(scene, camera));

    if (quality === "high") {
      this.ssao = new SSAOPass(scene, camera as THREE.PerspectiveCamera, w, h);
      this.ssao.kernelRadius = 12;
      this.ssao.minDistance = 0.001;
      this.ssao.maxDistance = 0.08;
      this.ssao.output = SSAOPass.OUTPUT.Default;
      this.composer.addPass(this.ssao);
    }

    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), quality === "high" ? 0.28 : 0.16, 0.5, 0.82);
    this.composer.addPass(this.bloom);

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.smaa = new SMAAPass(w, h);
    this.composer.addPass(this.smaa);

    this.composer.addPass(new OutputPass());
  }

  resize(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    const pr = renderer.getPixelRatio();
    const w = Math.max(2, Math.floor(size.x * pr));
    const h = Math.max(2, Math.floor(size.y * pr));
    this.composer.setSize(w, h);
    this.smaa.setSize(w, h);
    this.bloom.setSize(w, h);
    if (this.ssao) {
      this.ssao.setSize(w, h);
      this.ssao.camera = camera;
    }
  }

  set(time: number, hurt: number, echo: number, aim: number) {
    const u = this.grade.uniforms;
    u.time.value = time;
    u.hurt.value = hurt;
    u.echo.value = echo;
    u.aim.value = aim;
  }

  render() {
    this.composer.render();
  }
}
