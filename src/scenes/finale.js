// 18. Earth-616 -- spat out onto a rooftop garden at golden hour.
// 19. The title -- a golden relic, red ink, and the name of the film.
import { GOLD } from '../shaders/gold.js';

const rooftopGLSL = /* glsl */ `
uniform sampler2D uGrassC, uGrassN, uBrickC, uBrickN, uLeafC, uLeafN, uFacadeC, uFacadeN;
uniform sampler3D uTreeS, uTreeCol, uGnomeS, uGnomeCol;
uniform float uTreeR, uGnomeR;
uniform vec3 uTreeE, uGnomeE;

const vec3 PORTAL = vec3(0., 3.2, 6.);

float tower(vec3 p, float h, float w, float style){
  float d = sdBox(p - vec3(0, h*.5, 0), vec3(w, h*.5, w));
  if(style > .6){ // stepped art-deco setbacks and a spire
    d = min(d, sdBox(p - vec3(0, h + h*.06, 0), vec3(w*.7, h*.06, w*.7)));
    d = min(d, sdBox(p - vec3(0, h*1.15, 0), vec3(w*.45, h*.05, w*.45)));
    d = min(d, sdCylY(p - vec3(0, h*1.3, 0), w*.08, h*.12));
  } else if(style > .3){
    d = min(d, sdCylY(p - vec3(0, h + w*.5, 0), w*.6, w*.5));
  }
  return d;
}
float skyline(vec3 p, out float id){
  vec2 c = floor(p.xz/30.);
  vec2 q = mod(p.xz, 30.) - 15.;
  vec2 h = hash22(c);
  id = h.x;
  q -= (hash22(c + 3.) - .5)*6.;
  float H = 25. + 160.*pow(h.x, 3.);
  float w = 3.5 + 3.*h.y;
  float d = tower(vec3(q.x, p.y + 20., q.y), H, w, fract(h.x*7.3));
  if(hash12(c + 9.) < .3) d = max(d, 15. - q.x);
  return max(d, 110. - p.z);
}
// garden trees from the baked island-tree model (6.5 m tall)
float trees(vec3 p){
  vec3 q = vec3(abs(p.x) - 10.5, p.y, p.z - 12.5);
  float s = 3.4;
  return sdVol(uTreeS, uTreeR, uTreeE, (q - vec3(0., uTreeE.y*s, 0.))/s)*s;
}
float gnome(vec3 p){
  vec3 q = p - vec3(-6.8, 0., 3.);
  q.xz *= rot(2.4);
  float s = .32;
  return sdVol(uGnomeS, uGnomeR, uGnomeE, (q - vec3(0., uGnomeE.y*s, 0.))/s)*s;
}

float map(vec3 p, out float m, out float id){
  m = 0.; id = 0.;
  float d = p.y;
  float par = sdBox(p - vec3(0., .6, 16.), vec3(30., .6, .3));
  par = min(par, sdBox(vec3(abs(p.x) - 14., p.y - .6, p.z - 4.), vec3(.3, .6, 12.)));
  if(par < d){ d = par; m = 1.; }
  float hedge = sdRBox(p - vec3(0., .7, 15.), vec3(12., .7, .6), .4);
  hedge = min(hedge, sdRBox(vec3(abs(p.x) - 13., p.y - .7, p.z - 5.), vec3(.6, .7, 10.), .4));
  hedge += .18*(fbm3(p*2.2) - .5);
  if(hedge < d){ d = hedge; m = 2.; }
  vec3 cq = vec3(abs(p.x) - 5., p.y, p.z - 11.);
  float chair = min(sdBox(cq - vec3(0,.45,0), vec3(.35,.04,.35)), sdBox(cq - vec3(0,.75,.33), vec3(.35,.3,.03)));
  chair = min(chair, sdBox(vec3(abs(cq.x)-.3, cq.y-.22, abs(cq.z)-.3), vec3(.03,.22,.03)));
  if(chair < d){ d = chair; m = 3.; }
  float tr = trees(p);
  if(tr < d){ d = tr; m = 5.; }
  float gn = gnome(p);
  if(gn < d){ d = gn; m = 6.; }
  float sid;
  float s = skyline(p, sid);
  if(s < d){ d = s; m = 4.; id = sid; }
  return d;
}
float map(vec3 p){ float m, id; return map(p, m, id); }
vec3 nrm(vec3 p){ vec2 e = vec2(.004,0); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }
float shadow(vec3 ro, vec3 rd){
  float r = 1., t = .05;
  for(int i=0;i<28;i++){ float h = map(ro+rd*t); r = min(r, 8.*h/t); t += clamp(h, .05, 2.5); if(r < .01 || t > 40.) break; }
  return sat(r);
}

vec3 sky(vec3 rd, vec3 SUN){
  vec3 c = envSky(rd);
  // a faint rainbow opposite the sun, just after the storm of the jump
  float ang = acos(sat(dot(rd, -SUN)))*57.3;
  float rb = (ang - 40.5)/2.2;
  vec3 spec = clamp(vec3(abs(rb*3. - 1.5) - .5, 1. - abs(rb*3. - 1.), 1. - abs(rb*3. - 2.)), 0., 1.);
  c += spec*step(0., rb)*step(rb, 1.)*.35*smoothstep(.0,.2,rd.y)*(.4 + .6*fbm3(rd.xy*6.));
  return c;
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  vec3 SUN = envSunDir();
  SUN.y = max(SUN.y, .12); SUN = normalize(SUN);
  // flung out of the portal, tumbling backwards, landing on the lawn,
  // then a slow push towards the skyline as the dust settles
  float k = 1. - exp(-t*1.4);
  vec3 ro = mix(PORTAL + vec3(0,0,.2), vec3(-1.2, 1.1, -6.), k);
  ro.y += sin(sat(t*.8)*PI)*1.2;
  float settle = smoothstep(3.6, uDur, t);
  ro += vec3(.8, .5, 3.)*settle*settle;
  vec3 ta = mix(PORTAL + vec3(0,0,5.), vec3(1., 4.5, 20.), smoothstep(0., 3.8, t));
  float roll = (1. - smoothstep(0., 2.6, t))*2.4*sin(t*2.);
  vec3 rd = camRay(uv, ro, ta, roll, 1.25);

  float d = 0., m = 0., id = 0.;
  for(int i=0;i<150;i++){
    float h = map(ro + rd*d, m, id);
    if(abs(h) < .0006*d || d > 420.) break;
    d += h*(d > 40. ? .9 : .8);
  }
  vec3 col = sky(rd, SUN);
  vec3 sunCol = vec3(1., .76, .5)*3.2;
  if(d < 420.){
    vec3 p = ro + rd*d, n = nrm(p);
    vec3 v = -rd;
    Mat mt; mt.alb = vec3(.5); mt.rough = .6; mt.n = n; mt.ao = 1.; mt.h = .5;
    float metal = 0.;
    if(m == 0.){ // lawn: real grass, mow stripes, a stone path
      mt = planarMat(uGrassC, uGrassN, p.xz*.45, n, 1.);
      mt.alb *= mix(.8, 1.12, step(.5, fract(p.x*.25)))*vec3(.85, 1.08, .62);
      float path = step(abs(p.x + 8.), .8);
      if(path > .5){ mt = planarMat(uBrickC, uBrickN, p.xz*.5, n, 1.); mt.alb *= vec3(.95,.9,.85); }
    } else if(m == 1.) {
      mt = triMat(uBrickC, uBrickN, p, n, .6, 1.);
    } else if(m == 2.) {
      mt = triMat(uLeafC, uLeafN, p, n, .7, 1.5);
      mt.alb *= vec3(.55, .95, .45);
    } else if(m == 3.) {
      mt.alb = vec3(.08,.1,.06); mt.rough = .6;
    } else if(m == 5.) {
      vec3 q = vec3(abs(p.x) - 10.5, p.y, p.z - 12.5);
      mt.alb = volAlbedo(uTreeCol, (q - vec3(0., uTreeE.y*3.4, 0.))/3.4);
      Mat lf = triMat(uLeafC, uLeafN, p, n, 1.2, 1.2);
      mt.alb *= lf.alb*2.2; mt.n = lf.n; mt.rough = .7;
    } else if(m == 6.) {
      vec3 q = p - vec3(-6.8, 0., 3.); q.xz *= rot(2.4);
      mt.alb = volAlbedo(uGnomeCol, (q - vec3(0., uGnomeE.y*.32, 0.))/.32); mt.rough = .35;
    } else {
      mt = triMat(uFacadeC, uFacadeN, p*.25, n, 1., .8);
      mt.alb = mix(mt.alb, mt.alb*vec3(1.15,1.,.85), step(.5, fract(id*13.)));
      vec2 g = fract(vec2(p.y*.4, (p.x+p.z)*.3));
      float win = step(.25, g.x)*step(.3, g.y);
      mt.alb = mix(mt.alb, vec3(.04,.05,.06), win*.8);
      mt.rough = mix(mt.rough, .08, win); metal = win*.6;
    }
    float sh = m == 4. ? 1. : shadow(p + n*.03, SUN);
    col = litPBR(mt.alb, mt.rough, metal, mt.n, v, SUN, sunCol*sh);
    col += ambPBR(mt.alb, mt.rough, metal, mt.n, v, mt.ao*(m == 0. ? .9 : 1.));
    if(m == 2. || m == 5.) col += mt.alb*vec3(.9,1.,.4)*pow(sat(dot(rd, SUN)), 3.)*.8*sh;   // leaves glow in backlight
    vec3 haze = envLod(rd, 5.)*.9;
    col = mix(col, haze, 1.-exp(-d*.0012));
  }
  // the star portal collapses after the jump
  float R = 2.4*(1. - smoothstep(2.6, 3.7, t)) + .001;
  float tp = (PORTAL.z - ro.z)/rd.z;
  if(tp > 0. && tp < d){
    vec2 q = (ro + rd*tp).xy - PORTAL.xy;
    vec4 sp = starPortal(q, R, t + 10.);
    col = mix(col, vec3(.8,.9,1.)*.6 + col*.4, sp.a*.6);
    col += sp.rgb*1.2;
  }
  col += vec3(.5,.75,1.)*fogLight(ro, rd, PORTAL, d)*R*R*.012;
  col += vec3(.8,.9,1.)*exp(-pow((t-3.7)*6., 2.))*2.5*exp(-length(uv)*2.);
  // birds wheel over the skyline in the quiet that follows
  for(int i=0;i<7;i++){
    vec3 h = hash31(float(i)*4.7);
    vec3 bp = vec3(-30. + h.x*50. + t*3., 45. + h.y*25. + 3.*sin(t*1.3 + h.z*6.), 160. + h.z*80.);
    vec3 v2 = ro + rd*max(dot(bp-ro,rd),0.) - bp;
    float wing = abs(sin(t*9. + h.x*20.));
    col = mix(col, col*.25, smoothstep(.5, .2, length(v2*vec3(.6, 2.5 + wing*3., 1.)))*step(3.8, t)*.8);
  }
  col = mix(col, vec3(1.,.97,.95)*3., exp(-t*5.));
  return col;
}
`;

export const rooftop = {
  glsl: rooftopGLSL,
  uses: {
    uEnv: 'env:sunset', uGrass: 'mat:grass', uBrick: 'mat:sandbrick', uLeaf: 'mat:leaves', uFacade: 'mat:facade',
    uTree: 'vol:tree', uGnome: 'vol:gnome',
  },
  env: { rot: -2.41, gain: 0.9 },
};

const titleGLSL = /* glsl */ `
uniform sampler2D uTitle, uScratchC, uScratchN, uRustC, uRustN;

// The relic: an eye-shaped golden casing holding interlocked gyroscope rings.
float relic(vec3 p, float t, out float m){
  m = 0.;
  vec3 q = p*vec3(1., 1.35, 2.2);
  float body = max(length(q - vec3(0, -1.1, 0)) - 2.2, length(q - vec3(0, 1.1, 0)) - 2.2)/2.2;
  body = max(body, -(length(p.xy) - 1.05));
  body = max(body, abs(p.z) - .28);
  float rim = max(abs(body) - .03, abs(p.z) - .32);
  float d = min(body, rim);
  vec3 r = p;
  r.xz *= rot(t*.35); float r1 = sdTorus(r.xzy, vec2(.85, .045));
  r = p; r.yz *= rot(t*.28 + 1.); r.xy *= rot(.8); float r2 = sdTorus(r, vec2(.7, .04));
  r = p; r.xy *= rot(-t*.4); r.yz *= rot(1.3); float r3 = sdTorus(r, vec2(.55, .035));
  float rings = min(r1, min(r2, r3));
  if(rings < d){ d = rings; m = 1.; }
  float core = length(p) - .22;
  if(core < d){ d = core; m = 2.; }
  vec3 w = p; w.x = abs(w.x) - 2.6;
  float fan = 1e9;
  for(int i=0;i<6;i++){
    float a = -.9 + float(i)*.33;
    vec3 f = w; f.xy *= rot(a);
    fan = min(fan, sdRBox(f - vec3(.9, 0., 0.), vec3(1., .07, .06), .03));
  }
  if(fan < d){ d = fan; m = 3.; }
  return d;
}
float map(vec3 p, out float m){ return relic(p, uT, m); }
float map(vec3 p){ float m; return map(p, m); }
vec3 nrm(vec3 p){ vec2 e = vec2(.002,0); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }

${GOLD}

vec3 inkField(vec2 uv, float t){
  // a symmetric bloom of red ink, a Rorschach blot of the multiverse
  vec2 s = vec2(abs(uv.x), uv.y);
  float n = fbm(s*2.2 + vec2(0., -t*.08) + fbm(s*3. + t*.05)*.8);
  float blot = smoothstep(.95, .25, length(s*vec2(.85, 1.3)) + (n - .5)*.9);
  vec3 red = mix(vec3(.3,.0,.05), vec3(.75,.04,.16), n);
  vec3 blue = mix(vec3(.02,.01,.08), vec3(.15,.05,.35), n);
  vec3 c = mix(blue, red, blot);
  c += vec3(1.,.25,.45)*pow(sat(blot*n*1.4), 4.)*.35;
  c *= .6 + .6*smoothstep(.2,.8,fbm(s*6. - t*.03));
  return c;
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  // --- act 1: the relic, polished gold in a dark studio
  vec3 ro = vec3(.3*sin(t*.3), .1, -7.8 + t*.45);
  vec3 rd = camRay(uv, ro, vec3(0), .03*sin(t*.4), 1.4);
  float d = 0., m = 0.;
  for(int i=0;i<100;i++){
    float h = map(ro + rd*d, m);
    if(h < .0005 || d > 20.) break;
    d += h*.9;
  }
  float smoke = fbm(uv*2.5 + vec2(0., -t*.15));
  vec3 bg = mix(vec3(.2,.025,.0), vec3(.9,.3,.05), smoke*smoke)*(1.2 - length(uv)*.8);
  vec3 col = bg;
  if(d < 20.){
    vec3 p = ro + rd*d, n = nrm(p), v = -rd;
    Mat tx = triMat(uRustC, uRustN, p*2., n, 1., .4);
    float rough = mix(.14, .4, tx.rough);
    vec3 gold = vec3(1., .72, .32)*mix(.75, 1., tx.alb.r);
    col = ambPBR(gold, rough, 1., tx.n, v, 1.)*1.4;
    col += litPBR(gold, rough, 1., tx.n, v, normalize(vec3(-.5, .7, -.6)), vec3(1., .8, .6)*2.);
    col += vec3(1.,.4,.1)*pow(1.-sat(dot(n, v)), 3.)*1.2;                       // hot rim from the fire behind
    if(m == 2.) col = vec3(1.,.7,.3)*(2. + .6*sin(t*3.));                       // the core burns
  }
  col += vec3(1.,.55,.2)*.05/(length(uv)+.08)*smoothstep(1.,3.,t);
  // --- act 2: red ink floods in and the name is struck in gold
  float flood = smoothstep(4.0, 5.3, t + (fbm(uv*3.)-.5)*1.2);
  vec3 ink = inkField(uv, t);
  vec2 nuv = fc/uRes;
  float asp = uRes.x/uRes.y;
  float tw = min(.86, 1.9/asp);
  vec4 rect = vec4(.5 - tw*.5, .532 - tw*asp/4.*.5, tw, tw*asp/4.);
  vec3 tg; float tsh;
  float rev = smoothstep(5.1, 7.4, t);
  vec4 T = goldText(uTitle, uScratchC, uScratchN, rect, 2., rev, .6, nuv, t, 0., tg, tsh);
  ink *= 1. - tsh*.7;
  ink = ink*(1. - T.a) + T.rgb + tg;
  // the small lines, from the lettering canvas (green and blue channels)
  vec2 tuv = uv*vec2(.5, 1.)*1.25 + .5;
  tuv.y -= .02;
  vec3 txt = texture(uTex, tuv).rgb;
  float inside = step(0., tuv.x)*step(tuv.x, 1.)*step(0., tuv.y)*step(tuv.y, 1.);
  float small = (txt.g + txt.b)*inside*smoothstep(6.4, 7.6, t);
  ink = mix(ink, vec3(1.,.9,.8)*1.1, sat(small));
  col = mix(col, ink, flood);
  // closing dissolve into black ink
  float close = smoothstep(uDur - 2.4, uDur - .6, t + (fbm(uv*4.)-.5)*1.2);
  col *= 1. - close;
  return col;
}
`;

export const title = {
  glsl: titleGLSL,
  uses: { uEnv: 'env:studio', uTitle: 'ui:title', uScratch: 'mat:metal', uRust: 'mat:rust' },
  env: { rot: 0.6, gain: 2.4 },
};
