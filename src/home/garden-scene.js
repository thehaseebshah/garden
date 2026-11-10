// The homepage's living garden: a WebGL scene behind the page content.
//
// A tree grows from the real notes (one limb per folder, one light per note),
// on a hill of wind-blown grass under an aurora. The light theme is the same
// garden by day. Bundled into src/site/scripts/vendor/garden-scene.js with
// `npm run vendor:home`; the page loads it only when WebGL 2 is available.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const V3 = THREE.Vector3;

// ---------------------------------------------------------------------------
// Shared GLSL
// ---------------------------------------------------------------------------

const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.0;
    a *= 0.5;
  }
  return s;
}
`;

// Height of the ground at (x, z). Must match terrainHeight() below.
const TERRAIN_GLSL = /* glsl */ `
float terrain(vec2 p) {
  float r2 = dot(p, p);
  return 0.55 * sin(p.x * 0.11 + 1.3) * cos(p.y * 0.09)
       + 0.30 * sin(p.x * 0.23 + p.y * 0.17)
       + 0.75 * exp(-r2 / 34.0)
       + 0.0016 * r2;
}
`;

function terrainHeight(x, z) {
  const r2 = x * x + z * z;
  return 0.55 * Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09)
    + 0.30 * Math.sin(x * 0.23 + z * 0.17)
    + 0.75 * Math.exp(-r2 / 34)
    + 0.0016 * r2;
}

const FOG_GLSL = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogDensity;
vec3 applyFog(vec3 color, float dist) {
  float f = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  return mix(color, uFogColor, clamp(f, 0.0, 1.0));
}
`;

const OUTPUT_GLSL = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function pickTier(gl) {
  // "?garden=low|medium|high" forces a quality tier (for trying them out).
  const forced = new URLSearchParams(window.location.search).get("garden");
  if (forced && Object.prototype.hasOwnProperty.call(TIERS, forced)) return forced;
  let rendererName = "";
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  if (info) rendererName = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || "");
  const software = /swiftshader|llvmpipe|software|basic render/i.test(rendererName);
  const saveData = navigator.connection && navigator.connection.saveData;
  const lowMemory = navigator.deviceMemory && navigator.deviceMemory <= 2;
  if (software || saveData || lowMemory) return "low";
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  return small || coarse ? "medium" : "high";
}

const TIERS = {
  low: { blades: 14000, dpr: 1, bloom: false, samples: 0, motes: 14, fireflies: 90 },
  medium: { blades: 30000, dpr: 1.5, bloom: true, samples: 0, motes: 24, fireflies: 160 },
  high: { blades: 80000, dpr: 2, bloom: true, samples: 4, motes: 38, fireflies: 260 },
};

// ---------------------------------------------------------------------------
// Sky: aurora and stars by night; sun, haze and clouds by day
// ---------------------------------------------------------------------------

function createSky(uniforms) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uDay: uniforms.uDay },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 mv = modelViewMatrix * vec4(position, 0.0);
        gl_Position = projectionMatrix * vec4(mv.xyz, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDay;
      varying vec3 vDir;
      ${NOISE_GLSL}

      float hash3(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      vec3 stars(vec3 d, float scale, float threshold) {
        vec3 p = d * scale;
        vec3 c = floor(p);
        vec3 f = fract(p) - 0.5;
        float h = hash3(c);
        vec3 o = vec3(hash3(c + 1.3), hash3(c + 2.7), hash3(c + 4.1)) - 0.5;
        float dist = length(f - o * 0.6);
        float twinkle = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
        float s = smoothstep(0.085, 0.0, dist) * step(threshold, h) * twinkle;
        return s * mix(vec3(0.7, 0.85, 1.0), vec3(1.0, 0.9, 0.75), hash3(c + 7.0));
      }

      // One aurora curtain: a sharp lower edge with a long fade upward, cut into rays.
      float curtain(float el, vec2 circ, float base, float amp, float freq, float seed, float t) {
        float e0 = base + amp * (vnoise(circ * freq + vec2(seed, t * 0.06)) - 0.5) * 2.0;
        float below = exp(-pow(max(e0 - el, 0.0) / 0.02, 2.0));
        float above = exp(-max(el - e0, 0.0) / (0.14 + 0.12 * vnoise(circ * 3.0 + seed)));
        float shape = el < e0 ? below : above;
        float rays = 0.35 + 0.65 * vnoise(circ * 34.0 + vec2(seed * 3.0 + t * 0.22, el * 1.5));
        float mask = smoothstep(0.28, 0.7, vnoise(circ * 1.4 + vec2(seed * 5.0, t * 0.025)));
        return shape * rays * mask;
      }

      void main() {
        vec3 d = normalize(vDir);
        vec2 circ = normalize(d.xz + vec2(1e-5));
        float y = d.y;

        // Night
        vec3 night = mix(vec3(0.010, 0.050, 0.042), vec3(0.003, 0.008, 0.016), smoothstep(-0.05, 0.65, y));
        night += vec3(0.006, 0.045, 0.032) * exp(-max(y, 0.0) * 8.0);
        float au = curtain(y, circ, 0.20, 0.09, 1.7, 1.0, uTime)
                 + 0.75 * curtain(y, circ, 0.34, 0.12, 1.2, 7.0, uTime * 1.2)
                 + 0.5 * curtain(y, circ, 0.50, 0.14, 0.9, 13.0, uTime * 0.8);
        vec3 auColor = mix(vec3(0.08, 1.0, 0.48), vec3(0.42, 0.22, 1.0), smoothstep(0.22, 0.75, y));
        night += auColor * au * 0.36 * smoothstep(0.02, 0.12, y);
        vec3 st = stars(d, 90.0, 0.84) + stars(d, 170.0, 0.88) * 0.6;
        night += st * smoothstep(0.0, 0.25, y) * (1.0 - min(au, 1.0) * 0.6);

        // Day
        vec3 sunDir = normalize(vec3(0.52, 0.36, -0.78));
        float sd = max(dot(d, sunDir), 0.0);
        vec3 day = mix(vec3(0.72, 0.88, 0.92), vec3(0.10, 0.36, 0.80), smoothstep(-0.02, 0.62, y));
        day += vec3(1.0, 0.86, 0.62) * (pow(sd, 400.0) * 3.0 + pow(sd, 10.0) * 0.32);
        vec2 cuv = d.xz / (y + 0.25) * 1.2 + uTime * 0.004;
        float cloud = smoothstep(0.5, 0.86, fbm(cuv * 1.5)) * smoothstep(0.03, 0.3, y);
        day = mix(day, vec3(1.0), cloud * 0.7);

        vec3 color = mix(night, day, uDay);

        // Two ridges of far hills
        float ridge1 = 0.035 + 0.05 * vnoise(circ * 2.5 + 3.0) + 0.02 * vnoise(circ * 9.0);
        float ridge2 = 0.012 + 0.036 * vnoise(circ * 4.0 + 11.0) + 0.012 * vnoise(circ * 17.0);
        vec3 hill1 = mix(vec3(0.008, 0.040, 0.032), vec3(0.42, 0.66, 0.70), uDay);
        vec3 hill2 = mix(vec3(0.005, 0.024, 0.018), vec3(0.24, 0.50, 0.30), uDay);
        color = mix(color, hill1, smoothstep(ridge1 + 0.003, ridge1 - 0.003, y));
        color = mix(color, hill2, smoothstep(ridge2 + 0.003, ridge2 - 0.003, y));

        gl_FragColor = vec4(color, 1.0);
        ${OUTPUT_GLSL}
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// ---------------------------------------------------------------------------
// Ground and grass
// ---------------------------------------------------------------------------

function createGround(uniforms) {
  const geometry = new THREE.PlaneGeometry(240, 240, 160, 160);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uDay: uniforms.uDay,
      uGlow: uniforms.uGlow,
      uFogColor: uniforms.uFogColor,
      uFogDensity: uniforms.uFogDensity,
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      ${TERRAIN_GLSL}
      void main() {
        vec3 p = position;
        p.y = terrain(p.xz);
        vWorld = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDay;
      uniform float uGlow;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      ${FOG_GLSL}
      void main() {
        float n = fbm(vWorld.xz * 0.35);
        float r2 = dot(vWorld.xz, vWorld.xz);
        vec3 night = mix(vec3(0.003, 0.016, 0.011), vec3(0.008, 0.040, 0.028), n);
        night += vec3(0.04, 0.42, 0.25) * exp(-r2 / 60.0) * (0.11 + 0.025 * sin(uTime * 0.8)) * uGlow;
        vec3 day = mix(vec3(0.06, 0.19, 0.04), vec3(0.13, 0.32, 0.07), n);
        vec3 color = mix(night, day, uDay);
        color = applyFog(color, distance(vWorld, cameraPosition));
        gl_FragColor = vec4(color, 1.0);
        ${OUTPUT_GLSL}
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

function createGrass(uniforms, count, rng) {
  // One blade: a tapered strip, 4 segments tall, in the XY plane.
  const SEGMENTS = 4;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const half = 0.5 * (1 - t * t);
    positions.push(-half, t, 0, half, t, 0);
  }
  for (let i = 0; i < SEGMENTS; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);

  const offsets = new Float32Array(count * 3); // x, z, facing
  const params = new Float32Array(count * 3); // height, phase, tint
  for (let i = 0; i < count; i++) {
    // Denser near the tree and the camera's orbit, thinning toward the horizon.
    const radius = 0.9 + 46 * Math.pow(rng(), 0.72);
    const angle = rng() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    offsets[i * 3] = x;
    offsets[i * 3 + 1] = z;
    offsets[i * 3 + 2] = rng() * Math.PI;
    const clump = 0.5 + 0.5 * Math.sin(x * 0.9 + Math.cos(z * 0.7) * 2.0) * Math.cos(z * 0.8);
    params[i * 3] = 0.3 + 0.45 * rng() + 0.4 * clump * rng();
    params[i * 3 + 1] = rng() * Math.PI * 2;
    params[i * 3 + 2] = rng();
  }
  geometry.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute("aParams", new THREE.InstancedBufferAttribute(params, 3));
  geometry.instanceCount = count;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uDay: uniforms.uDay,
      uGlow: uniforms.uGlow,
      uFogColor: uniforms.uFogColor,
      uFogDensity: uniforms.uFogDensity,
      uPointer: uniforms.uPointer,
      uPointerStrength: uniforms.uPointerStrength,
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 aOffset;
      attribute vec3 aParams;
      uniform float uTime;
      uniform vec3 uPointer;
      uniform float uPointerStrength;
      varying float vT;
      varying float vTint;
      varying float vPush;
      varying vec3 vWorld;
      ${TERRAIN_GLSL}
      void main() {
        float t = position.y;
        vec3 base = vec3(aOffset.x, terrain(aOffset.xy), aOffset.y);
        // Blades right under the camera would fill the frame: let them shrink away.
        float height = aParams.x * smoothstep(1.2, 5.5, distance(base, cameraPosition));

        float c = cos(aOffset.z), s = sin(aOffset.z);
        vec3 p = base + vec3(position.x * c, 0.0, position.x * s) * 0.055;

        // Wind: broad gusts rolling across the hill plus a faster flutter.
        vec2 windDir = normalize(vec2(1.0, 0.38));
        float gust = sin(dot(base.xz, vec2(0.13, 0.085)) - uTime * 0.9) * 0.5 + 0.5;
        float flutter = sin(base.x * 0.9 + uTime * 2.3 + aParams.y) * 0.5
                      + sin(base.z * 1.3 + uTime * 1.7 + aParams.y * 1.7) * 0.3;
        float bend = (0.10 + 0.42 * gust * gust + 0.08 * flutter) * t * t * height;

        // Blades lean away from the pointer.
        vec2 away = base.xz - uPointer.xz;
        float dist = length(away);
        float push = smoothstep(3.2, 0.0, dist) * uPointerStrength;
        vec2 lean = windDir * bend + (away / max(dist, 0.001)) * push * t * t * height * 0.9;

        p.xz += lean;
        p.y += t * height * (1.0 - 0.35 * min(dot(lean, lean) / max(height * height, 0.001), 1.0));

        vT = t;
        vTint = aParams.z;
        vPush = push;
        vWorld = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDay;
      uniform float uGlow;
      varying float vT;
      varying float vTint;
      varying float vPush;
      varying vec3 vWorld;
      ${FOG_GLSL}
      void main() {
        float r2 = dot(vWorld.xz, vWorld.xz);
        float t = vT;

        vec3 nightRoot = vec3(0.002, 0.012, 0.008);
        vec3 nightTip = mix(vec3(0.012, 0.085, 0.052), vec3(0.020, 0.130, 0.075), vTint);
        vec3 night = mix(nightRoot, nightTip, t);
        // Lit by the tree, by the aurora on the tips, and where the pointer passes.
        night += vec3(0.05, 0.55, 0.32) * exp(-r2 / 85.0) * (0.25 + 0.75 * t) * 0.2 * uGlow;
        night += vec3(0.03, 0.22, 0.15) * t * t * t * 0.5;
        night += vec3(0.25, 1.0, 0.62) * vPush * t * t * 0.9;

        vec3 dayRoot = vec3(0.03, 0.12, 0.02);
        vec3 dayTip = mix(vec3(0.18, 0.46, 0.06), vec3(0.36, 0.60, 0.10), vTint);
        vec3 day = mix(dayRoot, dayTip, t);
        day += vec3(0.35, 0.30, 0.05) * vPush * t * t;

        vec3 color = mix(night, day, uDay);
        color = applyFog(color, distance(vWorld, cameraPosition));
        gl_FragColor = vec4(color, 1.0);
        ${OUTPUT_GLSL}
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// The tree: trunk -> one limb per folder -> twigs ending in a light per note
// ---------------------------------------------------------------------------

function buildTreeData(folders, rng) {
  const paths = []; // { points: V3[], radii: number[], dists: number[] }
  const orbs = []; // { position: V3, dist, note, folder }

  // Adds a tube along the control points; returns samplers for branching off it.
  function addPath(controlPoints, r0, r1, dist0) {
    const curve = new THREE.CatmullRomCurve3(controlPoints, false, "catmullrom", 0.5);
    const length = curve.getLength();
    const segments = Math.max(3, Math.ceil(length * 3.2));
    const points = curve.getSpacedPoints(segments);
    const radii = [];
    const dists = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      radii.push(lerp(r0, r1, t));
      dists.push(dist0 + length * t);
    }
    paths.push({ points, radii, dists });
    return {
      length,
      at(t) {
        return {
          point: curve.getPointAt(t),
          tangent: curve.getTangentAt(t).normalize(),
          radius: lerp(r0, r1, t),
          dist: dist0 + length * t,
        };
      },
    };
  }

  function perpendicular(v) {
    const other = Math.abs(v.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
    const base = new V3().crossVectors(v, other).normalize();
    return base.applyAxisAngle(v, rng() * Math.PI * 2);
  }

  function limb(start, direction, length, r0, notes, folder, depth, dist0) {
    const control = [start.clone()];
    const d = direction.clone().normalize();
    let p = start.clone();
    const steps = 4;
    for (let i = 1; i <= steps; i++) {
      // Wander, and reach for the light.
      d.add(new V3((rng() - 0.5) * 0.55, 0.16 + (rng() - 0.5) * 0.25, (rng() - 0.5) * 0.55)).normalize();
      p = p.clone().addScaledVector(d, length / steps);
      control.push(p);
    }
    const path = addPath(control, r0, Math.max(0.022, r0 * 0.42), dist0);

    if (notes.length > 5 && depth < 3) {
      const parts = notes.length > 12 ? 3 : 2;
      const groups = Array.from({ length: parts }, () => []);
      notes.forEach((note, i) => groups[i % parts].push(note));
      groups.forEach((group, gi) => {
        const last = gi === parts - 1;
        const at = path.at(last ? 1 : 0.5 + (0.38 * gi) / Math.max(1, parts - 1));
        const angle = last ? 0.2 + rng() * 0.2 : 0.55 + rng() * 0.4;
        const next = at.tangent.clone().applyAxisAngle(perpendicular(at.tangent), angle);
        limb(at.point, next, length * (0.62 + rng() * 0.14), at.radius * 0.85, group, folder, depth + 1, at.dist);
      });
      return;
    }

    notes.forEach((note, i) => {
      const at = path.at(notes.length === 1 ? 1 : 0.38 + 0.62 * (i / (notes.length - 1)));
      const out = at.tangent.clone().applyAxisAngle(perpendicular(at.tangent), 0.55 + rng() * 0.8);
      out.y += 0.3;
      out.normalize();
      const twig = 0.45 + rng() * 0.6;
      const end = at.point.clone().addScaledVector(out, twig);
      const mid = at.point.clone().addScaledVector(out, twig * 0.5).add(new V3(0, twig * 0.12, 0));
      addPath([at.point, mid, end], Math.min(0.03, at.radius), 0.01, at.dist);
      orbs.push({ position: end, dist: at.dist + twig, note, folder });
    });
  }

  // Trunk
  const baseY = terrainHeight(0, 0) - 0.35;
  const trunkHeight = 3.7;
  const trunkControl = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    trunkControl.push(new V3(Math.sin(t * 2.2) * 0.28, baseY + t * trunkHeight, Math.sin(t * 1.6 + 0.6) * 0.2 - 0.11));
  }
  const trunk = addPath(trunkControl, 0.5, 0.2, 0);
  // Root flare
  const trunkPath = paths[0];
  trunkPath.radii = trunkPath.radii.map((r, i) => r + 0.4 * Math.exp(-(i / (trunkPath.radii.length - 1)) * 9));

  // Limbs: biggest folders lowest, spread by the golden angle.
  const ordered = folders
    .map((folder, index) => ({ folder, index }))
    .filter((entry) => entry.folder.notes.length > 0)
    .sort((a, b) => b.folder.notes.length - a.folder.notes.length);
  ordered.forEach((entry, i) => {
    const t = ordered.length === 1 ? 1 : 0.52 + 0.48 * (i / (ordered.length - 1));
    const at = trunk.at(t);
    const azimuth = i * 2.39996 + 0.9;
    const lift = lerp(0.45, 1.25, i / Math.max(1, ordered.length - 1));
    const direction = new V3(Math.cos(azimuth), lift, Math.sin(azimuth));
    const count = entry.folder.notes.length;
    limb(at.point, direction, 1.7 + 0.62 * Math.sqrt(count), at.radius * 0.72, entry.folder.notes, entry.index, 1, at.dist);
  });

  let maxDist = 0;
  for (const path of paths) maxDist = Math.max(maxDist, path.dists[path.dists.length - 1]);
  for (const orb of orbs) maxDist = Math.max(maxDist, orb.dist);
  return { paths, orbs, maxDist };
}

function createBranches(tree, uniforms) {
  const SIDES = 6;
  const positions = [];
  const centers = [];
  const normals = [];
  const grows = [];
  const indices = [];
  let vertexOffset = 0;

  const normal = new V3();
  const tangent = new V3();
  const binormal = new V3();
  const previousTangent = new V3();

  for (const path of tree.paths) {
    const { points, radii, dists } = path;
    // Parallel-transport frame along the path keeps the tube from twisting.
    tangent.subVectors(points[1], points[0]).normalize();
    normal.set(1, 0, 0);
    if (Math.abs(tangent.x) > 0.9) normal.set(0, 1, 0);
    normal.sub(tangent.clone().multiplyScalar(normal.dot(tangent))).normalize();

    for (let i = 0; i < points.length; i++) {
      if (i > 0) {
        previousTangent.copy(tangent);
        const next = points[Math.min(i + 1, points.length - 1)];
        const prev = points[i - 1];
        tangent.subVectors(next, prev).normalize();
        const axis = new V3().crossVectors(previousTangent, tangent);
        const sin = axis.length();
        if (sin > 1e-5) {
          axis.normalize();
          normal.applyAxisAngle(axis, Math.asin(clamp(sin, -1, 1)));
        }
        normal.sub(tangent.clone().multiplyScalar(normal.dot(tangent))).normalize();
      }
      binormal.crossVectors(tangent, normal).normalize();
      for (let s = 0; s < SIDES; s++) {
        const a = (s / SIDES) * Math.PI * 2;
        const nx = Math.cos(a) * normal.x + Math.sin(a) * binormal.x;
        const ny = Math.cos(a) * normal.y + Math.sin(a) * binormal.y;
        const nz = Math.cos(a) * normal.z + Math.sin(a) * binormal.z;
        positions.push(points[i].x + nx * radii[i], points[i].y + ny * radii[i], points[i].z + nz * radii[i]);
        centers.push(points[i].x, points[i].y, points[i].z);
        normals.push(nx, ny, nz);
        grows.push((dists[i] / tree.maxDist) * 0.9);
      }
      if (i < points.length - 1) {
        for (let s = 0; s < SIDES; s++) {
          const a = vertexOffset + i * SIDES + s;
          const b = vertexOffset + i * SIDES + ((s + 1) % SIDES);
          const c = a + SIDES;
          const d = b + SIDES;
          indices.push(a, b, c, b, d, c);
        }
      }
    }
    vertexOffset += points.length * SIDES;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aCenter", new THREE.Float32BufferAttribute(centers, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("aGrow", new THREE.Float32BufferAttribute(grows, 1));
  geometry.setIndex(indices);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uDay: uniforms.uDay,
      uGrow: uniforms.uGrow,
      uGlow: uniforms.uGlow,
    },
    vertexShader: /* glsl */ `
      attribute vec3 aCenter;
      attribute float aGrow;
      uniform float uGrow;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vGrow;
      void main() {
        float grown = smoothstep(0.0, 0.05, uGrow - aGrow);
        vec3 p = mix(aCenter, position, grown);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - p);
        vGrow = aGrow;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDay;
      uniform float uGrow;
      uniform float uGlow;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vGrow;
      void main() {
        vec3 n = normalize(vNormal);
        float rim = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 3.0);

        // Night: dark wood with a lit edge and light travelling up through it.
        vec3 night = vec3(0.006, 0.030, 0.020);
        night += vec3(0.10, 0.85, 0.50) * rim * 0.5 * uGlow;
        float sap = pow(sin(vGrow * 22.0 - uTime * 1.1) * 0.5 + 0.5, 28.0);
        night += vec3(0.20, 1.0, 0.60) * sap * 0.22 * uGlow;
        // The growing tip burns bright while the tree is still growing.
        float front = exp(-max(uGrow - vGrow, 0.0) * 26.0) * step(uGrow, 1.02);
        night += vec3(0.6, 1.0, 0.8) * front * 1.6;

        // Day: plain bark in sunlight.
        vec3 sunDir = normalize(vec3(0.52, 0.36, -0.78));
        float diffuse = max(dot(n, sunDir), 0.0) * 0.9 + 0.22 + 0.12 * n.y;
        vec3 day = vec3(0.27, 0.155, 0.085) * diffuse + vec3(0.9, 0.7, 0.4) * rim * 0.12;
        day += vec3(0.8, 0.95, 0.5) * front * 0.6;

        gl_FragColor = vec4(mix(night, day, uDay), 1.0);
        ${OUTPUT_GLSL}
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

// Soft round points. Additive at night; solid petals and leaves by day
// (premultiplied output, so the alpha channel picks the blend).
const POINT_FRAGMENT_COMMON = /* glsl */ `
  vec4 softPoint(vec3 nightColor, vec3 dayColor, float coreSize, float uDay, float strength) {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(coreSize, coreSize * 0.25, d);
    float halo = exp(-d * d * 4.5) * (1.0 - smoothstep(0.75, 1.0, d));
    vec3 night = nightColor * (halo * 0.55 + core * 1.6) + vec3(1.0) * core * 0.35;
    float dayAlpha = smoothstep(coreSize * 1.6, coreSize * 1.1, d);
    vec3 day = dayColor * (0.82 + 0.18 * core) * dayAlpha;
    vec3 rgb = mix(night, day, uDay) * strength;
    return vec4(rgb, dayAlpha * uDay * strength);
  }
`;

function additivePremultiplied(material) {
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  return material;
}

function createOrbs(tree, uniforms) {
  const count = tree.orbs.length;
  const positions = new Float32Array(count * 3);
  const data = new Float32Array(count * 4); // grow, seed, recent, size
  const hover = new Float32Array(count);
  tree.orbs.forEach((orb, i) => {
    positions.set([orb.position.x, orb.position.y, orb.position.z], i * 3);
    data[i * 4] = (orb.dist / tree.maxDist) * 0.9;
    data[i * 4 + 1] = Math.random();
    data[i * 4 + 2] = orb.note.r ? 1 : 0;
    data[i * 4 + 3] = orb.note.r ? 0.95 : 0.6 + Math.random() * 0.25;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aData", new THREE.BufferAttribute(data, 4));
  const hoverAttribute = new THREE.BufferAttribute(hover, 1);
  hoverAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aHover", hoverAttribute);

  const material = additivePremultiplied(new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uDay: uniforms.uDay,
      uGrow: uniforms.uGrow,
      uPointScale: uniforms.uPointScale,
    },
    vertexShader: /* glsl */ `
      attribute vec4 aData;
      attribute float aHover;
      uniform float uTime;
      uniform float uGrow;
      uniform float uPointScale;
      varying float vRecent;
      varying float vHover;
      varying float vPulse;
      void main() {
        float age = uGrow - aData.x;
        // Pop open with a little overshoot when the growth front arrives.
        float open = smoothstep(0.0, 0.07, age);
        open *= 1.0 + 0.6 * exp(-age * 30.0) * step(0.0, age);
        float pulse = 0.5 + 0.5 * sin(uTime * (1.2 + aData.y) + aData.y * 40.0);
        vec3 p = position + vec3(0.0, sin(uTime * 0.9 + aData.y * 20.0) * 0.035, 0.0);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aData.w * open * (0.95 + 0.14 * pulse + aHover * 0.9) * uPointScale / -mv.z;
        vRecent = aData.z;
        vHover = aHover;
        vPulse = pulse;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uDay;
      varying float vRecent;
      varying float vHover;
      varying float vPulse;
      ${POINT_FRAGMENT_COMMON}
      void main() {
        vec3 night = mix(vec3(0.16, 1.0, 0.58), vec3(1.0, 0.74, 0.26), vRecent);
        vec3 day = mix(vec3(1.0, 0.62, 0.74), vec3(1.0, 0.80, 0.22), vRecent);
        night = mix(night, vec3(0.85, 1.0, 0.92), vHover * 0.5);
        day = mix(day, vec3(1.0), vHover * 0.35);
        gl_FragColor = softPoint(night, day, 0.34, uDay, 0.85 + 0.25 * vPulse + vHover * 0.8);
        ${OUTPUT_GLSL}
      }
    `,
  }));
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 3;
  return { points, hover, hoverAttribute };
}

// A cloud of small lights (leaves by day) drifting around every note.
function createCanopy(tree, uniforms, perOrb, rng) {
  const count = tree.orbs.length * perOrb;
  const centers = new Float32Array(count * 3);
  const offsets = new Float32Array(count * 3);
  const data = new Float32Array(count * 4); // grow, seed, size, warm
  const gaussian = () => (rng() + rng() + rng() + rng() - 2) / 2;
  let i = 0;
  for (const orb of tree.orbs) {
    for (let k = 0; k < perOrb; k++, i++) {
      centers.set([orb.position.x, orb.position.y, orb.position.z], i * 3);
      offsets.set([gaussian() * 1.0, gaussian() * 0.7 + 0.1, gaussian() * 1.0], i * 3);
      data[i * 4] = Math.min(1, (orb.dist / tree.maxDist) * 0.9 + 0.02 + rng() * 0.08);
      data[i * 4 + 1] = rng();
      data[i * 4 + 2] = 0.35 + rng() * 0.75;
      data[i * 4 + 3] = rng() < 0.08 ? 1 : 0;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(centers, 3));
  geometry.setAttribute("aOffset", new THREE.BufferAttribute(offsets, 3));
  geometry.setAttribute("aData", new THREE.BufferAttribute(data, 4));

  const material = additivePremultiplied(new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uDay: uniforms.uDay,
      uGrow: uniforms.uGrow,
      uPointScale: uniforms.uPointScale,
    },
    vertexShader: /* glsl */ `
      attribute vec3 aOffset;
      attribute vec4 aData;
      uniform float uTime;
      uniform float uDay;
      uniform float uGrow;
      uniform float uPointScale;
      varying float vSeed;
      varying float vWarm;
      varying float vTwinkle;
      void main() {
        float seed = aData.y;
        float a = uTime * (0.08 + seed * 0.12) + seed * 6.283;
        float c = cos(a), s = sin(a);
        vec3 o = vec3(aOffset.x * c - aOffset.z * s, aOffset.y, aOffset.x * s + aOffset.z * c);
        o.y += sin(uTime * (0.4 + seed) + seed * 30.0) * 0.08;
        // Leaves gather a little closer by day so the crown reads as foliage.
        vec3 p = position + o * mix(1.0, 0.82, uDay);
        float open = smoothstep(0.0, 0.1, uGrow - aData.x);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float twinkle = 0.5 + 0.5 * sin(uTime * (1.5 + seed * 2.5) + seed * 50.0);
        float size = aData.z * mix(0.10 + 0.07 * twinkle, 0.40, uDay);
        gl_PointSize = size * open * uPointScale / -mv.z;
        vSeed = seed;
        vWarm = aData.w;
        vTwinkle = twinkle;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uDay;
      varying float vSeed;
      varying float vWarm;
      varying float vTwinkle;
      ${POINT_FRAGMENT_COMMON}
      void main() {
        vec3 night = mix(vec3(0.10, 0.85, 0.50), vec3(0.20, 0.75, 0.95), smoothstep(0.6, 1.0, vSeed));
        night = mix(night, vec3(1.0, 0.78, 0.35), vWarm);
        vec3 day = mix(vec3(0.16, 0.42, 0.10), vec3(0.42, 0.66, 0.16), vSeed);
        day = mix(day, vec3(1.0, 0.72, 0.80), vWarm);
        gl_FragColor = softPoint(night, day, 0.5, uDay, mix(0.12 + 0.3 * vTwinkle, 1.0, uDay));
        ${OUTPUT_GLSL}
      }
    `,
  }));
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  return points;
}

// Fireflies over the grass by night; drifting pollen by day.
function createFireflies(uniforms, count, rng) {
  const positions = new Float32Array(count * 3);
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const radius = 2 + 24 * Math.sqrt(rng());
    const angle = rng() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    positions.set([x, terrainHeight(x, z) + 0.4 + rng() * 3.2, z], i * 3);
    data.set([rng(), rng(), rng()], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aData", new THREE.BufferAttribute(data, 3));
  const material = additivePremultiplied(new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uDay: uniforms.uDay,
      uPointScale: uniforms.uPointScale,
    },
    vertexShader: /* glsl */ `
      attribute vec3 aData;
      uniform float uTime;
      uniform float uDay;
      uniform float uPointScale;
      varying float vBlink;
      void main() {
        float t = uTime * (0.25 + aData.x * 0.3);
        vec3 p = position + vec3(
          sin(t + aData.y * 20.0) * 1.4 + sin(t * 2.3 + aData.z * 9.0) * 0.3,
          sin(t * 1.3 + aData.x * 15.0) * 0.5,
          cos(t * 0.9 + aData.z * 20.0) * 1.4 + cos(t * 2.1 + aData.y * 9.0) * 0.3);
        float blink = pow(max(sin(uTime * (0.8 + aData.y * 1.4) + aData.z * 40.0), 0.0), 5.0);
        vBlink = mix(blink, 0.6, uDay);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = mix(0.34, 0.07, uDay) * (0.5 + 0.5 * vBlink) * uPointScale / -mv.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uDay;
      varying float vBlink;
      ${POINT_FRAGMENT_COMMON}
      void main() {
        gl_FragColor = softPoint(vec3(0.80, 1.0, 0.42), vec3(1.0, 1.0, 0.92), 0.3, uDay, vBlink);
        ${OUTPUT_GLSL}
      }
    `,
  }));
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 4;
  return points;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export function startGardenScene({ canvas, data, label }) {
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  const gl = renderer.getContext();
  const tierName = pickTier(gl);
  const tier = TIERS[tierName];
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x020806, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 500);

  const uniforms = {
    uTime: { value: 0 },
    uDay: { value: document.body.classList.contains("theme-light") ? 1 : 0 },
    uGrow: { value: 0 },
    uGlow: { value: 0 },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.021 },
    uPointer: { value: new V3(0, 0, 9999) },
    uPointerStrength: { value: 0 },
    uPointScale: { value: 1 },
  };

  const rng = mulberry32(20261110);
  const tree = buildTreeData(data.folders, rng);

  const sky = createSky(uniforms);
  sky.scale.setScalar(400);
  scene.add(sky);
  scene.add(createGround(uniforms));
  scene.add(createGrass(uniforms, tier.blades, rng));
  scene.add(createBranches(tree, uniforms));
  scene.add(createCanopy(tree, uniforms, tier.motes, rng));
  const orbs = createOrbs(tree, uniforms);
  scene.add(orbs.points);
  scene.add(createFireflies(uniforms, tier.fireflies, rng));

  // Post-processing: bloom makes the lights glow.
  let composer = null;
  let bloomPass = null;
  if (tier.bloom) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: tier.samples });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.6, 0.6);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  // ---- Sizing -------------------------------------------------------------
  let width = 0;
  let height = 0;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, tier.dpr);
  function resize(force) {
    const w = window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    // Phones resize the viewport as the address bar hides; don't rebuild for that.
    if (!force && w === width && Math.abs(h - height) < 140) return;
    width = w;
    height = h;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    if (composer) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
    }
    camera.aspect = width / height;
    camera.fov = width < height ? 58 : 46;
    camera.updateProjectionMatrix();
    uniforms.uPointScale.value = (height * pixelRatio * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    needsRender = true;
  }

  // ---- Scroll, pointer, theme --------------------------------------------
  let needsRender = true;
  let scrollHero = 0; // 0 at the top, 1 one screen down
  let scrollPage = 0; // 0..1 through the whole page
  function readScroll() {
    const y = window.scrollY || 0;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollHero = clamp(y / Math.max(1, window.innerHeight), 0, 1.4);
    scrollPage = clamp(y / max, 0, 1);
    root.style.setProperty("--garden-dim", (smoothstep(0.15, 1.0, scrollHero) * 0.62).toFixed(3));
    needsRender = true;
  }

  const pointer = { x: 0, y: 0, clientX: -1, clientY: -1, active: false, overUi: false, lastMove: 0 };
  const INTERACTIVE = "a, button, input, summary, details, label, .navbar, .search-container, .home-panel";
  function onPointerMove(event) {
    if (event.pointerType === "touch") return;
    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    pointer.x = (event.clientX / width) * 2 - 1;
    pointer.y = -(event.clientY / height) * 2 + 1;
    pointer.active = true;
    pointer.lastMove = performance.now();
    pointer.overUi = !!(event.target && event.target.closest && event.target.closest(INTERACTIVE));
    needsRender = true;
  }
  function onPointerLeave() {
    pointer.active = false;
    needsRender = true;
  }

  let dayTarget = uniforms.uDay.value;
  function onThemeChange(event) {
    dayTarget = event.detail && event.detail.theme === "light" ? 1 : 0;
    if (reducedMotion) uniforms.uDay.value = dayTarget;
    needsRender = true;
  }

  // ---- Picking a note's light ---------------------------------------------
  const projected = new V3();
  const orbScreen = tree.orbs.map(() => ({ x: 0, y: 0, visible: false }));
  let hovered = -1; // from the pointer
  let linked = -1; // from hovering a note's link in the page
  let pinned = -1; // tapped on a touch screen
  const urlToOrb = new Map();
  tree.orbs.forEach((orb, i) => urlToOrb.set(orb.note.u, i));

  function projectOrbs() {
    tree.orbs.forEach((orb, i) => {
      projected.copy(orb.position).project(camera);
      const screen = orbScreen[i];
      screen.visible = projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
      screen.x = (projected.x * 0.5 + 0.5) * width;
      screen.y = (-projected.y * 0.5 + 0.5) * height;
    });
  }
  function nearestOrb(clientX, clientY, reach) {
    let best = -1;
    let bestDistance = reach * reach;
    for (let i = 0; i < orbScreen.length; i++) {
      const screen = orbScreen[i];
      if (!screen.visible) continue;
      const dx = screen.x - clientX;
      const dy = screen.y - clientY;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best;
  }
  function showLabel(index) {
    if (!label) return;
    if (index < 0 || !orbScreen[index].visible) {
      label.classList.remove("is-visible");
      return;
    }
    const orb = tree.orbs[index];
    const screen = orbScreen[index];
    if (label.dataset.index !== String(index)) {
      label.dataset.index = String(index);
      label.href = orb.note.u;
      label.querySelector(".garden-label-folder").textContent = data.folders[orb.folder].name;
      label.querySelector(".garden-label-title").textContent = orb.note.t;
    }
    const flip = screen.x > width - 280;
    label.classList.toggle("is-flipped", flip);
    label.style.transform = `translate3d(${Math.round(screen.x)}px, ${Math.round(screen.y)}px, 0)`;
    label.classList.add("is-visible");
  }
  const treeInteractive = () => scrollHero < 0.55 && uniforms.uGrow.value > 0.98;

  function onClick(event) {
    if (!treeInteractive()) return;
    if (event.target.closest && event.target.closest(INTERACTIVE)) return;
    const index = nearestOrb(event.clientX, event.clientY, 34);
    if (index < 0) {
      pinned = -1;
      return;
    }
    const coarse = event.pointerType === "touch" || (window.matchMedia && window.matchMedia("(hover: none)").matches);
    if (coarse) {
      // First tap shows the note's name (a link); tapping that opens it.
      pinned = index;
      needsRender = true;
    } else {
      window.location.href = tree.orbs[index].note.u;
    }
  }
  function onLinkHover(event) {
    const anchor = event.target.closest && event.target.closest(".homepage a[href]");
    const next = anchor ? urlToOrb.get(anchor.getAttribute("href")) : undefined;
    linked = next === undefined ? -1 : next;
    needsRender = true;
  }

  // ---- Camera -------------------------------------------------------------
  const cam = { angle: -0.22, radius: 19, y: 2.3, lookY: 4.6, shiftX: 0, shiftY: 0, px: 0, py: 0 };
  const lookAt = new V3();
  const groundPlane = new THREE.Plane(new V3(0, 1, 0), -0.6);
  const raycaster = new THREE.Raycaster();
  const pointerWorld = new V3();
  const nightFog = new THREE.Color(0.006, 0.034, 0.026);
  const dayFog = new THREE.Color(0.66, 0.84, 0.86);

  function updateCamera(dt, intro) {
    const wide = width >= 640 && width > height;
    const targetAngle = -0.22 + scrollPage * 1.7;
    const targetRadius = (wide ? 15.2 : 23) + scrollHero * 3.2 + (1 - intro) * 5.5;
    const targetY = 2.3 + scrollHero * 2.8;
    const targetLookY = (wide ? 4.9 : 4.6) + scrollHero * 3.6;
    // On wide screens the tree stands to the right of the headline; on phones, above it.
    const targetShiftX = wide ? -0.2 * (1 - smoothstep(0.1, 1.0, scrollHero)) : 0;
    const targetShiftY = wide ? 0 : 0.2 * (1 - smoothstep(0.1, 1.0, scrollHero));
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 3.2);
    cam.angle = lerp(cam.angle, targetAngle, k);
    cam.radius = lerp(cam.radius, targetRadius, k);
    cam.y = lerp(cam.y, targetY, k);
    cam.lookY = lerp(cam.lookY, targetLookY, k);
    cam.shiftX = lerp(cam.shiftX, targetShiftX, k);
    cam.shiftY = lerp(cam.shiftY, targetShiftY, k);
    const pk = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.2);
    cam.px = lerp(cam.px, pointer.active ? pointer.x : 0, pk);
    cam.py = lerp(cam.py, pointer.active ? pointer.y : 0, pk);

    const angle = cam.angle + cam.px * 0.07;
    const x = Math.sin(angle) * cam.radius;
    const z = Math.cos(angle) * cam.radius;
    camera.position.set(x, Math.max(cam.y + cam.py * 0.35, terrainHeight(x, z) + 1.1), z);
    lookAt.set(0, cam.lookY, 0);
    camera.lookAt(lookAt);
    camera.setViewOffset(width, height, cam.shiftX * width, cam.shiftY * height, width, height);
    camera.updateMatrixWorld();
    sky.position.copy(camera.position);
  }

  // ---- Frame loop ---------------------------------------------------------
  const INTRO_SECONDS = 4.6;
  let started = 0;
  let last = 0;
  let running = false;
  let frameId = 0;
  let slowFrames = 0;
  let measuredFrames = 0;
  let firstFrame = true;

  function frame(now) {
    frameId = 0;
    if (!started) {
      started = now;
      last = now;
    }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const elapsed = (now - started) / 1000;

    const introLinear = reducedMotion ? 1 : clamp(elapsed / INTRO_SECONDS, 0, 1);
    uniforms.uTime.value = reducedMotion ? 12 : elapsed;
    uniforms.uGrow.value = reducedMotion ? 1.2 : easeInOutCubic(introLinear) * 1.12 + Math.max(0, elapsed - INTRO_SECONDS) * 0.2;
    uniforms.uGrow.value = Math.min(uniforms.uGrow.value, 1.5);
    uniforms.uGlow.value = reducedMotion ? 1 : smoothstep(0.1, 1.0, introLinear);

    // Theme: night <-> day
    if (uniforms.uDay.value !== dayTarget) {
      const step = dt / 1.4;
      uniforms.uDay.value = dayTarget > uniforms.uDay.value
        ? Math.min(dayTarget, uniforms.uDay.value + step)
        : Math.max(dayTarget, uniforms.uDay.value - step);
    }
    const day = smoothstep(0, 1, uniforms.uDay.value);
    uniforms.uFogColor.value.copy(nightFog).lerp(dayFog, day);
    uniforms.uFogDensity.value = lerp(0.021, 0.0125, day);
    renderer.toneMappingExposure = lerp(1.15, 1.0, day);
    if (bloomPass) {
      bloomPass.strength = lerp(0.6, 0.1, day);
      bloomPass.threshold = lerp(0.6, 0.9, day);
    }

    updateCamera(dt, easeOutCubic(introLinear));

    // Grass leans away from the pointer.
    const pointerOnScene = pointer.active && !pointer.overUi && scrollHero < 0.9;
    uniforms.uPointerStrength.value = lerp(uniforms.uPointerStrength.value, pointerOnScene ? 1 : 0, 1 - Math.exp(-dt * 5));
    if (pointerOnScene) {
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(groundPlane, pointerWorld) && pointerWorld.length() < 60) {
        uniforms.uPointer.value.lerp(pointerWorld, 1 - Math.exp(-dt * 10));
      }
    }

    // Which note's light is under the pointer (or tapped, or linked from the page)?
    projectOrbs();
    if (treeInteractive() && pointer.active && !pointer.overUi) {
      hovered = nearestOrb(pointer.clientX, pointer.clientY, 30);
    } else {
      hovered = -1;
    }
    if (!treeInteractive()) pinned = -1;
    const labelled = hovered >= 0 ? hovered : pinned;
    showLabel(labelled);
    root.classList.toggle("garden-pointing", hovered >= 0);
    let hoverChanged = false;
    for (let i = 0; i < orbs.hover.length; i++) {
      const target = i === labelled || i === linked ? 1 : 0;
      const value = orbs.hover[i];
      if (value !== target) {
        const next = Math.abs(target - value) < 0.01 ? target : lerp(value, target, reducedMotion ? 1 : 1 - Math.exp(-dt * 12));
        orbs.hover[i] = next;
        hoverChanged = true;
      }
    }
    if (hoverChanged) orbs.hoverAttribute.needsUpdate = true;

    if (composer) composer.render(dt);
    else renderer.render(scene, camera);

    if (firstFrame) {
      firstFrame = false;
      root.classList.add("garden-on");
    }

    // If frames are slow once the intro has played, trade resolution (then bloom) for speed.
    if (!reducedMotion && elapsed > INTRO_SECONDS + 1) {
      measuredFrames++;
      if (dt > 0.036) slowFrames++;
      if (measuredFrames >= 90) {
        if (slowFrames > 55) {
          if (pixelRatio > 0.8) {
            pixelRatio = Math.max(0.75, pixelRatio - 0.25);
            resize(true);
          } else if (composer) {
            composer = null;
            bloomPass = null;
          }
        }
        measuredFrames = 0;
        slowFrames = 0;
      }
    }

    const settling = hoverChanged || uniforms.uDay.value !== dayTarget;
    if (running && (!reducedMotion || settling || needsRenderAgain())) schedule();
  }
  function needsRenderAgain() {
    if (!needsRender) return false;
    needsRender = false;
    return true;
  }
  function schedule() {
    if (!frameId) frameId = requestAnimationFrame(frame);
  }
  function requestRender() {
    needsRender = true;
    if (running) schedule();
  }
  function setRunning(next) {
    running = next;
    if (running) {
      last = performance.now();
      schedule();
    } else if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }

  // ---- Wiring -------------------------------------------------------------
  const listen = (target, type, handler, options) => target.addEventListener(type, handler, options);
  listen(window, "resize", () => { resize(false); requestRender(); });
  listen(window, "scroll", () => { readScroll(); requestRender(); }, { passive: true });
  listen(window, "pointermove", (event) => { onPointerMove(event); requestRender(); }, { passive: true });
  listen(document.documentElement, "pointerleave", () => { onPointerLeave(); requestRender(); });
  listen(window, "click", (event) => { onClick(event); requestRender(); });
  listen(document, "pointerover", (event) => { onLinkHover(event); requestRender(); }, { passive: true });
  listen(document, "focusin", (event) => { onLinkHover(event); requestRender(); });
  listen(document, "garden:themechange", (event) => { onThemeChange(event); requestRender(); });
  listen(document, "visibilitychange", () => setRunning(!document.hidden));
  listen(canvas, "webglcontextlost", (event) => {
    event.preventDefault();
    setRunning(false);
    root.classList.remove("garden-on");
  });
  listen(canvas, "webglcontextrestored", () => setRunning(!document.hidden));

  resize(true);
  readScroll();
  setRunning(!document.hidden);

  return { tier: tierName, notes: tree.orbs.length };
}
