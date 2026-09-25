// Realms 7-11: ocean, Manhattan, machine, boneyard, primeval jungle.

// 7. Ocean -- sinking through sunlit water above a coral slope.
export const ocean = /* glsl */ `
const vec3 SUN = normalize(vec3(-.35, 1., .25));

float caustic(vec2 uv, float time){
  vec2 p = mod(uv*TAU, TAU) - 250.;
  vec2 i = p; float c = 1.; const float inten = .005;
  for(int n=0;n<4;n++){
    float tt = time*(1. - (3.5/float(n+1)));
    i = p + vec2(cos(tt-i.x)+sin(tt+i.y), sin(tt-i.y)+cos(tt+i.x));
    c += 1./length(vec2(p.x/(sin(i.x+tt)/inten), p.y/(cos(i.y+tt)/inten)));
  }
  c /= 4.; c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.);
}

float ground(vec2 xz){
  return -9. + xz.x*.55 + 1.2*fbm3(xz*.15) + .25*noise(xz*1.3) + .08*sin(xz.x*3.+xz.y*1.5);
}

// coral: bumpy blobs and stubby branches in a sparse grid on the slope
float coral(vec3 p, out float cid){
  vec2 c = floor(p.xz/3.);
  vec2 f = mod(p.xz,3.) - 1.5;
  vec2 h = hash22(c);
  cid = hash12(c+7.);
  vec3 q = vec3(f.x - (h.x-.5)*1.4, p.y - ground(c*3.+1.5), f.y - (h.y-.5)*1.4);
  if(h.x < .25) return 2.;
  float d;
  if(cid < .5){ // brain / boulder coral
    float r = .5 + .5*h.y;
    d = sdEllipsoid(q, vec3(r, r*.7, r));
    d += .04*sin(q.x*25.+sin(q.z*20.)*2.);
  } else {      // branching coral
    d = 1e9;
    for(int i=0;i<5;i++){
      vec3 k = hash31(cid*31.+float(i));
      vec3 tip = vec3((k.x-.5)*1.2, .6 + k.y*1.2, (k.z-.5)*1.2);
      d = smin(d, sdCapsule(q, vec3(0), tip, .09 + .05*k.x), .15);
    }
  }
  return d;
}

float fish(vec3 p, float t, out float fid){
  // one school, swimming in a slow arc
  vec3 cen = vec3(-3., -2., 13.);
  vec3 q = p - cen;
  fid = 0.;
  if(length(q) > 7.) return length(q) - 6.;
  q.xz *= rot(t*.15);
  q.x += t*1.5;
  vec3 id = floor(q/1.1);
  vec3 r = mod(q, 1.1) - .55;
  vec3 h = hash33(id);
  fid = h.x;
  r -= (h-.5)*.5;
  r.x += .08*sin(t*6. + h.y*20.);
  float body = sdEllipsoid(r, vec3(.14,.06,.025));
  float tail = sdBox(r - vec3(-.16, 0., 0.), vec3(.035, .05 + .02*sin(t*18.+h.z*9.), .008));
  float d = min(body, tail);
  return (h.z < .8) ? 1. : d;
}

float map(vec3 p, out float m, out float id){
  float g = (p.y - ground(p.xz))*.6;
  m = 0.; id = 0.;
  float d = g;
  float cid; float c = coral(p, cid);
  if(c < d){ d = c; m = 1.; id = cid; }
  float fid; float f = fish(p, uT, fid);
  if(f < d){ d = f; m = 2.; id = fid; }
  return d;
}
float map(vec3 p){ float m, id; return map(p, m, id); }
vec3 nrm(vec3 p){ vec2 e = vec2(.005,0); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }

vec3 water(vec3 rd, float depth){
  float up = rd.y*.5+.5;
  vec3 c = mix(vec3(.0,.03,.1), vec3(.02,.28,.55), pow(up, 1.7));
  c += vec3(.4,.8,.9)*pow(sat(dot(rd, SUN)), 6.)*.8;
  return c*exp(-max(-depth,0.)*.02);
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  vec3 ro = vec3(-4. + t*.9, 2.5 - t*1.1, t*1.6);
  vec3 ta = ro + vec3(-.1, -.38 - .1*sin(t*.6), 1.);
  vec3 rd = camRay(uv, ro, ta, -.55 + t*.12, 1.15);

  float d = 0., m = 0., id = 0.;
  for(int i=0;i<100;i++){
    vec3 p = ro + rd*d;
    float h = map(p, m, id);
    if(abs(h) < .001*d || d > 40.) break;
    d += h*.8;
  }
  vec3 bg = water(rd, ro.y);
  vec3 col = bg;
  if(d < 40.){
    vec3 p = ro + rd*d, n = nrm(p);
    vec3 alb;
    if(m == 0.){
      alb = mix(vec3(.75,.7,.55), vec3(.55,.5,.38), fbm3(p.xz*2.));
      // sea-grass tufts
      float gr = smoothstep(.55,.75,fbm3(p.xz*.8))*step(.5, noise(p.xz*14.));
      alb = mix(alb, vec3(.12,.3,.12), gr);
    } else if(m == 1.){
      alb = id < .2 ? vec3(1.,.35,.2) : id < .4 ? vec3(.95,.6,.2) : id < .7 ? vec3(.8,.2,.7) : vec3(1.,.45,.55);
      alb *= .6 + .6*noise(p*9.);
    } else {
      alb = id < .7 ? vec3(1.,.75,.1) : vec3(.3,.6,1.);
      alb = mix(alb, vec3(.95), step(.5, fract(p.x*9.)));
    }
    float dif = sat(dot(n, SUN));
    float cau = caustic(p.xz*.25 + p.y*.05, t*.8)*2.5;
    float depthAtt = exp(-max(-p.y,0.)*.05);
    vec3 lit = alb*(dif*(.6 + cau)*vec3(.7,.95,1.)*1.6*depthAtt + vec3(.1,.3,.4)*(n.y*.5+.5));
    if(m == 2.) lit += vec3(.6,.9,1.)*pow(sat(dot(reflect(rd,n), SUN)),20.)*2.;
    // underwater absorption: red goes first
    vec3 ext = exp(-d*vec3(.28,.07,.045));
    col = lit*ext + bg*(1.-ext);
  }
  // god rays: sample shafts along the view ray
  float tm = min(d, 40.);
  vec3 sh = vec3(0);
  float j = hash12(fc + fract(t)*31.);
  for(int i=0;i<14;i++){
    float s = (float(i)+j)/14.*min(tm, 25.);
    vec3 q = ro + rd*s;
    vec2 pr = q.xz - SUN.xz/SUN.y*q.y;
    float ray = pow(fbm3(pr*.35 + t*.05), 3.)*2.;
    sh += ray*exp(-s*.08);
  }
  col += vec3(.35,.7,.8)*sh/14.*min(tm,25.)*.09*(1.+pow(sat(dot(rd,SUN)),2.)*2.);
  // Snell's window glitter when looking up
  col += vec3(.7,.95,1.)*caustic(rd.xz/max(rd.y,.1)*.3, t)*smoothstep(.3,.9,rd.y)*1.5;
  // a big fish silhouette cruising in the distance
  vec3 bp = vec3(4. - t*1.5, -1.5, 16.);
  vec3 q = ro + rd*max(dot(bp-ro,rd),0.) - bp;
  float big = min(sdEllipsoid(q, vec3(1.4,.32,.3)), sdEllipsoid(q - vec3(1.5, 0., 0.) , vec3(.25,.45 + .1*sin(t*5.),.05)));
  col = mix(col, bg*.45, smoothstep(.03,-.03,big)*.55);
  // rising bubbles + marine snow
  for(int i=0;i<40;i++){
    vec3 h = hash31(float(i)*3.1);
    vec3 bpos = ro + vec3((h.x-.5)*6., mod(h.y*8. + t*(1.+h.z*2.), 8.) - 4., 1.5 + h.z*6.);
    bpos.x += .15*sin(t*3.+h.x*9.);
    vec3 v = ro + rd*max(dot(bpos-ro,rd),0.) - bpos;
    float r = .015 + .03*h.z*step(.6,h.x);
    float ring = smoothstep(r*.5, r, length(v))*smoothstep(r*1.3, r, length(v));
    col += vec3(.7,.95,1.)*(ring*1.2 + .00008/(dot(v,v)+.00003));
  }
  return col;
}
`;

// 8. Manhattan -- tumbling across a sunlit street as glass rains down.
export const city = /* glsl */ `
const vec3 SUN = normalize(vec3(.35, .8, -.48));

float lotH(float lot, float side){ return 14. + 40.*pow(hash11(lot*1.7 + side*11.), 2.); }

float building(vec3 p, out float lot, out float side){
  side = sign(p.x);
  vec3 q = p; q.x = abs(q.x);
  lot = floor(q.z/9.) ;
  float lz = mod(q.z, 9.) - 4.5;
  float setback = .6*hash11(lot*3.3+side);
  float h = lotH(lot, side);
  float d = sdBox(vec3(q.x - 16. - setback, q.y - h*.5, lz), vec3(6., h*.5, 4.45));
  // window recesses & cornices
  float fy = mod(q.y, 3.2) - 1.6;
  float fz = mod(lz + 4.5, 1.8) - .9;
  float win = sdBox2(vec2(fy + .2, fz), vec2(.8, .5));
  float face = q.x - 10. - setback;
  d = max(d, -max(max(-face, face - .4), win));
  // pilasters between window bays
  float pz = mod(lz + 4.5, 3.6) - 1.8;
  float pil = sdBox(vec3(face + .12, q.y - h*.5, pz), vec3(.14, h*.5, .14));
  d = min(d, pil);
  // iron fire escapes on the older buildings
  if(hash11(lot*5.1 + side) > .45){
    float fy2 = mod(q.y - 3.2, 3.2) - .05;
    float esc = sdBox(vec3(face + .75, fy2, lz - 1.), vec3(.7, .04, 1.9));
    float rail = sdBox(vec3(face + 1.42, fy2 - .5, lz - 1.), vec3(.02, .03, 1.9));
    float ladder = sdBox(vec3(face + .8, mod(q.y, 3.2) - 1.6, lz - 1. - 1.2*(step(1.6,mod(q.y,6.4))*2.-1.)*.5), vec3(.3, 1.8, .03));
    esc = min(min(esc, rail), max(ladder, -.5));
    esc = max(esc, max(3. - q.y, q.y - h + 1.));
    d = min(d, esc);
  }
  float cornice = sdBox(vec3(face - .15, mod(q.y + .5, 3.2) - 1.6, lz), vec3(.2, .08, 4.5));
  d = min(d, max(cornice, q.y - h));
  // roof cap
  d = min(d, sdBox(vec3(face-.2, q.y - h, lz), vec3(.4, .35, 4.5)));
  return d;
}

float car(vec3 p, out float kind){
  // three parked / stalled cars along the street
  float d = 1e9; kind = 0.;
  for(int i=0;i<4;i++){
    vec3 h = hash31(float(i)*4.1+2.);
    vec3 c = vec3((float(i%2)*2.-1.)*(2. + h.x*2.5), .75, 6. + float(i)*11. + h.y*4.);
    vec3 q = p - c; q.xz *= rot((h.z-.5)*.6);
    float b = sdRBox(q, vec3(.95, .35, 2.3), .25);
    float cab = sdRBox(q - vec3(0., .55, -.1), vec3(.8, .35, 1.2), .3);
    float wheels = sdCylY((vec3(abs(q.x)-.9, q.y+.35, abs(q.z)-1.4)).yxz, .38, .2);
    float cd = min(smin(b, cab, .2), wheels);
    if(cd < d){ d = cd; kind = (h.x < .7 ? 1. : 2.) + (cab < b ? .5 : 0.); }
  }
  return d;
}

float map(vec3 p, out float m, out float id){
  float lot, side;
  float d = p.y; m = 0.; id = 0.;
  // sidewalks
  float sw = sdBox(vec3(abs(p.x) - 13., p.y - .075, p.z), vec3(3., .15, 1000.));
  if(sw < d){ d = sw; m = 1.; }
  float b = building(p, lot, side);
  if(b < d){ d = b; m = 2.; id = lot + side*.5; }
  float k; float c = car(p, k);
  if(c < d){ d = c; m = 3.; id = k; }
  // traffic light poles
  vec3 q = vec3(abs(p.x) - 10.3, p.y, mod(p.z, 27.) - 13.5);
  float pole = sdCylY(q - vec3(0,3.,0), .09, 3.);
  pole = min(pole, sdBox(q - vec3(-2.,5.9,0), vec3(2., .06, .06)));
  pole = min(pole, sdBox(q - vec3(-3.4,5.3,0), vec3(.22, .55, .22)));
  if(pole < d){ d = pole; m = 4.; }
  return d;
}
float map(vec3 p){ float m, id; return map(p, m, id); }
vec3 nrm(vec3 p){ vec2 e = vec2(.004,0); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }
float shadow(vec3 ro, vec3 rd){
  float r = 1., t = .05;
  for(int i=0;i<28;i++){ float h = map(ro+rd*t); r = min(r, 10.*h/t); t += clamp(h, .1, 3.); if(r < .01 || t > 60.) break; }
  return sat(r);
}
vec3 sky(vec3 rd){
  vec3 c = mix(vec3(.75,.85,.95), vec3(.25,.5,.9), pow(sat(rd.y), .6));
  c += vec3(1.,.9,.7)*pow(sat(dot(rd, SUN)), 200.)*20. + vec3(1.,.8,.6)*pow(sat(dot(rd,SUN)),6.)*.4;
  return c;
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  vec3 ro = vec3(-3. + t*2.2, 1.4 + .6*sin(t*1.3), -6. + t*3.);
  vec3 ta = ro + vec3(.2 - t*.25, -.05, 1.);
  vec3 rd = camRay(uv, ro, ta, .55 - t*.42, 1.0);
  float d = 0., m = 0., id = 0.;
  for(int i=0;i<110;i++){
    float h = map(ro + rd*d, m, id);
    if(abs(h) < .0008*d || d > 150.) break;
    d += h*.9;
  }
  vec3 col = sky(rd);
  // far skyline silhouettes in haze
  if(d >= 150.){
    float sk = 0.;
    float ax = atan(rd.x, rd.z);
    float hh = .08 + .25*pow(hash11(floor(ax*40.)), 3.) + .06*hash11(floor(ax*90.));
    if(rd.y < hh && abs(ax) < .6) col = mix(col, vec3(.55,.65,.78), .7);
  }
  if(d < 150.){
    vec3 p = ro + rd*d, n = nrm(p);
    vec3 alb = vec3(.3); float spec = .1; float glass = 0.;
    if(m == 0.){ // asphalt with lane markings and a crosswalk
      alb = vec3(.13,.13,.14)*(.7+.5*fbm3(p.xz*3.));
      float lane = smoothstep(.08,.05,abs(abs(p.x)-.15))*step(.5,fract(p.z*.1));
      float cw = step(abs(mod(p.z,27.)-13.5-4.), 1.6)*step(.5, fract(p.x*.55));
      alb = mix(alb, vec3(.8,.65,.2), lane*.9);
      alb = mix(alb, vec3(.75), cw*.8*step(abs(p.x),9.8));
    } else if(m == 1.){
      vec2 g = fract(p.xz*.5);
      alb = vec3(.45,.43,.4)*(.75+.25*step(.04, min(g.x,g.y)));
    } else if(m == 2.){
      float hb = hash11(floor(id)*7.3 + fract(id)*20.);
      alb = hb < .33 ? vec3(.45,.22,.14) : hb < .66 ? vec3(.62,.55,.45) : vec3(.18,.2,.22);
      alb *= .75 + .4*fbm3(p*1.3);
      // window glass lives in the recesses
      vec3 q = p; q.x = abs(q.x);
      float face = q.x - 10. - .6*hash11(floor(q.z/9.)*3.3+sign(p.x));
      glass = step(face,.3)*step(.02,face)*step(.5,abs(n.x));
      if(glass > .5){
        vec2 wc = floor(vec2(q.y/3.2, (mod(q.z,9.)+4.5)/1.8));
        float lit = step(.8, hash12(wc + floor(id)*13.));
        alb = vec3(.03,.035,.04) + vec3(1.,.7,.4)*lit*.25; spec = .6;
      }
      if(face < -.05) alb = vec3(.06,.05,.05);   // fire escapes: black iron
    } else if(m == 3.){
      alb = id < 2. ? vec3(1.,.72,.05) : vec3(.03);
      if(fract(id) > .1){ alb = vec3(.02,.03,.04); spec = .8; } else spec = .5;
    } else { alb = vec3(.1,.2,.12); }
    float sh = shadow(p + n*.02, SUN);
    float dif = sat(dot(n, SUN))*sh;
    float amb = .5 + .5*n.y;
    col = alb*(dif*vec3(1.,.93,.8)*3.4 + amb*vec3(.45,.55,.7)*1.1 + (1.-amb)*vec3(.35,.3,.25)*.6);
    vec3 r = reflect(rd, n);
    float fr = fresnel(n, rd, .04);
    col += sky(r)*fr*spec*(.4+.6*sh);
    col += vec3(1.,.9,.7)*pow(sat(dot(r,SUN)), 60.)*spec*sh*4.;
    col = mix(col, vec3(.7,.78,.88), 1.-exp(-d*.012));
  }
  // falling glass shards glinting in the sun
  for(int i=0;i<36;i++){
    vec3 h = hash31(float(i)*1.3+.5);
    vec3 sp = ro + vec3((h.x-.5)*8., mod(h.y*6. - t*(2.+h.z*3.), 6.) - 2., 1. + h.z*9.);
    vec3 nn = normalize(hash31(float(i)+floor(t*4.)) - .5);
    vec3 v = ro + rd*max(dot(sp-ro,rd),0.) - sp;
    float glint = pow(sat(dot(reflect(rd, nn), SUN)), 8.);
    col += vec3(.9,.97,1.)*(.00025 + glint*.004)/(dot(v,v)*1.5+.00015)*.3;
  }
  return col;
}
`;

// 9. Machine realm -- down a shaft of white conduits and cyan light.
export const machine = /* glsl */ `
float pipes(vec2 w, float x, float r, float sp){ float q = mod(w.x, sp) - sp*.5; return length(vec2(q, x)) - r; }

float map(vec3 p, out float m){
  m = 0.;
  vec2 bx = abs(p.xy) - vec2(6.,5.);
  float shell = -max(bx.x, bx.y);
  float d = shell;
  // pipe banks along z on each wall
  float pl = pipes(vec2(p.y, 0.), abs(p.x) - 5.2, .42, 1.05);
  float pc = pipes(vec2(p.x, 0.), abs(p.y) - 4.3, .3, .8);
  float pp = min(pl, pc);
  // collars every few metres
  float cz = mod(p.z, 4.) - 2.;
  float col = max(pp - .12, abs(cz) - .18);
  pp = min(pp, col);
  if(pp < d){ d = pp; m = 1.; }
  // cross braces and machinery blocks
  vec3 q = vec3(p.x, p.y, mod(p.z, 12.) - 6.);
  float brace = sdBox(q - vec3(0., 3.6, 0.), vec3(6., .25, .35));
  brace = min(brace, sdBox(vec3(abs(q.x)-4.3, q.y + .5, q.z), vec3(.6, 1.6, 1.2)));
  if(brace < d){ d = brace; m = 2.; }
  // diagonal big bend pipes
  vec3 b = vec3(abs(p.x) - 3.6, p.y + 3.2, mod(p.z, 9.) - 4.5);
  float bend = sdTorus(b.xzy, vec2(1.3, .38));
  if(bend < d){ d = bend; m = 1.; }
  return d;
}
float map(vec3 p){ float m; return map(p, m); }
vec3 nrm(vec3 p){ vec2 e = vec2(.004,0); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }
float ao(vec3 p, vec3 n){ float s=0., w=1.; for(int i=1;i<=4;i++){ float h=.15*float(i); s+=w*(h-map(p+n*h)); w*=.6; } return sat(1.-s*1.5); }

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  vec3 ro = vec3(1.5*sin(t*.9), .8*cos(t*1.1), t*11.);
  vec3 rd = camRay(uv, ro, ro + vec3(-.1, -.1, 1.), 1.9 - t*.45, .85);
  float d = 0., m = 0.;
  for(int i=0;i<100;i++){
    float h = map(ro + rd*d, m);
    if(h < .001*d || d > 80.) break;
    d += h*.9;
  }
  vec3 col = vec3(.85,.97,1.)*2.;
  float tm = min(d, 80.);
  if(d < 80.){
    vec3 p = ro + rd*d, n = nrm(p);
    float o = ao(p, n);
    vec3 alb = m == 1. ? vec3(.85,.88,.9) : m == 2. ? vec3(.45,.5,.55) : vec3(.25,.3,.33);
    // panel seams on the shell
    if(m == 0.){ vec2 g = fract(vec2(p.z*.25, (p.x+p.y)*.25)); alb *= .7 + .3*step(.03, min(g.x,g.y)); }
    vec3 key = normalize(vec3(.3, .6, 1.));
    float dif = sat(dot(n, key))*.6 + .4*(n.z*.5+.5);
    col = alb*(dif*1.4 + .3)*o*vec3(.9,.97,1.);
    vec3 r = reflect(rd, n);
    col += vec3(.7,.95,1.)*pow(sat(r.z), 12.)*(m == 1. ? 1.2 : .3)*o;
    // cyan emitters: strips in the shell and rings on some collars
    float strip = step(.92, fract(p.z*.125 + .5))*step(abs(n.z), .5);
    float ringE = step(.5, hash11(floor(p.z/4.)))*step(abs(mod(p.z,4.)-2.), .12)*step(.5, float(m == 1.));
    float panel = step(.7, hash12(floor(vec2(p.z*.5, p.x+p.y))))*step(abs(n.z), .5)*step(.5, float(m == 0.));
    col += vec3(.2,1.,.95)*(strip*2. + ringE*4. + panel*1.5);
    col = mix(col, vec3(.8,.95,1.)*1.2, 1.-exp(-d*.022));
  }
  // cyan haze from the emitters
  col += vec3(.1,.8,.8)*.18*(1.-exp(-tm*.05));
  // sparks / debris streaking past
  for(int i=0;i<24;i++){
    vec3 h = hash31(float(i)*2.3);
    vec3 sp = vec3((h.x-.5)*8., (h.y-.5)*6., ro.z + mod(h.z*30. - t*20., 30.));
    vec3 v = ro + rd*max(dot(sp-ro,rd),0.) - sp;
    col += vec3(.7,1.,1.)*.0008/(dot(v.xy,v.xy)+.0002)*step(0.,dot(sp-ro,rd));
  }
  return col;
}
`;

// 10. Boneyard -- flying through the rib cage of something colossal.
export const boneyard = /* glsl */ `
float bone(vec3 p){
  // ribs: arcs hanging from a spine at y = 9
  float cz = floor(p.z/3.2);
  vec3 q = vec3(p.x, p.y - 9., mod(p.z, 3.2) - 1.6);
  float h = hash11(cz);
  q.z += .25*sin(q.y*.3 + h*6.);
  float R = 7.5 + h;
  vec2 arc = vec2(length(q.xy) - R, q.z);
  float r = .28 + .12*smoothstep(0.,-8.,q.y);
  float rib = length(arc) - r;
  rib = max(rib, q.y + 1.);                   // only the lower half
  rib = max(rib, -(q.y + 8.5 - 2.*abs(q.x)*.1));
  // spine
  vec3 s = vec3(p.x, p.y - 9.5, mod(p.z, 1.) - .5);
  float vert = sdRBox(s, vec3(.7, .6, .35), .15);
  vert = min(vert, sdBox(s - vec3(0, .9, 0), vec3(.12, .6, .1)));
  return min(rib, vert);
}

float map(vec3 p, out float m){
  m = 0.;
  float g = p.y + .8*fbm3(p.xz*.3) + .3*noise(p.xz*2.);
  float b = bone(p);
  vec2 bc = floor(p.xz/3.);
  vec2 bq = mod(p.xz, 3.) - 1.5;
  vec2 bh = hash22(bc);
  vec3 lb = vec3(bq.x, p.y + .1, bq.y);
  lb.xz *= rot(bh.x*6.28);
  float fallen = sdCapsule(lb, vec3(-1.,0.,0.), vec3(1.,.2,0.), .09 + .08*bh.y);
  fallen = min(fallen, length(lb - vec3(1.,.2,0.)) - .2 - .1*bh.y);
  if(bh.y < .45) fallen = 2.;
  b = min(b, fallen);
  if(b < g){ m = 1.; return b; }
  return g;
}
float map(vec3 p){ float m; return map(p, m); }
vec3 nrm(vec3 p){ vec2 e = vec2(.01,0); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }

vec3 firePos(int i){
  vec3 h = hash31(float(i)*7.7);
  return vec3((h.x-.5)*14., .6, float(i)*4.5 + h.y*3.);
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  vec3 ro = vec3(3.*sin(t*.9), 3.6 + 1.2*sin(t*.7), t*8.5);
  vec3 rd = camRay(uv, ro, ro + vec3(.35*cos(t*.9), -.12, 1.), -.6 + .5*sin(t*.8), 1.05);
  float d = 0., m = 0.;
  for(int i=0;i<100;i++){
    float h = map(ro + rd*d, m);
    if(h < .001*d || d > 70.) break;
    d += h*.8;
  }
  float tm = min(d, 70.);
  vec3 col = vec3(.25,.07,.02);
  vec3 haze = mix(vec3(.35,.1,.03), vec3(.8,.35,.1), sat(rd.y*2.+.3));
  if(d < 70.){
    vec3 p = ro + rd*d, n = nrm(p);
    vec3 alb = m == 1. ? vec3(.55,.45,.35)*(.6+.5*fbm3(p*4.)) : vec3(.12,.07,.04)*(.6+.8*fbm3(p.xz*4.));
    if(m == 0.) alb = mix(alb, vec3(.35,.25,.08), smoothstep(.55,.7,noise(p.xz*9.))); // dry grass
    vec3 lc = vec3(0);
    for(int i=0;i<10;i++){
      vec3 fp = firePos(i); fp.z += floor(ro.z/45.)*45.;
      vec3 l = fp - p; float ll = length(l);
      float fl = .75 + .25*noise(vec2(t*7., float(i)));
      lc += vec3(1.,.45,.12)*fl*sat(dot(n, l/ll))*6./(ll*ll + 1.);
    }
    col = alb*(lc + vec3(.6,.25,.08)*(n.y*.5+.5)*.5);
    col = mix(col, haze, 1.-exp(-d*.035));
  } else col = haze;
  // fires: glowing volumes on the ground
  for(int i=0;i<10;i++){
    vec3 fp = firePos(i); fp.z += floor(ro.z/45.)*45.;
    float g = fogLight(ro, rd, fp, tm);
    col += vec3(1.,.45,.12)*g*.08*(.75 + .25*noise(vec2(t*7., float(i))));
    vec3 v = ro + rd*clamp(dot(fp-ro,rd),0.,tm) - fp;
    float flame = sat(1. - length(v*vec3(1.,.55,1.))/.8)*step(-.3, v.y);
    col += blackbody(flame*(.7+.3*noise(vec2(v.y*4.-t*9., float(i)))))*1.5;
  }
  // embers rising
  for(int i=0;i<40;i++){
    vec3 h = hash31(float(i)*1.9);
    vec3 ep = vec3((h.x-.5)*10., mod(h.y*10. + t*(1.+h.z*1.5), 10.), ro.z + 2. + h.z*16.);
    ep.x += sin(t*2.+h.y*9.)*.4;
    vec3 v = ro + rd*max(dot(ep-ro,rd),0.) - ep;
    col += vec3(1.,.55,.15)*.0012/(dot(v,v)+.0003)*step(dot(ep-ro,rd), tm);
  }
  return col;
}
`;

// 11. Primeval -- plunging down a mossy cliff into sunlit rainforest.
export const jungle = /* glsl */ `
const vec3 SUN = normalize(vec3(-.5, .9, .4));

float cliff(vec3 p){
  return (p.x + 3.5 + 2.5*fbm3(p*.12) + .9*fbm3(p*.5) + .25*noise(p*2.))*.7;
}
float trunks(vec3 p){
  vec2 c = floor(p.xz/10.);
  vec2 q = mod(p.xz, 10.) - 5.;
  vec2 h = hash22(c);
  q -= (h-.5)*4.;
  float r = 1. + 1.4*h.x + .2*noise(vec2(atan(q.y,q.x)*4., p.y*.4));
  float d = length(q) - r - smoothstep(4.,0.,p.y)*1.5;   // flared roots
  return max(d, 4. - p.x);                                  // keep clear of the cliff
}
float clumps(vec3 p){
  vec3 c = floor(p/4.);
  vec3 q = mod(p, 4.) - 2.;
  vec3 h = hash33(c);
  q -= (h-.5)*1.5;
  float d = length(q*vec3(1.,1.4,1.)) - (.8 + h.x*.9);
  d += .6*(fbm3(p*1.8) - .5);
  return (h.y < .4) ? 2. : d;
}
float map(vec3 p, out float m){
  float c = cliff(p);
  float tr = trunks(p);
  float gr = p.y + .8*fbm3(p.xz*.3);
  float cl = clumps(p) + max(p.x + .5, 0.)*.6 + max(-p.x - 5.,0.);   // plants hug the cliff
  float cl2 = clumps(p*1.3 + 5.)/1.3 + max(p.y - 2., 0.);           // undergrowth
  cl = min(cl, cl2);
  float d = c; m = 0.;
  if(tr < d){ d = tr; m = 1.; }
  if(cl < d){ d = cl; m = 2.; }
  if(gr < d){ d = gr; m = 3.; }
  return d;
}
float map(vec3 p){ float m; return map(p, m); }
vec3 nrm(vec3 p){ vec2 e = vec2(.01,0); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  vec3 ro = vec3(.5 + t*.4, 22. - t*6.5, t*4.);
  vec3 rd = camRay(uv, ro, ro + vec3(.6, -.55, .8), 2.5 + t*.3, 1.0);
  float d = 0., m = 0.;
  for(int i=0;i<100;i++){
    float h = map(ro + rd*d, m);
    if(h < .002*d || d > 70.) break;
    d += h*.8;
  }
  vec3 sky = mix(vec3(.5,.65,.45), vec3(1.,1.,.9), sat(rd.y));
  vec3 col = sky;
  float tm = min(d, 70.);
  if(d < 70.){
    vec3 p = ro + rd*d, n = nrm(p);
    vec4 lv = voronoi(p.yz*3. + p.x);             // leaf cells
    float leafV = hash12(lv.zw);
    vec3 alb;
    if(m == 0.){
      alb = mix(vec3(.3,.25,.18), vec3(.12,.28,.06), smoothstep(.3,.6,fbm3(p*.8)));  // rock & moss
      alb *= .7 + .5*fbm3(p*6.);
    } else if(m == 1.){
      alb = vec3(.25,.18,.12)*(.5+.7*fbm3(vec3(p.xz*2., p.y*.3)));
      alb = mix(alb, vec3(.14,.28,.07), smoothstep(.45,.7,fbm3(p*1.5)));
    } else if(m == 2.){
      alb = mix(vec3(.06,.2,.03), vec3(.35,.55,.08), leafV)*(.6 + .6*smoothstep(.0,.15,lv.y));
    } else {
      alb = mix(vec3(.1,.08,.04), vec3(.12,.28,.05), smoothstep(.3,.6,fbm3(p.xz*2.)));
    }
    float dapple = smoothstep(.3,.7,noise(p.yz*.35 + p.x*.2));
    float dif = sat(dot(n, SUN))*(.35 + .9*dapple);
    float trans = m == 2. ? pow(sat(dot(rd, SUN)), 2.)*1.2 : 0.;
    col = alb*(dif*vec3(1.,.95,.75)*3.2 + vec3(.3,.45,.3)*(n.y*.3+.7)*1.) + alb*vec3(.9,1.,.3)*trans;
    if(m == 2.) col += vec3(.9,1.,.7)*pow(sat(dot(reflect(rd,n), SUN)), 16.)*.6*dapple;   // waxy leaf glint
    col = mix(col, vec3(.35,.5,.3), 1.-exp(-d*.02));
  }
  // sunbeams
  float sh = 0.;
  float j = hash12(fc + fract(t)*13.);
  for(int i=0;i<12;i++){
    float s = (float(i)+j)/12.*min(tm, 30.);
    vec3 q = ro + rd*s;
    vec2 pr = q.xz - SUN.xz/SUN.y*q.y;
    sh += smoothstep(.6,.8,noise(pr*.2));
  }
  col += vec3(1.,.95,.7)*sh/12.*min(tm,30.)*.022;
  col += vec3(1.,.95,.8)*pow(sat(dot(rd, SUN)), 30.)*3.;
  for(int i=0;i<25;i++){
    vec3 h = hash31(float(i)*2.9);
    vec3 sp = ro + vec3((h.x-.5)*6., (h.y-.5)*6. + mod(t*8., 6.), 2. + h.z*6.);
    vec3 v = ro + rd*max(dot(sp-ro,rd),0.) - sp;
    col += vec3(1.,1.,.8)*.0003/(dot(v,v)+.0001);
  }
  col += vec3(.7,.85,1.)*smoothstep(1.5, 2.1, t)*3.;
  return col;
}
`;
