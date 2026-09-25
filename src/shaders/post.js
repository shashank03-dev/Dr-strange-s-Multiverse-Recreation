// Post pipeline: universe-to-universe transitions, motion trails, bloom,
// anamorphic streaks, lens model and the final film grade.

const H = `#version 300 es
precision highp float;
out vec4 fragColor;
`;

const HASH = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float noise(vec2 x){ vec2 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),f.x),f.y); }
`;

// ------------------------------------------------------------------ composite
export const COMPOSITE = H + HASH + `
uniform sampler2D uA, uB, uPrev;
uniform vec2 uScaleA, uScaleB;  // fraction of the scene target that holds pixels
uniform vec2 uRes;
uniform float uP;               // transition progress 0..1
uniform int   uType;            // 0 none, 1 flash, 2 shatter, 3 portal, 4 zoom, 5 prism
uniform vec3  uFlash;           // flash tint
uniform float uTrail, uTrailZoom, uTrailRot;
uniform float uTime;

#define PI 3.14159265

vec3 A(vec2 uv){ return texture(uA, clamp(uv,0.,1.)*uScaleA).rgb; }
vec3 B(vec2 uv){ return texture(uB, clamp(uv,0.,1.)*uScaleB).rgb; }

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

vec3 spectrum(float x){ return clamp(vec3(abs(x*6.-3.)-1., 2.-abs(x*6.-2.), 2.-abs(x*6.-4.)), 0., 1.); }

void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  float asp = uRes.x/uRes.y;
  vec2 c = (uv-.5)*vec2(asp,1.);
  vec3 col;
  float p = uP;

  if(uType == 0){
    col = A(uv);
  } else if(uType == 1){ // flash cut
    float k = smoothstep(.42,.58,p);
    col = mix(A(uv), B(uv), k);
    float fl2 = exp(-pow((p-.5)*7.,2.));
    col = col*(1.+fl2*1.5) + uFlash*fl2*2.2*(1.-.4*length(c));
  } else if(uType == 2){ // reality shatters like glass
    vec4 v = voronoi(c*3.2 + 3.7);
    vec2 cellC = (v.zw + hash22(v.zw) - 3.7)/3.2;
    float h = hash12(v.zw);
    float rad = length(cellC);
    float start = .08 + .32*rad + .22*h;          // the centre gives way first
    float lp = clamp((p - start)/.42, 0., 1.);
    float kick = lp*lp;
    vec2 dir = normalize(cellC + 1e-3);
    float ang = (h-.5)*3.*kick;
    vec2 q = c - cellC - dir*kick*(.35 + .5*h);
    q = mat2(cos(ang),sin(ang),-sin(ang),cos(ang))*q;
    q *= 1. - kick*.5;
    vec2 uvA = (q + cellC)/vec2(asp,1.)+.5;
    // shards shrink away from their borders, opening gaps onto the next reality
    float gap = kick*.45;
    float inShard = smoothstep(gap, gap + .015, v.y)*(1.-step(.999, lp));
    vec3 a = A(uvA)*(1. - .25*kick);
    vec3 b = B(uv + dir*.03*(1.-p));
    col = mix(b, a, inShard);
    // hairline cracks race across the frame before it breaks
    float crackOn = smoothstep(start - .14, start - .02, p)*(1.-lp);
    col += uFlash*smoothstep(.01, .0, v.y)*crackOn*1.6;
    // glinting edges on the flying shards
    col += uFlash*smoothstep(.012, .0, abs(v.y - gap))*kick*(1.-kick)*3.*step(.001, lp);
    // a bevel of light along each shard's leading edge
    col += a*smoothstep(gap + .06, gap, v.y)*inShard*.6*step(.001, lp);
    col += uFlash*exp(-pow((p-.12)*10.,2.))*.5;
  } else if(uType == 3){ // star portal iris
    float r = pow(p, 2.2)*3.2;
    float wob = noise(vec2(atan(c.y,c.x)*3., uTime*4.))-.5;
    float d = sdStar5(c/max(r,1e-3), 1., .5)*r + wob*.04;
    float inside = smoothstep(.01,-.01,d);
    vec2 zoom = (uv-.5)*(1.-p*.35)+.5;
    col = mix(A(zoom), B((uv-.5)*(.6+.4*p)+.5), inside);
    float band = exp(-abs(d)*28.);
    col += vec3(.5,.78,1.)*band*6.*(1.-smoothstep(.8,1.,p));
    col += vec3(.7,.85,1.)*exp(-pow((p-.85)*6.,2.))*2.;
  } else if(uType == 4){ // hyperspace zoom
    float k = smoothstep(.3,.7,p);
    vec3 a = vec3(0), b = vec3(0);
    for(int i=0;i<10;i++){
      float f = float(i)/9.;
      a += A((uv-.5)/(1.+p*p*2.5*(1.+f*.25))+.5);
      b += B((uv-.5)*(1.+(1.-p)*(1.-p)*2.*(1.+f*.25))+.5);
    }
    col = mix(a, b, k)/10.;
    col += uFlash*exp(-pow((p-.5)*6.,2.))*1.2;
  } else { // prism flash: spectral split
    float k = smoothstep(.45,.55,p);
    float fl = exp(-pow((p-.5)*4.,2.));
    vec3 s = vec3(0);
    for(int i=0;i<7;i++){
      float f = float(i)/6.;
      vec2 o = (uv-.5)*(1. + (f-.5)*.12*fl)+.5;
      s += mix(A(o), B(o), k)*spectrum(f);
    }
    col = s/2.2;
    vec4 v = voronoi(c*9. + uTime);
    col += spectrum(fract(v.z*.13+v.w*.07+uTime))*exp(-v.x*4.)*fl*6.;
    col += vec3(1.)*fl*1.8;
  }

  // Motion trail (feedback) -- a zoomed & slightly rotated copy of the
  // previous frame gives the smeared "falling through realities" feel.
  vec2 pc = (uv-.5);
  float cr = cos(uTrailRot), sr = sin(uTrailRot);
  pc = mat2(cr,sr,-sr,cr)*pc;
  vec3 prev = texture(uPrev, pc*(1.-uTrailZoom)+.5).rgb;
  float trail = uType == 2 ? 0. : uTrail;
  col = mix(col, max(col, prev*.98), trail);
  fragColor = vec4(col, 1.);
}`;

// ------------------------------------------------------------------ bloom
export const PREFILTER = H + `
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThreshold;
void main(){
  vec2 uv = gl_FragCoord.xy*uTexel*2.;
  vec2 o = uTexel*.5;
  vec3 c = texture(uSrc, uv+vec2(-o.x,-o.y)).rgb + texture(uSrc, uv+vec2(o.x,-o.y)).rgb
         + texture(uSrc, uv+vec2(-o.x, o.y)).rgb + texture(uSrc, uv+vec2(o.x, o.y)).rgb;
  c *= .25;
  float br = max(c.r, max(c.g, c.b));
  float knee = uThreshold*.6;
  float soft = clamp(br - uThreshold + knee, 0., 2.*knee);
  soft = soft*soft/(4.*knee + 1e-4);
  float w = max(soft, br-uThreshold)/max(br, 1e-4);
  fragColor = vec4(min(c*w, vec3(40.)), 1.);
}`;

export const DOWN = H + `
uniform sampler2D uSrc; uniform vec2 uTexel; // texel of source
void main(){
  vec2 uv = gl_FragCoord.xy*uTexel*2.;
  vec2 o = uTexel;
  vec3 c = texture(uSrc, uv).rgb*4.;
  c += texture(uSrc, uv+vec2(-o.x,-o.y)).rgb + texture(uSrc, uv+vec2(o.x,-o.y)).rgb;
  c += texture(uSrc, uv+vec2(-o.x, o.y)).rgb + texture(uSrc, uv+vec2(o.x, o.y)).rgb;
  fragColor = vec4(c/8., 1.);
}`;

export const UP = H + `
uniform sampler2D uSrc, uBase; uniform vec2 uTexel, uDstTexel; uniform float uW;
void main(){
  vec2 uv = gl_FragCoord.xy*uDstTexel;
  vec2 o = uTexel;
  vec3 c = texture(uSrc, uv+vec2(-o.x,0)).rgb*2. + texture(uSrc, uv+vec2(o.x,0)).rgb*2.
         + texture(uSrc, uv+vec2(0,-o.y)).rgb*2. + texture(uSrc, uv+vec2(0,o.y)).rgb*2.
         + texture(uSrc, uv+vec2(-o.x,-o.y)).rgb + texture(uSrc, uv+vec2(o.x,-o.y)).rgb
         + texture(uSrc, uv+vec2(-o.x,o.y)).rgb + texture(uSrc, uv+vec2(o.x,o.y)).rgb
         + texture(uSrc, uv).rgb*4.;
  fragColor = vec4(texture(uBase, uv).rgb + c/16.*uW, 1.);
}`;

// Horizontal-only blur for anamorphic lens streaks.
export const STREAK = H + `
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uSpread;
void main(){
  vec2 uv = gl_FragCoord.xy*uTexel;
  vec3 c = vec3(0); float wsum = 0.;
  for(int i=-12;i<=12;i++){
    float f = float(i);
    float w = exp(-abs(f)*.22);
    c += texture(uSrc, uv + vec2(f*uSpread*uTexel.x, 0.)).rgb*w; wsum += w;
  }
  fragColor = vec4(c/wsum, 1.);
}`;

// ------------------------------------------------------------------ final grade
export const FINAL = H + HASH + `
uniform sampler2D uComp, uBloom, uStreak;
uniform vec2 uRes, uOffset;
uniform float uTime, uExposure, uSat, uContrast, uCA, uZoomBlur, uGrain, uVignette;
uniform float uFlicker, uSepia, uFade, uBloomAmt, uStreakAmt, uToon;
uniform vec3 uTint, uLift, uStreakTint;

vec3 aces(vec3 x){
  const mat3 i = mat3(0.59719,0.07600,0.02840, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777);
  const mat3 o = mat3(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602);
  x = i*x;
  vec3 a = x*(x+0.0245786)-0.000090537;
  vec3 b = x*(0.983729*x+0.4329510)+0.238081;
  return clamp(o*(a/b), 0., 1.);
}

vec3 sampleComp(vec2 uv){
  // radial speed blur + lateral chromatic aberration in one gather
  vec2 d = uv-.5;
  vec3 acc = vec3(0); float wsum = 0.;
  // only as many taps as the blur needs: 2 when still, up to 12 at full speed
  int n = int(clamp(2. + uZoomBlur*120., 2., 12.));
  for(int i=0;i<12;i++){
    if(i >= n) break;
    float f = float(i)/float(n-1);
    float s = 1. - uZoomBlur*f;
    float w = 1.-f*.6;
    float ca = uCA*(1.+f);
    acc.r += texture(uComp, d*s*(1.+ca)+.5).r*w;
    acc.g += texture(uComp, d*s+.5).g*w;
    acc.b += texture(uComp, d*s*(1.-ca)+.5).b*w;
    wsum += w;
  }
  return acc/wsum;
}

void main(){
  vec2 uv = (gl_FragCoord.xy-uOffset)/uRes;
  vec3 c = sampleComp(uv);
  vec3 bl = texture(uBloom, uv).rgb;
  c += bl*uBloomAmt;
  c += texture(uStreak, uv).rgb*uStreakTint*uStreakAmt;

  // lens dirt catches the bloom
  float dirt = smoothstep(.55,1.,noise(uv*vec2(9.,5.)+3.)) *.6 + smoothstep(.7,1.,noise(uv*31.))*.4;
  c += bl*dirt*uBloomAmt*.6;

  c *= uExposure*uTint;
  c *= 1. + uFlicker*(hash12(vec2(floor(uTime*24.),3.))-.5)*.35;
  c = aces(c);

  // grade
  float l = dot(c, vec3(.2126,.7152,.0722));
  c = mix(vec3(l), c, uSat);
  c = (c-.5)*uContrast+.5;
  c = c + uLift*(1.-c);
  c = mix(c, vec3(l*1.08, l*.92, l*.72)*vec3(1.05,.98,.85), uSepia);

  // vignette
  vec2 v = uv-.5;
  c *= 1. - uVignette*dot(v*vec2(1.2,1.),v*vec2(1.2,1.))*1.8;

  // film grain (luma-weighted, per-frame)
  float g = hash12(gl_FragCoord.xy + fract(uTime*37.13)*917.)-.5;
  c += g*uGrain*(.4+.6*(1.-l));
  // sepia reels get scratches and gate weave
  if(uSepia > .01){
    float sx = fract(uv.x*1.7 + floor(uTime*18.)*.37);
    c *= 1. - uSepia*.35*smoothstep(.002,.0,abs(sx-.5)) * step(.6, hash12(vec2(floor(uTime*18.),9.)));
  }
  c = max(c, 0.);
  c = pow(c, vec3(1./1.0)); // ACES output is already display-referred
  c *= uFade;
  // 8-bit dithering
  c += (hash12(gl_FragCoord.xy*1.37+uTime)-.5)/255.;
  fragColor = vec4(c, 1.);
}`;
