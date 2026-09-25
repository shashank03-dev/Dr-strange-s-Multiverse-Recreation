// Title screen: a mystic mandala of sling-ring sparks that draws itself while
// the film loads, a star waiting at its heart, and the warp that opens it.

const glsl = /* glsl */ `
uniform sampler2D uTitle;
uniform vec4  uTitleRect;   // title box in normalised screen coords (x, y, w, h)
uniform float uTitleQ;      // where the question mark starts (texture u)
uniform float uTitleIn;     // reveal 0..1
uniform float uAwake;       // 0 before the first key press, 1 once the screen has come alive
uniform sampler2D uScratchC, uScratchN;

float lineI(float d, float w){ return w*w/(d*d + w*w); }

// how much of a ring has been traced, clockwise from the top
float traced(float a, float f){
  if(f >= .995) return 1.;
  float a0 = fract(-(a - PI*.5)/TAU);
  return smoothstep(f + .002, f - .02, a0);
}

vec3 nebula(vec2 p, float t){
  float n = fbm(p*1.6 + vec2(t*.02, -t*.015) + fbm(p*2.4 - t*.02)*.9);
  float m = fbm(p*3.5 + 7.3 + t*.01);
  vec3 c = mix(vec3(.012,.006,.03), vec3(.22,.02,.12), smoothstep(.35,.85,n));
  c += vec3(.05,.03,.18)*smoothstep(.5,.9,m);
  // stars
  vec2 g = p*55.; vec2 id = floor(g); vec2 f = fract(g) - .5;
  vec2 h = hash22(id);
  float s = step(.965, h.x)*.012/(dot(f - (h - .5)*.6, f - (h - .5)*.6) + .002);
  c += vec3(.8,.85,1.)*s*(.6 + .4*sin(t*2. + h.y*40.));
  return c;
}


// ---------------------------------------------------------------- the gold title
float tSD(vec2 v){ return (texture(uTitle, v).r*255. - 128.)/127.*24.; }   // texture px, <0 inside

// Returns premultiplied colour in rgb, coverage in a; glow and shadow via out params.
vec4 goldTitle(vec2 nuv, float t, float warp, out vec3 glow, out float shadow){
  glow = vec3(0); shadow = 0.;
  nuv = .5 + (nuv - .5)/(1. + warp*warp*3.);
  vec2 tuv = (nuv - uTitleRect.xy)/uTitleRect.zw;
  if(any(lessThan(tuv, vec2(-.05))) || any(greaterThan(tuv, vec2(1.05)))) return vec4(0);
  vec2 tv = vec2(tuv.x, 1. - tuv.y);
  float pxs = uTitleRect.z*uRes.x/1024.;               // screen px per texture px
  float sd = tSD(tv);
  vec2 e = vec2(1./1024., 1./256.)*1.2;
  vec2 g = vec2(tSD(tv + vec2(e.x, 0.)) - tSD(tv - vec2(e.x, 0.)), tSD(tv - vec2(0., e.y)) - tSD(tv + vec2(0., e.y)))/2.4;
  // reveal: letters condense out of embers, sweeping left to right
  float nz = fbm3(tuv*vec2(26., 7.) + 3.);
  float front = uTitleIn*1.45 - tuv.x*.4 - nz*.35;
  float vis = smoothstep(0., .06, front);
  float emberEdge = exp(-abs(front)*22.)*step(0., uTitleIn - .001)*(1. - smoothstep(.95, 1., uTitleIn));
  float cover = sat(.5 - sd*pxs)*vis;
  // drop shadow and warm halo behind the letters
  float sdS = tSD(tv + vec2(-.004, .03));
  shadow = sat(1. - sdS*.2)*.7*vis*smoothstep(23., 12., sdS);
  glow = vec3(1., .45, .12)*exp(-max(sd, 0.)*.11)*smoothstep(22., 8., sd)*.22*vis*(1. + uAwake);
  glow += vec3(1., .55, .2)*emberEdge*sat(1. - abs(sd)*.08)*3.;
  if(cover <= 0.) return vec4(0);

  float bev = 4.5;
  float depth = sat(-sd/bev);
  float slope = 1. - depth;
  vec3 n = normalize(vec3(g*slope*2.2, 1.));
  // brushed metal: roughness and fine normal from the scratch texture
  vec4 sc = texture(uScratchC, tuv*vec2(5., 1.25));
  vec4 sn = texture(uScratchN, tuv*vec2(5., 1.25));
  n = normalize(n + vec3((sn.xy*2. - 1.)*.12*depth, 0.));
  float rough = mix(.12, .38, sc.a);
  vec3 v = vec3(0., 0., 1.);
  vec3 r = reflect(-v, n);
  vec3 dir = normalize(vec3(r.x*1.3, r.y*1.1 + .08, -r.z + .15));
  bool q = tuv.x > uTitleQ;
  vec3 col;
  if(!q){
    vec3 F0 = vec3(1., .73, .33);
    float nv = sat(dot(n, v));
    vec2 ab = envBRDF(nv, rough);
    // studio softbox: a bright band above, falling to a warm floor bounce below
    float sb = smoothstep(-.35, .55, dir.y)*(.6 + .4*smoothstep(.9, .2, abs(dir.x)));
    vec3 soft = mix(vec3(.06,.03,.015), vec3(1.25,1.1,.95), sb*sb) + vec3(.8,.35,.12)*exp(-pow((dir.y + .55)*4., 2.));
    col = (min(envLod(dir, rough*6.), vec3(1.6))*.9 + soft*(1. - rough*.8))*(F0*ab.x + ab.y);
    // key and rim lights
    col += litPBR(F0, rough, 1., n, v, normalize(vec3(-.5, .8, .6)), vec3(1., .85, .7)*1.1);
    col += litPBR(F0, rough, 1., n, v, normalize(vec3(.6, -.6, .5)), vec3(1., .4, .7)*.5*(.4 + uAwake));
    // travelling light sweep
    float s = fract(t*.11 + .35)*2.4 - .7;
    float band = exp(-pow((tuv.x - s + (tuv.y - .5)*.5)*3.5, 2.));
    col += vec3(1., .86, .62)*band*(.5 + .5*depth)*.35;
    col *= .85 + .3*sc.r;
  } else {
    // the question mark: pink crystal lit from within
    float pulse = .75 + .25*sin(t*2.1);
    col = vec3(1., .3, .72)*(.7 + .6*depth)*pulse;
    col += vec3(1., .85, .95)*pow(slope, 2.)*1.5;
    col += envLod(dir, .5)*.25;
    glow += vec3(1., .3, .75)*exp(-max(sd, 0.)*.08)*smoothstep(22., 6., sd)*.5*vis*pulse;
  }
  col += vec3(1., .6, .25)*emberEdge*2.;
  return vec4(col*cover, cover);
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  float form = uMenu.x, warp = uMenu.y, hov = uMenu.z, noT = uMenu.w;

  // the warp: spin up, open the star, dive in
  // the circle flies past the camera as we dive through it
  float dive = smoothstep(.2, .75, warp);
  vec2 p = uv/(1. + dive*dive*7.);
  p *= rot(warp*warp*2.5);
  // a gentle breathing tilt of the mandala's plane
  vec2 q = (p - vec2(0., -.13))/.7;
  q.y *= 1. + .06*sin(t*.31);
  q.x *= 1. + .04*sin(t*.23 + 1.);

  vec3 col = nebula(uv*.9 + vec2(0., t*.004), t)*(1. - dive*.7);

  float r = length(q), a = atan(q.y, q.x);
  float energy = (.55 + .45*uAwake) + .6*max(hov, 0.)*uAwake + warp*3.;
  float dim = 1. + .45*min(hov, 0.);
  float spin = t*.12 + warp*warp*9.;
  vec3 M = vec3(0);

  // concentric rings with sparks streaming around them
  const float RR[5] = float[5](.445, .425, .335, .215, .185);
  for(int k=0;k<5;k++){
    float R = RR[k];
    float fk = sat(form*1.5 - float(k)*.11);
    float dir = (k%2==0) ? 1. : -1.;
    float flow = noise(vec2(a*R*95. - t*7.*dir*energy, float(k)*13.));
    float spark = .35 + 1.6*pow(flow, 5.);
    M += vec3(1.,.5,.12)*lineI(r - R, .0022)*spark*traced(a, fk);
  }
  // outer bead ring: twelve small circles
  {
    float fk = sat(form*1.5 - .2);
    float ba = a + spin*.6;
    float cell = TAU/12.;
    float bi = floor((ba + cell*.5)/cell);
    float bc = bi*cell;
    vec2 bp = vec2(cos(bc - spin*.6), sin(bc - spin*.6))*.4;
    float d = abs(length(q - bp) - .022);
    M += vec3(1.,.55,.15)*lineI(d, .0018)*1.2*traced(bc - spin*.6, fk);
  }
  // runes between the outer rings
  {
    float fk = sat(form*1.5 - .35);
    float ra = a - spin*.5;
    float cells = 44.;
    float ca = (ra + PI)/TAU*cells;
    float ci = floor(ca);
    vec2 cq = vec2((fract(ca) - .5)*1.05, (r - .38)/.022);
    vec3 h = hash31(ci + 3.);
    float d = abs(cq.x - (h.x - .5)*.5);                               // stem
    d = min(d, max(abs(cq.y - (h.y - .5)*1.2), abs(cq.x) - .3));         // bar
    if(h.z > .5) d = min(d, abs(length(cq - vec2(0., (h.z - .75)*2.)) - .32)); // loop
    else d = min(d, abs(abs(cq.x) + abs(cq.y - .2) - .4));                // chevron
    d = max(d, abs(cq.y) - .8);
    float g = lineI(d*.022, .0016)*step(abs(r - .38), .03);
    float flick = .7 + .3*sin(t*3. + ci*1.7);
    M += vec3(1.,.6,.2)*g*flick*traced(a, fk);
  }
  // two interlocked squares
  for(int k=0;k<2;k++){
    float fk = sat(form*1.5 - .5 - float(k)*.08);
    vec2 s = q*rot(-spin*.7 + float(k)*PI*.25);
    float d = abs(sdBox2(s, vec2(.235)));
    float flow = noise(vec2((s.x + s.y)*40. + t*6.*energy, float(k)*7.));
    M += vec3(1.,.48,.1)*lineI(d, .0018)*(.5 + 1.3*pow(flow, 4.))*traced(a, fk);
  }
  // pentagram at the heart
  {
    float fk = sat(form*1.5 - .7);
    vec2 s = q*rot(spin*.45);
    float d = abs(sdStar5(s, .17, .38));
    M += vec3(1.,.55,.15)*lineI(d, .0017)*1.3*traced(a, fk);
  }
  M *= energy*dim*1.25;
  // a whisper of heat haze glow around the circle
  M += vec3(.5,.15,.03)*exp(-abs(r - .43)*18.)*.25*form*energy*dim;
  // hovering "no" chills the circle; saying it flashes it red
  float nop = exp(-noT*3.5);
  M = mix(M, M*vec3(1.6,.25,.25), nop);
  M = mix(M, vec3(dot(M, vec3(.33))), max(-hov, 0.)*.5);
  col += M*(1. - smoothstep(.55, .85, warp));

  // sparks shed from the outer ring, falling away like molten metal
  for(int i=0;i<46;i++){
    vec3 h = hash31(float(i)*7.13);
    float ph = fract(t*(.25 + .35*h.y) + h.z);
    float ang = h.x*TAU + spin;
    vec2 sp = vec2(cos(ang), sin(ang))*.445;
    sp += vec2(cos(ang), sin(ang))*ph*.06 + vec2((h.y - .5)*.1*ph, -ph*ph*.35);
    vec2 v = q - sp;
    float life = (1. - ph)*step(.05, form)*traced(ang, sat(form*1.5));
    col += vec3(1.,.55,.18)*.000035/(dot(v,v) + .000012)*life*energy*dim*(1. - warp);
  }

  // the star at the heart: the spark the film opens with
  float breathe = .75 + .25*sin(t*1.7);
  float st = sdStar5(q*rot(t*.2), .014 + .01*max(hov,0.) + .004*breathe, .45);
  float core = exp(-max(st, 0.)*260.);
  float glow = .0011/(r*r + .0012);
  vec3 starC = mix(vec3(1.,.5,.85), vec3(.85,.92,1.), smoothstep(0., .01, -st));
  col += starC*(core*2.5 + glow*(.8 + .9*max(hov, 0.)))*form;
  float spikes = pow(abs(cos((a - t*.2)*2.5)), 250.)*exp(-r*9.)*1.2*form;
  col += vec3(1.,.65,.95)*spikes;

  // the star portal opens and swallows the view
  // (drawn in screen space so its edge sweeps outwards past the frame)
  float R = pow(smoothstep(.05, .62, warp), 2.)*1.6;
  vec2 sq = uv*rot(-t*.2 - warp*2.);
  if(R > .02){
    vec4 sp = starPortal(sq, R, t);
    // inside: a hyperspace tunnel of streaking magenta and blue light
    float ra = atan(uv.y, uv.x), rr = length(uv);
    float z = .25/(rr + .02) + t*(2. + warp*18.);
    float streak = pow(noise(vec2(ra*14., z*.6)), 6.)*3. + pow(noise(vec2(ra*40. + 3., z*1.4)), 10.)*4.;
    vec3 tunnel = mix(vec3(1.,.25,.7), vec3(.4,.6,1.), noise(vec2(ra*3., z*.1)))*streak*smoothstep(.0,.25,rr);
    tunnel += vec3(1.,.55,.9)*.02/(rr*rr + .02);
    tunnel *= 1. - smoothstep(.72, .9, warp);
    float open = smoothstep(.08, .3, warp);
    col = mix(col, tunnel, sp.a*open);
    col += sp.rgb*(.5 + 1.5*warp)*(1. - smoothstep(.38, .58, warp));
  }
  // ...and everything collapses to a single point of light in the dark
  float fin = smoothstep(.78, .98, warp);
  col = mix(col, vec3(0.) + vec3(1.,.6,.9)*.0006/(dot(uv,uv) + .0004), fin);
  // the title sits in front of the circle
  vec3 tg; float tsh;
  vec4 T = goldTitle(fc/uRes, t, warp, tg, tsh);
  float tf = 1. - smoothstep(.2, .55, warp);
  col *= 1. - tsh*.8*tf;
  col = col*(1. - T.a*tf) + T.rgb*tf;
  col += tg*tf;
  // vignette
  col *= 1. - .55*dot(uv*vec2(.7, 1.), uv*vec2(.7, 1.));
  return col;
}
`;

export const menu = {
  glsl,
  uses: { uEnv: 'env:studio', uTitle: 'ui:the', uScratch: 'mat:metal' },
  env: { rot: 0.6, gain: 1.0 },
};
