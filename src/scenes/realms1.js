// Realms 2-6: hall of giants, deep space, silk, crystal, the fall.

// 2. Hall of Giants -- carved colossi with glowing eyes above a river of fire.
export const firehall = /* glsl */ `
float statue(vec3 q){
  // q: local space, x points *into* the wall, figure faces -x
  float body = sdRBox(q-vec3(0.,1.8,0.), vec3(1.1,2.2,1.2), .45);
  float sh = sdEllipsoid(q-vec3(0.,3.9,0.), vec3(1.2,.8,1.7));
  body = smin(body, sh, .5);
  float head = sdRBox(q-vec3(-.25,5.3,0.), vec3(.9,1.1,.85), .35);
  float brow = sdBox(q-vec3(-.8,5.45,0.), vec3(.25,.12,.7));
  head = smin(head, brow, .15);
  float crown = sdBox(q-vec3(-.1,6.4,0.), vec3(.8,.3,.85));
  crown = min(crown, sdBox(q-vec3(-.1,6.9,0.), vec3(.45,.35,.5)));
  head = min(head, crown);
  // eye sockets
  vec3 e = q-vec3(-1.12,5.25,0.); e.z = abs(e.z)-.36;
  head = smax(head, -(length(e)-.17), .05);
  float d = min(body, head);
  // folded arms / knees
  d = smin(d, sdCapsule(q, vec3(-1.,2.8,-.9), vec3(-1.3,1.6,.2), .35), .3);
  d = smin(d, sdCapsule(q, vec3(-1.,2.8, .9), vec3(-1.3,1.6,-.2), .35), .3);
  return d;
}

float map(vec3 p){
  vec3 q = p;
  float side = sign(q.x);
  q.x = abs(q.x) - 4.6;
  float cell = floor(q.z/6.);
  q.z = mod(q.z, 6.) - 3.;
  float st = statue(q*vec3(-1.,1.,1.)*vec3(-1,1,1) + vec3(0.,.2*hash11(cell+side*7.),0.));
  float wall = 6.4 - abs(p.x) + .5*noise(p*.6);
  float floor_ = p.y + 1.5 + .4*noise(p.xz*.5);
  float roof = 11. - p.y + .8*noise(p.xz*.3);
  float d = min(min(st, wall), min(floor_, roof));
  d += .06*noise(p*3.);
  return d;
}
vec3 nrm(vec3 p){ vec2 e = vec2(.01,0); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }

vec3 eyeGlow(vec3 ro, vec3 rd, float tmax, float t){
  vec3 c = vec3(0);
  float z0 = floor(ro.z/6.)*6.;
  for(int k=0;k<6;k++){
    float z = z0 + float(k)*6. + 3.;
    for(int s=0;s<2;s++){
      float side = s==0 ? -1. : 1.;
      for(int e=0;e<2;e++){
        vec3 lp = vec3(side*(4.6-1.1), 5.25 + .2*hash11(floor(z/6.)+side*7.), z + (float(e)-.5)*.72);
        float g = fogLight(ro, rd, lp, tmax);
        vec3 q = ro + rd*clamp(dot(lp-ro,rd),0.,tmax) - lp;
        float core = .0015/(dot(q,q)+.0004);
        c += vec3(.35,.9,1.)*(g*.01 + core*2.);
      }
    }
  }
  return c;
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  vec3 ro = vec3(.6*sin(t*1.3), 4.3 + .3*sin(t*2.), 2. + t*7.5);
  vec3 ta = ro + vec3(.3*sin(t), .2, 4.);
  vec3 rd = camRay(uv, ro, ta, -.38 + .12*sin(t*1.7), 1.1);

  float d = 0.;
  for(int i=0;i<90;i++){
    float h = map(ro+rd*d);
    if(h < .002*d || d > 45.) break;
    d += h*.85;
  }
  vec3 col = vec3(0);
  vec3 p = ro + rd*d;
  if(d < 45.){
    vec3 n = nrm(p);
    vec3 alb = mix(vec3(.25,.2,.18), vec3(.4,.28,.2), fbm3(p*1.5))*(.5+.5*fbm3(p*7.));
    // fire light from below, flickering
    // carved horizontal bands on the colossi
    alb *= .75 + .25*smoothstep(.1,.2,abs(fract(p.y*1.5)-.5));
    float fl = .8 + .2*noise(vec2(t*6., p.z*.2));
    for(int k=0;k<6;k++){
      float lz = floor(ro.z/5.)*5. + float(k)*5. + 2.5;
      for(int s=0;s<2;s++){
        vec3 lp = vec3((float(s)*2.-1.)*2.2, -.6, lz);
        vec3 l = lp - p; float ll = length(l);
        col += alb*vec3(1.,.45,.13)*sat(dot(n,l/ll)*.8+.2)*16.*fl/(ll*ll+2.);
      }
    }
    col += alb*vec3(.12,.18,.3)*(n.y*.5+.5)*.25;
    // eye rim light
    vec3 zc = vec3(sign(p.x)*3.7, 5.2, floor(p.z/6.)*6.+3.);
    float el = exp(-length(p-zc)*.8);
    col += alb*vec3(.3,.9,1.)*el*1.5*sat(dot(n, normalize(zc-p))+.2);
  }
  float tm = min(d, 45.);
  // fog
  col = mix(col, vec3(.12,.05,.03), 1.-exp(-tm*.02));

  // volumetric fire & smoke river along the floor
  float T = 1.;
  vec3 acc = vec3(0);
  float stp = .45;
  float j = hash12(fc + fract(t)*97.)*stp;
  for(int i=0;i<34;i++){
    float s = j + float(i)*stp*(1. + float(i)*.06);
    if(s > tm) break;
    vec3 q = ro + rd*s;
    float h = q.y + 1.2;
    if(h > 2.4) continue;
    vec3 w = q*vec3(.45,.6,.45) - vec3(0., t*1.6, t*.6);
    float n = fbm3(w + fbm3(w*1.7)*.8);
    float dens = sat((n - .35 - h*.12)*2.2)*smoothstep(2.4, .2, h);
    if(dens > .001){
      float temp = sat(1.1 - h*.38)*sat(n*1.4-.2);
      vec3 fire = blackbody(temp*.9)*.9;
      vec3 smoke = mix(vec3(1.,.55,.28), vec3(.95,.85,.8), sat(h*.35))*(.35 + .9*sat(1.2-h*.3));
      vec3 e = mix(smoke*.9, fire, smoothstep(.35,.7,temp));
      float a = dens*stp*.8;
      acc += T*e*a*2.;
      T *= exp(-a*1.5);
      if(T < .02) break;
    }
  }
  col = col*T + acc;
  col += eyeGlow(ro, rd, tm, t);
  // embers
  for(int i=0;i<20;i++){
    vec3 h = hash31(float(i)*2.7);
    vec3 ep = vec3((h.x-.5)*8., mod(h.y*8. + t*(2.+h.z*2.), 8.) - 1., ro.z + 3. + h.z*14.);
    vec3 q = ro + rd*max(dot(ep-ro,rd),0.) - ep;
    col += vec3(1.,.5,.15)*.0015/(dot(q,q)+.0004)*step(dot(ep-ro,rd), tm);
  }
  return col;
}
`;

// 3. Deep space -- a crackling starburst over a planet's night side.
export const cosmos = /* glsl */ `
vec3 stars(vec3 rd){
  vec3 c = vec3(0);
  for(int i=0;i<3;i++){
    float sc = 90. + float(i)*110.;
    vec3 q = rd*sc; vec3 id = floor(q); vec3 f = fract(q)-.5;
    vec3 h = hash33(id + float(i)*17.);
    float s = step(.93, h.x);
    float d = length(f - (h-.5)*.6);
    c += s*mix(vec3(.6,.75,1.), vec3(1.,.85,.7), h.y)*.012/(d*d*sc*.06+.0015)*h.z;
  }
  return c;
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  vec3 ro = vec3(0., 0., t*3.);
  float roll = -.25 - t*.35;
  vec3 rd = camRay(uv, ro, ro + vec3(-.35 + t*.05, .05, 1.), roll, 1.2);

  // nebula + stars
  vec3 col = stars(rd);
  float neb = fbm(rd.xy*3. + rd.z*2.);
  col += vec3(.05,.08,.25)*neb*neb*1.5 + vec3(.2,.03,.12)*pow(fbm(rd.yz*4.+3.),3.)*1.5;

  // starburst with electric filaments
  vec3 bd = normalize(vec3(-.55, .12, 1.));
  vec3 bx = normalize(cross(bd, vec3(0,1,0))), by = cross(bx, bd);
  vec2 q = vec2(dot(rd,bx), dot(rd,by))/max(dot(rd,bd), .05);
  float r = length(q), a = atan(q.y, q.x);
  float fil = 0.;
  for(int i=0;i<3;i++){
    float fi = float(i);
    float na = noise(vec2(a*(12.+fi*9.) + fi*7., r*3. - t*(2.+fi)));
    fil += pow(na, 12.+fi*4.)*1.4;
  }
  fil *= exp(-r*2.2);
  vec3 sb = vec3(.35,.6,1.)*(fil*1.3 + .003/(r*r+.0015)) + vec3(.9,.95,1.)*.0006/(r*r+.00015);
  // crawling bolts out of the burst
  for(int i=0;i<7;i++){
    float fi = float(i);
    float an = fi*.9 + hash11(fi)*.6 + t*.2;
    vec2 e = vec2(cos(an), sin(an))*(.9 + .8*hash11(fi*3.+floor(t*5.)));
    sb += vec3(.45,.7,1.)*bolt(q, vec2(0), e, fi + floor(t*8.)*.1, t, .0025)*.45;
  }
  col += sb;

  // the planet: night side with thin blue atmosphere
  vec3 pc = vec3(30., -95., 70.); float pr = 95.;
  vec3 oc = ro - pc;
  float b = dot(oc, rd), c = dot(oc,oc) - pr*pr, h = b*b - c;
  float closest = length(oc - rd*dot(oc,rd)*(dot(oc,rd)<0.?1.:0.)) ;
  vec3 cp = ro + rd*max(-b,0.) - pc;
  float alt = length(cp) - pr;
  if(h > 0.){
    float tp = -b - sqrt(h);
    vec3 pp = ro + rd*tp, n = normalize(pp-pc);
    vec3 sun = normalize(vec3(-.6,.8,.3));
    float day = sat(dot(n, sun)*1.5+.15);
    float cl = fbm(n.xz*14. + n.y*3.);
    vec3 surf = mix(vec3(.01,.02,.05), vec3(.05,.12,.3), cl)*day + vec3(1.,.6,.2)*step(.62, fbm(n.xz*40.))*.25*(1.-day);
    col = surf + vec3(.2,.45,1.)*pow(1.-sat(dot(n,-rd)), 4.)*1.5;
  }
  // atmospheric limb glow
  col += vec3(.25,.5,1.)*exp(-max(alt,0.)*.9)*1.2*step(0.,-b)*step(h,0.);

  // tumbling rock debris flying past
  for(int i=0;i<10;i++){
    float fi = float(i);
    vec3 hh = hash31(fi*5.3);
    vec3 sp = vec3((hh.x-.5)*6., (hh.y-.5)*3., mod(hh.z*20. - t*6., 20.) + ro.z);
    float sr = .15 + .25*hh.x;
    vec3 o2 = ro - sp; float b2 = dot(o2, rd), c2 = dot(o2,o2) - sr*sr, h2 = b2*b2 - c2;
    if(h2 > 0.){
      vec3 pp = ro + rd*(-b2-sqrt(h2)); vec3 n = normalize(pp-sp + (noise((pp-sp)*6.)-.5)*.4);
      float dif = sat(dot(n, normalize(vec3(-.5,.2,1.))))*.8;
      col = vec3(.05,.06,.08)*(.3+dif) + vec3(.3,.55,1.)*dif*.6;
    }
  }
  return col;
}
`;

// 4. Silk realm -- falling through endless translucent magenta fabric.
export const silk = /* glsl */ `
float sheet(vec3 p, float t, out float id){
  float f = p.y + 1.3*sin(p.x*.45 + sin(p.z*.3 + t*.8)*1.5) + .9*sin(p.z*.55 + p.x*.25 - t*.6)
          + .4*sin(p.x*1.3 + p.z*.9 + t);
  id = floor(f/3.);
  return (mod(f, 3.) - 1.5)*.45;
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  vec3 ro = vec3(sin(t*.7)*2., cos(t*.5)*1.5, t*9.);
  vec3 rd = camRay(uv, ro, ro + vec3(.3*sin(t*1.1), -.2, 1.), .6*sin(t*.8) + t*.5, 1.05);
  vec3 L = normalize(vec3(.4, .25, 1.));
  vec3 acc = vec3(0); float T = 1.;
  float s = hash12(fc)*.1;
  for(int i=0;i<72;i++){
    vec3 p = ro + rd*s;
    float id;
    float d = sheet(p, t, id);
    float ad = abs(d);
    float dens = exp(-ad*28.);
    float h = hash11(id*3.7);
    vec3 base = mix(vec3(1.,.12,.45), vec3(.65,.1,1.), h);
    base = mix(base, vec3(1.,.55,.3), smoothstep(.6,1.,h)*.8);
    // translucency: fabric glows when the light is behind it
    float back = pow(sat(dot(rd, L)), 3.);
    float fold = .5 + .5*sin(p.x*3. + p.z*2. + id);
    base *= mix(.25, 1., step(.3, fract(h*7.)));
    vec3 e = base*(.08 + 2.2*back*back + .7*fold*fold*fold);
    float a = dens*.16;
    acc += T*e*a;
    T *= 1. - a;
    if(T < .02 || s > 40.) break;
    s += max(ad*.5, .04);
  }
  // hot light behind the folds
  float sunG = pow(sat(dot(rd, L)), 12.);
  vec3 bg = vec3(1.,.55,.35)*sunG*5. + vec3(.5,.05,.25)*.25;
  return acc + T*bg;
}
`;

// 5. Crystal realm -- a cathedral of glacial shards.
export const crystal = /* glsl */ `
float sdHex(vec3 p, vec2 h){
  const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
  p = abs(p);
  p.xy -= 2.0*min(dot(k.xy, p.xy), 0.0)*k.xy;
  vec2 d = vec2(length(p.xy-vec2(clamp(p.x,-k.z*h.x,k.z*h.x), h.x))*sign(p.y-h.x), p.z-h.y);
  return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}
float map(vec3 p){
  vec3 c = floor(p/6.);
  vec3 q = mod(p, 6.) - 3.;
  vec3 h = hash33(c);
  q -= (h-.5)*1.4;
  q.xy *= rot(h.x*TAU); q.yz *= rot(h.y*TAU);
  float len = 1.2 + 1.2*h.z;
  float d = sdHex(q, vec2(.35 + .35*h.y, len));
  // pointed tips
  d = max(d, dot(abs(q), normalize(vec3(.0,.0,1.))) - len + .1 - .0*q.x);
  d = max(d, abs(q.z) + length(q.xy)*1.6 - len - .2);
  if(h.x < .18) d = 1.5;
  // a floor/ceiling of massive columns
  return min(d, 2.);
}
vec3 nrm(vec3 p){ vec2 e = vec2(.004,0); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }

vec3 env(vec3 rd, vec3 L){
  float s = sat(dot(rd, L));
  vec3 c = mix(vec3(.0,.04,.08), vec3(.1,.55,.8), pow(s, 3.));
  c += vec3(.9,1.,1.)*pow(s, 40.)*5.;
  c += vec3(.1,.4,.6)*pow(fbm(rd.xy*4.),2.)*.3;
  return c;
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  vec3 ro = vec3(3.+sin(t*.6), 3.2, t*7.);
  vec3 rd = camRay(uv, ro, ro + vec3(.2, .15, 1.), 2.6 + t*.35, 1.1);
  vec3 L = normalize(vec3(.3, .6, 1.));
  vec3 col = vec3(0); vec3 thr = vec3(1);
  float d = .1;
  vec3 glow = vec3(0);
  for(int i=0;i<90;i++){
    vec3 p = ro + rd*d;
    float h = map(p);
    glow += vec3(.2,.7,1.)*.004/(abs(h)+.05)*exp(-d*.05);
    if(h < .002 || d > 40.) break;
    d += h*.7;
  }
  vec3 bg = env(rd, L);
  if(d < 40.){
    vec3 p = ro + rd*d, n = nrm(p);
    float fr = fresnel(n, rd, .06);
    vec3 refl = env(reflect(rd,n), L);
    vec3 rfr = refract(rd, n, 1./1.31);
    // fake thickness: internal glow driven by how grazing the refracted ray is
    float th = sat(1. - abs(dot(rfr, n)));
    vec3 inner = env(rfr, L)*vec3(.2,.7,.9)*(.4 + 1.*th) + vec3(0.,.05,.08);
    inner += vec3(.3,.9,1.)*pow(1.-abs(dot(n,rd)), 4.)*1.2;
    col = mix(inner, refl*1.3, fr);
    // crisp edge highlights
    col = mix(col, bg*.7, 1.-exp(-d*.035));
  } else col = bg;
  col += glow*.2;
  // floating ice dust
  for(int i=0;i<25;i++){
    vec3 h = hash31(float(i)*1.7);
    vec3 sp = vec3((h.xy-.5)*5., mod(h.z*12. - t*8., 12.)) + vec3(ro.xy, ro.z);
    vec3 q = ro + rd*max(dot(sp-ro,rd),0.) - sp;
    col += vec3(.7,.95,1.)*.0006/(dot(q,q)+.0001);
  }
  return col;
}
`;

// 6. The fall -- down a banded sandstone canyon towards a blinding light.
export const canyon = /* glsl */ `
const vec3 SUN = normalize(vec3(-.6, .75, .3));
float strata(float y){ return y + .6*sin(y*.21) ; }
float map(vec3 p){
  float cx = 3.*sin(p.z*.04) + 1.5*sin(p.z*.11);
  float w = 8.5 + 3.*sin(p.z*.07 + 1.) - .05*min(p.y, 0.);
  float x = abs(p.x - cx);
  float wall = w - x;
  wall += 2.2*fbm3(vec3(p.x*.1, p.y*.35, p.z*.08));
  // ledges: layered sandstone shelves stepping out of the wall
  float ly = strata(p.y)*.55;
  wall += .9*smoothstep(.55,.85,fract(ly + .3*noise(p.xz*.15)));
  wall += .25*noise(p*1.1);
  float floor_ = p.y + 70.;
  return min(wall*.6, floor_);
}
vec3 nrm(vec3 p){ vec2 e = vec2(.03,0); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }
float shadow(vec3 ro, vec3 rd){
  float r = 1., t = .3;
  for(int i=0;i<20;i++){ float h = map(ro+rd*t); r = min(r, 6.*h/t); t += clamp(h, .4, 4.); if(r < .02 || t > 50.) break; }
  return sat(r);
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  float z = t*14.;
  float cx = 3.*sin(z*.04) + 1.5*sin(z*.11);
  vec3 ro = vec3(cx, 4. - t*12., z);
  float cz = 3.*sin((z+10.)*.04) + 1.5*sin((z+10.)*.11);
  vec3 ta = vec3(cz, -6. - t*12., z + 10.);
  vec3 rd = camRay(uv, ro, ta, .35 + t*.35, .9);
  float d = 0.;
  for(int i=0;i<100;i++){
    float h = map(ro + rd*d);
    if(h < .002*d || d > 120.) break;
    d += h;
  }
  vec3 sky = mix(vec3(1.,.8,.55), vec3(.55,.75,1.), sat(rd.y));
  vec3 col = sky*1.3;
  if(d < 120.){
    vec3 p = ro + rd*d, n = nrm(p);
    // banded sandstone: cream, orange, rust, deep red
    float b = fract(strata(p.y)*.18 + .15*fbm3(p.xz*.05));
    vec3 rock = mix(vec3(.85,.62,.4), vec3(.8,.38,.14), smoothstep(.1,.35,b));
    rock = mix(rock, vec3(.55,.2,.08), smoothstep(.45,.7,b));
    rock = mix(rock, vec3(.9,.7,.5), smoothstep(.8,.95,b));
    rock *= .75 + .4*fbm3(p*vec3(.8,2.,.8));
    float moss = smoothstep(.55,.85,n.y + .3*fbm3(p*1.5))*step(-60., p.y);
    vec3 alb = mix(rock, vec3(.18,.32,.08)*(.6+.6*fbm3(p*4.)), moss*.85);
    if(p.y < -69.){ alb = vec3(.1,.25,.28); }                                   // river
    float sh = shadow(p + n*.05, SUN);
    float dif = sat(dot(n, SUN))*sh;
    float bounce = sat(-n.y*.5+.5);
    // slot-canyon glow: sunlight bouncing between the walls
    col = alb*(dif*vec3(1.,.85,.6)*3.2 + vec3(1.,.55,.28)*(.55 + .35*bounce) + vec3(.3,.4,.55)*sat(n.y)*.4);
    col = mix(col, vec3(1.,.75,.5), 1.-exp(-d*.01));
  }
  // light at the end of the canyon
  float burst = smoothstep(.55, 1.2, t);
  vec3 bd = normalize(ta-ro);
  col += vec3(.8,1.,.95)*(pow(sat(dot(rd, bd)), 30.)*8. + pow(sat(dot(rd,bd)),4.)*1.5)*burst;
  return col;
}
`;
