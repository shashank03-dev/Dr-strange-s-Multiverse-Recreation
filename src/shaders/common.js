// Shared GLSL for every universe: uniforms, hashing, noise, SDF primitives,
// camera, analytic volumetric lighting, the star portal and lightning.

export const HEAD = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;

uniform vec2  uRes;     // render target size (pixels)
uniform float uT;       // shot-local time (seconds, may be <0 or >duration in transitions)
uniform float uDur;     // shot duration
uniform float uG;       // global film time
uniform vec3  uShake;   // camera shake: yaw, pitch, roll (radians)
uniform sampler2D uTex; // auxiliary texture (title card)
uniform vec4  uMenu;    // title screen: x formation, y warp, z hover (-1 no .. 1 yes), w seconds since a "no"
out vec4 fragColor;

#define PI  3.14159265359
#define TAU 6.28318530718
#define sat(x) clamp(x, 0.0, 1.0)

// ---------------------------------------------------------------- hashing
float hash11(float p){ p = fract(p*.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash13(vec3 p3){ p3 = fract(p3*.1031); p3 += dot(p3, p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
vec2  hash21(float p){ vec3 p3 = fract(vec3(p)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec2  hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec3  hash31(float p){ vec3 p3 = fract(vec3(p)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xxy+p3.yzz)*p3.zyx); }
vec3  hash33(vec3 p3){ p3 = fract(p3*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yxz+33.33); return fract((p3.xxy+p3.yxx)*p3.zyx); }

// ---------------------------------------------------------------- noise
float noise(vec2 x){
  vec2 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y);
}
float noise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash13(i+vec3(0,0,0)), hash13(i+vec3(1,0,0)), f.x),
                 mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x),
                 mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z);
}
const mat2 M2 = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*noise(p); p=M2*p+vec2(3.1,1.7); a*=.5; } return s; }
float fbm3(vec2 p){ float s=0., a=.5; for(int i=0;i<3;i++){ s+=a*noise(p); p=M2*p+vec2(3.1,1.7); a*=.5; } return s/.875; }
float fbm(vec3 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.02+vec3(1.7,9.2,3.3); a*=.5; } return s; }
float fbm3(vec3 p){ float s=0., a=.5; for(int i=0;i<3;i++){ s+=a*noise(p); p=p*2.03+vec3(1.7,9.2,3.3); a*=.5; } return s/.875; }

// Voronoi: x = distance to nearest feature, y = distance to the cell border, zw = cell id
vec4 voronoi(vec2 x){
  vec2 n = floor(x), f = fract(x), mg, mr; float md = 8.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 g = vec2(i,j), o = hash22(n+g), r = g+o-f; float d = dot(r,r);
    if(d<md){ md=d; mr=r; mg=g; }
  }
  float be = 8.;
  for(int j=-2;j<=2;j++) for(int i=-2;i<=2;i++){
    vec2 g = mg+vec2(i,j), o = hash22(n+g), r = g+o-f;
    if(dot(mr-r,mr-r)>1e-5) be = min(be, dot(.5*(mr+r), normalize(r-mr)));
  }
  return vec4(sqrt(md), be, n+mg);
}

// ---------------------------------------------------------------- SDF
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,s,-s,c); }
float smin(float a, float b, float k){ float h = max(k-abs(a-b),0.)/k; return min(a,b) - h*h*k*.25; }
float smax(float a, float b, float k){ return -smin(-a,-b,k); }
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p)-b; return length(max(q,0.)) + min(max(q.x,max(q.y,q.z)),0.); }
float sdBox2(vec2 p, vec2 b){ vec2 q = abs(p)-b; return length(max(q,0.)) + min(max(q.x,q.y),0.); }
float sdRBox(vec3 p, vec3 b, float r){ return sdBox(p, b-r) - r; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){ vec3 pa=p-a, ba=b-a; float h=sat(dot(pa,ba)/dot(ba,ba)); return length(pa-ba*h)-r; }
float sdCylY(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.xz),p.y)) - vec2(r,h); return min(max(d.x,d.y),0.) + length(max(d,0.)); }
float sdCylZ(vec3 p, float r, float h){ return sdCylY(p.xzy, r, h); }
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz)-t.x, p.y); return length(q)-t.y; }
float sdEllipsoid(vec3 p, vec3 r){ float k0 = length(p/r), k1 = length(p/(r*r)); return k0*(k0-1.)/k1; }
float sdOcta(vec3 p, float s){ p = abs(p); return (p.x+p.y+p.z-s)*0.57735027; }
float sdSeg2(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=sat(dot(pa,ba)/dot(ba,ba)); return length(pa-ba*h); }

float sdStar5(vec2 p, float r, float rf){
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0*max(dot(k1,p),0.0)*k1;
  p -= 2.0*max(dot(k2,p),0.0)*k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf*vec2(-k1.y,k1.x) - vec2(0,1);
  float h = clamp(dot(p,ba)/dot(ba,ba), 0.0, r);
  return length(p-ba*h) * sign(p.y*ba.x-p.x*ba.y);
}

// ---------------------------------------------------------------- camera
// uShake is added on top of every authored camera so the whole film shares
// one handheld/impact language driven from the timeline.
vec3 camRay(vec2 uv, vec3 ro, vec3 ta, float roll, float fl){
  vec3 f = normalize(ta-ro);
  vec3 r = normalize(cross(f, vec3(0,1,0)));
  vec3 u = cross(r, f);
  float rl = roll + uShake.z;
  vec3 r2 = r*cos(rl) + u*sin(rl);
  vec3 u2 = cross(r2, f);
  vec3 d = normalize(uv.x*r2 + uv.y*u2 + fl*f);
  d.xz *= rot(uShake.x); d.yz *= rot(uShake.y);
  return normalize(d);
}

// ---------------------------------------------------------------- light
// Closed-form single scattering of an isotropic point light through uniform
// fog along a ray segment [0,tmax]: the "god glow" around every light source.
float fogLight(vec3 ro, vec3 rd, vec3 lp, float tmax){
  vec3 q = lp-ro;
  float b = dot(q, rd);
  float h2 = max(dot(q,q) - b*b, 1e-4);
  float h = sqrt(h2);
  return (atan((tmax-b)/h) - atan(-b/h))/h;
}

vec3 blackbody(float t){ // t in 0..1 -> ember .. white-hot
  t = sat(t);
  return vec3(1.0, .35+.65*t, .08+.9*t*t) * (t*t*6.0);
}

float fresnel(vec3 n, vec3 rd, float f0){ return f0 + (1.-f0)*pow(1.-sat(dot(n,-rd)),5.); }


// ---------------------------------------------------------------- image-based lighting
// HDRIs arrive log-encoded in 8 bits; decode back to linear radiance.
uniform sampler2D uEnv;
uniform float uEnvMax, uEnvK;
uniform vec3  uEnvSun;
uniform float uEnvRot;    // yaw applied to the environment (radians)
uniform float uEnvGain;   // exposure of the environment for this shot
vec3 envDecode(vec3 e){ float L = log2(1. + uEnvMax*uEnvK); return (exp2(e*L) - 1.)/uEnvK; }
vec3 envDir(vec3 d){ d.xz = rot(-uEnvRot)*d.xz; return d; }
vec2 envUV(vec3 d){ d = envDir(d); return vec2(atan(d.z, d.x)/TAU + .5, acos(clamp(d.y, -1., 1.))/PI); }
vec3 envLod(vec3 d, float lod){ return envDecode(textureLod(uEnv, envUV(d), lod).rgb)*uEnvGain; }
vec3 envSky(vec3 d){ return envLod(d, 0.); }
vec3 envSunDir(){ vec3 s = uEnvSun; s.xz = rot(uEnvRot)*s.xz; return normalize(s); }

// ---------------------------------------------------------------- PBR materials
// Each material is two textures: C = albedo (sRGB) + roughness, N = normal.xy + AO + height.
struct Mat { vec3 alb; float rough; vec3 n; float ao; float h; };

vec3 triW(vec3 n, float k){ vec3 w = pow(abs(n), vec3(k)); return w/(w.x + w.y + w.z); }

Mat triMat(sampler2D C, sampler2D N, vec3 p, vec3 n, float scale, float nstr){
  vec3 w = triW(n, 6.);
  vec2 ux = p.zy*scale, uy = p.xz*scale, uz = p.xy*scale;
  vec4 cx = texture(C, ux), cy = texture(C, uy), cz = texture(C, uz);
  vec4 nx = texture(N, ux), ny = texture(N, uy), nz = texture(N, uz);
  vec4 c = cx*w.x + cy*w.y + cz*w.z;
  vec4 m = nx*w.x + ny*w.y + nz*w.z;
  // whiteout-blended triplanar normal mapping
  vec2 tx = (nx.xy*2. - 1.)*nstr, ty = (ny.xy*2. - 1.)*nstr, tz = (nz.xy*2. - 1.)*nstr;
  vec3 an = abs(n);
  vec3 bx = vec3(tx + n.zy, an.x*sqrt(sat(1. - dot(tx,tx))));
  vec3 by = vec3(ty + n.xz, an.y*sqrt(sat(1. - dot(ty,ty))));
  vec3 bz = vec3(tz + n.xy, an.z*sqrt(sat(1. - dot(tz,tz))));
  bx.z *= sign(n.x); by.z *= sign(n.y); bz.z *= sign(n.z);
  vec3 nn = normalize(bx.zyx*w.x + by.xzy*w.y + bz.xyz*w.z);
  Mat r; r.alb = c.rgb; r.rough = c.a; r.n = nn; r.ao = m.b; r.h = m.a;
  return r;
}
// Planar variant for large flat surfaces (floors, roads): one fetch per map.
Mat planarMat(sampler2D C, sampler2D N, vec2 uv, vec3 n, float nstr){
  vec4 c = texture(C, uv), m = texture(N, uv);
  vec2 t = (m.xy*2. - 1.)*nstr;
  // tangent frame for a surface whose normal is roughly +y
  vec3 T = normalize(cross(n, vec3(0,0,1))), B = cross(T, n);
  Mat r; r.alb = c.rgb; r.rough = c.a; r.n = normalize(n + T*t.x - B*t.y); r.ao = m.b; r.h = m.a;
  return r;
}

float D_GGX(float nh, float a){ float a2 = a*a; float d = nh*nh*(a2 - 1.) + 1.; return a2/(PI*d*d + 1e-6); }
float V_SmithJ(float nl, float nv, float a){ float k = a*.5; return .25/((nl*(1. - k) + k)*(nv*(1. - k) + k) + 1e-5); }
vec3 F_Schlick(float c, vec3 f0){ return f0 + (1. - f0)*pow(1. - c, 5.); }
vec2 envBRDF(float nv, float r){
  const vec4 c0 = vec4(-1., -.0275, -.572, .022), c1 = vec4(1., .0425, 1.04, -.04);
  vec4 rr = r*c0 + c1; float a004 = min(rr.x*rr.x, exp2(-9.28*nv))*rr.x + rr.y;
  return vec2(-1.04, 1.04)*a004 + rr.zw;
}
// Direct light (GGX specular + Lambert diffuse).
vec3 litPBR(vec3 alb, float rough, float metal, vec3 n, vec3 v, vec3 l, vec3 lc){
  vec3 h = normalize(v + l);
  float nl = sat(dot(n, l)), nv = max(dot(n, v), 1e-3), nh = sat(dot(n, h)), vh = sat(dot(v, h));
  float a = max(rough*rough, .002);
  vec3 f0 = mix(vec3(.04), alb, metal);
  vec3 F = F_Schlick(vh, f0);
  vec3 spec = D_GGX(nh, a)*V_SmithJ(nl, nv, a)*F;
  vec3 diff = (1. - F)*(1. - metal)*alb/PI;
  return (diff + spec)*lc*nl*PI;
}
// Ambient from the HDRI: blurred irradiance + roughness-filtered reflection.
vec3 ambPBR(vec3 alb, float rough, float metal, vec3 n, vec3 v, float ao){
  float nv = max(dot(n, v), 1e-3);
  vec3 f0 = mix(vec3(.04), alb, metal);
  vec2 ab = envBRDF(nv, rough);
  vec3 spec = envLod(reflect(-v, n), rough*7.5)*(f0*ab.x + ab.y);
  vec3 diff = envLod(n, 8.5)*alb*(1. - metal);
  return (diff + spec)*ao;
}

// ---------------------------------------------------------------- model volumes
// Meshes baked to signed-distance volumes. p is in model space where the longest
// half-extent is 1; e is the model's half-extents in that space.
float sdVol(sampler3D S, float range, vec3 e, vec3 p){
  float box = sdBox(p, e + .03);
  if(box > .08) return box;
  float d = (texture(S, p*.5 + .5).r*255. - 128.)/127.*range;
  return max(d, box);
}
vec3 volAlbedo(sampler3D C, vec3 p){ vec3 c = texture(C, p*.5 + .5).rgb; return c*c; }

// ---------------------------------------------------------------- lightning
// Jagged, flickering bolt from a to b in 2D. Returns intensity (core + halo).
float bolt(vec2 p, vec2 a, vec2 b, float seed, float t, float w){
  vec2 ab = b-a; float L = length(ab); vec2 dir = ab/L, n = vec2(-dir.y, dir.x);
  vec2 q = p-a; float x = dot(q,dir)/L, y = dot(q,n);
  if(x < -.02 || x > 1.02) return 0.;
  float env = sqrt(sat(sin(sat(x)*PI)));
  float tf = floor(t*24.);
  float off = 0., amp = .22*L, f = 2.5;
  for(int i=0;i<5;i++){
    off += amp*(noise(vec2(x*f + seed*17.3, tf*.37 + seed*3.1)) - .5);
    amp *= .5; f *= 2.3;
  }
  off *= env;
  float d = abs(y-off);
  float core = w*w/(d*d + w*w*.2);
  return core*env;
}

// ---------------------------------------------------------------- star portal
// q: coordinates in the portal plane (world units), R: outer radius,
// t: time since opening. Returns rgb emission; a = how much of the view is
// "inside" the portal (to reveal the next universe).
vec4 starPortal(vec2 q, float R, float t){
  if(R < 1e-3) return vec4(0);
  float ang = atan(q.y, q.x), rad = length(q);
  vec2 w = q/R;
  float warp = fbm3(w*2.3 + vec2(t*.9, -t*.7)) - .5;
  float d = sdStar5(w, 1., .5) + warp*.22;
  float inside = smoothstep(.03, -.06, d);
  // crystalline shell: dense voronoi shards clustered around the edge
  vec4 v = voronoi(w*16. + vec2(t*1.3, t*.4));
  float cellLit = step(.55, hash12(v.zw + floor(t*10.)));
  float shard = smoothstep(.12, .0, v.y) * .4 + cellLit*smoothstep(.35, .0, v.x);
  float band = exp(-abs(d)*7.);
  float shell = band*(.12 + 2.6*shard);
  float sw = fbm3(vec2(ang*2. + t*2., rad/R*4. - t*3.));
  vec3 col = vec3(.25,.55,1.)*shell*2.6;
  col += vec3(.8,.92,1.)*pow(band, 5.)*shard*5.;
  col += vec3(.6,.8,1.)*exp(-abs(d)*40.)*1.5;
  col += inside*vec3(.3,.55,1.)*(.1 + .45*sw*sw)*smoothstep(-.6,.0,d);
  // tip bolts that lash outward
  for(int i=0;i<5;i++){
    float a = float(i)*TAU/5. + PI*.5;
    vec2 tip = vec2(cos(a), sin(a));
    float fl = step(.35, hash11(floor(t*9.) + float(i)*7.));
    vec2 end = tip*(1.6 + .9*hash11(floor(t*6.)+float(i))) + (hash21(floor(t*6.)+float(i)*3.)-.5)*1.2;
    col += vec3(.55,.8,1.)*bolt(w, tip*.95, end, float(i)+floor(t*3.), t, .012)*fl*1.4;
  }
  return vec4(col, inside);
}
`;

export const FOOT = /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec3 c = render(uv, gl_FragCoord.xy);
  // Guard against NaNs / infinities so the bloom chain never blows up.
  c = clamp(c, 0., 64.);
  if(any(isnan(c))) c = vec3(0);
  fragColor = vec4(c, 1.);
}
`;
