// 18. Earth-616 -- spat out onto a rooftop garden at golden hour.
// 19. The title -- a golden relic, red ink, and the name of the film.

export const rooftop = /* glsl */ `
const vec3 SUN = normalize(vec3(.75, .3, -.6));
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
  float w = 3.5 + 4.5*h.y;
  float d = tower(vec3(q.x, p.y + 20., q.y), H, w, fract(h.x*7.3));
  if(hash12(c + 9.) < .3) d = max(d, 15. - q.x);   // leave gaps in the skyline
  return max(d, 110. - p.z);          // only beyond the parapet
}

float map(vec3 p, out float m, out float id){
  m = 0.; id = 0.;
  float lawn = p.y;
  float d = lawn;
  // parapet wall + hedges around the garden
  float par = sdBox(p - vec3(0., .6, 16.), vec3(30., .6, .3));
  par = min(par, sdBox(vec3(abs(p.x) - 14., p.y - .6, p.z - 4.), vec3(.3, .6, 12.)));
  if(par < d){ d = par; m = 1.; }
  float hedge = sdRBox(p - vec3(0., .7, 15.), vec3(12., .7, .6), .4);
  hedge = min(hedge, sdRBox(vec3(abs(p.x) - 13., p.y - .7, p.z - 5.), vec3(.6, .7, 10.), .4));
  hedge = min(hedge, length(vec3(abs(p.x) - 9., p.y - 1.4, p.z - 14.)) - 1.6);
  hedge += .25*(fbm3(p*2.2) - .5);
  if(hedge < d){ d = hedge; m = 2.; }
  // garden chairs
  vec3 cq = vec3(abs(p.x) - 5., p.y, p.z - 11.);
  float chair = min(sdBox(cq - vec3(0,.45,0), vec3(.35,.04,.35)), sdBox(cq - vec3(0,.75,.33), vec3(.35,.3,.03)));
  chair = min(chair, sdBox(vec3(abs(cq.x)-.3, cq.y-.22, abs(cq.z)-.3), vec3(.03,.22,.03)));
  if(chair < d){ d = chair; m = 3.; }
  float sid;
  float s = skyline(p, sid);
  if(s < d){ d = s; m = 4.; id = sid; }
  return d;
}
float map(vec3 p){ float m, id; return map(p, m, id); }
vec3 nrm(vec3 p){ vec2 e = vec2(.005,0); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }
float shadow(vec3 ro, vec3 rd){
  float r = 1., t = .05;
  for(int i=0;i<24;i++){ float h = map(ro+rd*t); r = min(r, 8.*h/t); t += clamp(h, .05, 2.); if(r < .01 || t > 30.) break; }
  return sat(r);
}

vec3 sky(vec3 rd){
  vec3 c = mix(vec3(1.,.74,.48), vec3(.28,.5,.88), pow(sat(rd.y + .02), .55));
  c += vec3(1.,.6,.3)*pow(sat(dot(rd, SUN)), 5.)*.6 + vec3(1.,.9,.7)*pow(sat(dot(rd, SUN)), 400.)*30.;
  // soft clouds
  float cl = fbm(rd.xz/max(rd.y+.1,.05)*.8);
  c = mix(c, vec3(1.,.85,.75), smoothstep(.55,.8,cl)*.5*sat(rd.y*4.));
  // rainbow around the anti-solar point
  float ang = acos(sat(dot(rd, -SUN)))*57.3;
  float rb = (ang - 40.5)/2.2;
  vec3 spec = clamp(vec3(abs(rb*3. - 1.5) - .5, 1. - abs(rb*3. - 1.), 1. - abs(rb*3. - 2.)), 0., 1.);
  c += spec*step(0., rb)*step(rb, 1.)*.45*smoothstep(.0,.2,rd.y)*(.4 + .6*fbm3(rd.xy*6.));
  return c;
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  // flung out of the portal, tumbling backwards, landing on the lawn
  float k = 1. - exp(-t*1.6);
  vec3 ro = mix(PORTAL + vec3(0,0,.2), vec3(-1.2, 1.1, -6.), k);
  ro.y += sin(sat(t*.9)*PI)*1.2;
  vec3 ta = mix(PORTAL + vec3(0,0,5.), vec3(1., 4., 20.), smoothstep(0., 3.5, t));
  float roll = (1. - smoothstep(0., 2.2, t))*2.4*sin(t*2.);
  vec3 rd = camRay(uv, ro, ta, roll, 1.2);

  float d = 0., m = 0., id = 0.;
  for(int i=0;i<140;i++){
    float h = map(ro + rd*d, m, id);
    if(abs(h) < .0008*d || d > 400.) break;
    d += h*(d > 40. ? 1. : .8);
  }
  vec3 col = sky(rd);
  if(d < 400.){
    vec3 p = ro + rd*d, n = nrm(p);
    vec3 alb;
    if(m == 0.){ // lawn with mow stripes and blade noise
      alb = mix(vec3(.13,.28,.06), vec3(.22,.4,.08), step(.5, fract(p.x*.25)))*(.7 + .5*noise(p.xz*40.));
      alb = mix(alb, vec3(.55,.5,.45), step(abs(p.x + 8.), .8)); // stone path
    } else if(m == 1.) alb = vec3(.55,.45,.38);
    else if(m == 2.) alb = mix(vec3(.08,.22,.05), vec3(.25,.45,.1), fbm3(p*6.));
    else if(m == 3.) alb = vec3(.35,.4,.2);
    else {
      alb = mix(vec3(.7,.58,.45), vec3(.42,.45,.5), step(.5, fract(id*13.)));
      vec2 g = fract(vec2(p.y*.4, (p.x+p.z)*.3));
      float win = step(.25, g.x)*step(.3, g.y);
      alb = mix(alb, vec3(.12,.15,.2), win*.6);
    }
    float sh = m == 4. ? 1. : shadow(p + n*.02, SUN);
    float dif = sat(dot(n, SUN))*sh;
    col = alb*(dif*vec3(1.,.78,.52)*3.4 + vec3(.35,.45,.65)*(n.y*.4+.6)*.8);
    if(m == 4.){ // glass towers glint gold
      vec3 r = reflect(rd, n);
      col += sky(r)*.25*fresnel(n, rd, .1);
    }
    // aerial perspective: warm golden haze towards the sun
    vec3 haze = mix(vec3(.95,.78,.62), vec3(1.,.72,.45), pow(sat(dot(rd, SUN)), 3.));
    col = mix(col, haze, 1.-exp(-d*.0019));
  }
  // the star portal, collapsing after the jump
  float R = 2.4*(1. - smoothstep(2.2, 3.3, t)) + .001;
  float tp = (PORTAL.z - ro.z)/rd.z;
  if(tp > 0. && tp < d){
    vec2 q = (ro + rd*tp).xy - PORTAL.xy;
    vec4 sp = starPortal(q, R, t + 10.);
    col = mix(col, vec3(.8,.9,1.)*.6 + col*.4, sp.a*.6);
    col += sp.rgb*1.2;
  }
  col += vec3(.5,.75,1.)*fogLight(ro, rd, PORTAL, d)*R*R*.012;
  // collapse flash
  col += vec3(.8,.9,1.)*exp(-pow((t-3.3)*6., 2.))*2.5*exp(-length(uv)*2.);
  // start inside the light
  col = mix(col, vec3(1.,.97,.95)*3., exp(-t*5.));
  return col;
}
`;

export const title = /* glsl */ `
// The relic: an eye-shaped golden casing holding interlocked gyroscope rings.
float relic(vec3 p, float t, out float m){
  m = 0.;
  // vesica (eye) body: intersection of two spheres, flattened
  vec3 q = p*vec3(1., 1.35, 2.2);
  float body = max(length(q - vec3(0, -1.1, 0)) - 2.2, length(q - vec3(0, 1.1, 0)) - 2.2)/2.2;
  body = max(body, -(length(p.xy) - 1.05));                   // open centre
  body = max(body, abs(p.z) - .28);
  // rim ridge
  float rim = max(abs(body) - .03, abs(p.z) - .32);
  float d = min(body, rim);
  // gyroscope rings
  vec3 r = p;
  r.xz *= rot(t*.35); float r1 = sdTorus(r.xzy, vec2(.85, .045));
  r = p; r.yz *= rot(t*.28 + 1.); r.xy *= rot(.8); float r2 = sdTorus(r, vec2(.7, .04));
  r = p; r.xy *= rot(-t*.4); r.yz *= rot(1.3); float r3 = sdTorus(r, vec2(.55, .035));
  float rings = min(r1, min(r2, r3));
  if(rings < d){ d = rings; m = 1.; }
  float core = length(p) - .22;
  if(core < d){ d = core; m = 2.; }
  // feathered wings fanning out on either side
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

vec3 inkField(vec2 uv, float t){
  // symmetric smoky red ink bloom (a Rorschach blot of the multiverse)
  vec2 s = vec2(abs(uv.x), uv.y);
  float n = fbm(s*2.2 + vec2(0., -t*.08) + fbm(s*3. + t*.05)*.8);
  float blot = smoothstep(.95, .25, length(s*vec2(.85, 1.3)) + (n - .5)*.9);
  vec3 red = mix(vec3(.3,.0,.05), vec3(.75,.04,.16), n);
  vec3 blue = mix(vec3(.02,.01,.08), vec3(.15,.05,.35), n);
  vec3 c = mix(blue, red, blot);
  c += vec3(1.,.25,.45)*pow(sat(blot*n*1.4), 4.)*.35;
  c *= .6 + .6*smoothstep(.2,.8,fbm(s*6. - t*.03));   // ink grain
  return c;
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  // --- act 1: the relic
  vec3 ro = vec3(.3*sin(t*.3), .1, -7.5 + t*.55);
  vec3 rd = camRay(uv, ro, vec3(0), .03*sin(t*.4), 1.4);
  float d = 0., m = 0.;
  for(int i=0;i<100;i++){
    float h = map(ro + rd*d, m);
    if(h < .0005 || d > 20.) break;
    d += h*.9;
  }
  float smoke = fbm(uv*2.5 + vec2(0., -t*.15));
  vec3 bg = mix(vec3(.25,.03,.0), vec3(1.,.35,.05), smoke*smoke)*(1.2 - length(uv)*.8);
  vec3 col = bg;
  if(d < 20.){
    vec3 p = ro + rd*d, n = nrm(p);
    vec3 L = normalize(vec3(-.5, .7, -.6));
    vec3 r = reflect(rd, n);
    float dif = sat(dot(n, L));
    vec3 gold = vec3(1.,.62,.22);
    float tarn = fbm3(p*8.);
    col = gold*(dif*.9 + .15)*(.5 + .5*tarn);
    col += gold*pow(sat(dot(r, L)), 30.)*3.;
    col += vec3(1.,.4,.1)*pow(1.-sat(dot(n,-rd)), 3.)*1.2;                     // hot rim from the fire behind
    col += gold*mix(vec3(.3,.08,.0), vec3(1.,.5,.2), sat(r.y*.5+.5))*.6;       // fake env reflection
    if(m == 2.) col = vec3(1.,.7,.3)*(2. + 2.*sin(t*3.)*.3);                   // the core burns
  }
  col += vec3(1.,.55,.2)*.05/(length(uv)+.08)*smoothstep(1.,3.,t);
  // --- act 2: red ink floods in, the title burns through
  float flood = smoothstep(2.4, 3.6, t + (fbm(uv*3.)-.5)*1.2);
  vec3 ink = inkField(uv, t);
  vec2 tuv = uv*vec2(.5, 1.)*1.25 + .5;
  tuv.y -= .02;
  vec3 txt = texture(uTex, tuv).rgb;
  float inside = step(0., tuv.x)*step(tuv.x, 1.)*step(0., tuv.y)*step(tuv.y, 1.);
  txt *= inside;
  float reveal = smoothstep(3.3, 4.6, t + (noise(uv*9.)-.5)*.6);
  vec3 letter = vec3(1.,.93,.88)*txt.r*1.05 + vec3(1.,.88,.84)*(txt.g + txt.b)*.8;
  ink = mix(ink, letter, sat(txt.r + txt.g + txt.b)*reveal);
  // embers of light cling to the letters as they appear
  ink += vec3(1.,.5,.3)*txt.r*exp(-pow((t - 3.9)*2.5, 2.))*3.;
  col = mix(col, ink, flood);
  // closing dissolve into black ink
  float close = smoothstep(6.2, 7.6, t + (fbm(uv*4.)-.5)*1.2);
  col *= 1. - close;
  return col;
}
`;
