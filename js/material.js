// MeshPhysicalMaterial patched with: object-space Voronoi crackle network, iron/carbon speckle, and kiln glow.
import * as THREE from 'three';

export function makeSimplePotMaterial(tex, lite) {
  return new THREE.MeshStandardMaterial({
    map: tex.color,
    roughness: 0.58,
    roughnessMap: lite ? null : tex.props,
    metalness: lite ? 0.06 : 0.15,
    metalnessMap: lite ? null : tex.props,
    bumpMap: lite ? null : tex.height,
    bumpScale: lite ? 0 : 1.2,
    envMapIntensity: lite ? 0.2 : 0.45,
  });
}

export function makePotMaterial(tex) {
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex.color, roughness: 1, roughnessMap: tex.props, metalness: 1, metalnessMap: tex.props,   // props.b = metallic glaze amount
    clearcoat: 1, clearcoatMap: tex.props, clearcoatRoughness: 0.12, clearcoatRoughnessMap: tex.props,
    bumpMap: tex.height, bumpScale: 2.6, envMapIntensity: 1.0,
  });
  const uniforms = { uFx: { value: tex.fx }, uGlow: { value: 0 }, uGlowColor: { value: new THREE.Color(1, 0.35, 0.08) } };
  mat.userData.uniforms = uniforms;
  // Stable key so a shape switch never looks like a new program / HLSL compile.
  mat.customProgramCacheKey = () => 'glaze-pot-physical-v1';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObjPos;
uniform sampler2D uFx; uniform float uGlow; uniform vec3 uGlowColor;
vec3 gHash3(vec3 p){ p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6))); return fract(sin(p)*43758.5453123); }
float gHash1(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
// distance to nearest Voronoi cell border (IQ-style two pass)
float vorEdge(vec3 x){
  vec3 n = floor(x), f = fract(x), mg = vec3(0.0), mr = vec3(0.0); float md = 8.0;
  for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec3 g = vec3(float(i),float(j),float(k)); vec3 r = g + gHash3(n+g) - f; float d = dot(r,r);
    if(d<md){ md=d; mr=r; mg=g; } }
  md = 8.0;
  for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec3 g = mg + vec3(float(i),float(j),float(k)); vec3 r = g + gHash3(n+g) - f;
    vec3 dd = r - mr; if(dot(dd,dd)>1e-5) md = min(md, dot(0.5*(mr+r), normalize(dd))); }
  return md;
}
float speckleAt(vec3 p, float freq, float dens){
  vec3 q = p*freq; vec3 n = floor(q); vec3 f = fract(q); float h = gHash1(n);
  vec3 c = gHash3(n)*0.6+0.2; float rad = 0.1 + 0.22*fract(h*17.0);
  return step(1.0-dens, h) * (1.0 - smoothstep(rad*0.55, rad, length(f-c)));
}
float crackLines(vec3 p, float scale, float width){
  vec3 q = p*scale;
  q += 0.12*vec3(sin(q.y*1.7+q.z*1.3), sin(q.z*1.9+q.x*1.1), sin(q.x*1.5+q.y*2.1));
  float e = vorEdge(q);
  float aa = max(fwidth(e), 1e-4)*1.2;
  return 1.0 - smoothstep(width, width+aa, e);
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec4 fx = texture2D(uFx, vMapUv);
  // iron speckle in clay / carbon speckle in shino
  float sp = max(speckleAt(vObjPos, 55.0, 0.10), 0.8*speckleAt(vObjPos+11.3, 130.0, 0.12));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(0.30,0.24,0.20), sp*fx.b);
  if (fx.r > 0.004) {
    float fine = fx.g;
    float s1 = mix(6.0, 17.0, fine);
    float l1 = crackLines(vObjPos, s1, mix(0.042, 0.045, fine));
    float l2 = crackLines(vObjPos + 7.1, s1*2.2, 0.028) * 0.5;
    float line = max(l1, l2);
    vec3 crackCol = mix(vec3(0.09,0.065,0.05), vec3(0.62,0.47,0.24), fx.a);
    float amt = clamp(fx.r*line, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*crackCol*1.4, amt*mix(0.9, 0.55, fx.a));
  }
}`)
      .replace('#include <clearcoat_normal_fragment_begin>', `#include <clearcoat_normal_fragment_begin>
  // Glass follows the glaze film. The coat, a drip, and an overlap are in the bump;
  // the clearcoat was still using the bare clay normal, so fired runs disappeared.
  clearcoatNormal = normal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float ndv = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
  float y = dot(diffuseColor.rgb, vec3(0.30, 0.59, 0.11));
  // Orange heat, plus the coat's own colour so a blue glaze stays cooler and
  // darker than the clay instead of washing out to the same white-hot.
  vec3 hot = uGlowColor * (0.18 + 0.55 * sqrt(clamp(y, 0.0, 1.0)));
  hot += diffuseColor.rgb * (0.22 / max(y, 0.05));
  diffuseColor.rgb = mix(diffuseColor.rgb, hot, uGlow * 0.45);
  totalEmissiveRadiance += hot * uGlow * (0.75 + 0.25 * pow(ndv, 1.15));
}`);
  };
  return mat;
}
