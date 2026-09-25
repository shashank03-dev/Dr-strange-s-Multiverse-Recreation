// Realms 12-17: ink city, incursion, block realm, paint, old world, glass city.

// 12. Ink realm -- a cel-shaded comic-book city, turned on its side.
export const toon = /* glsl */ `
const vec3 SUN = normalize(vec3(.5, .8, -.3));
float map(vec3 p, out float m){
  vec3 q = p; q.x = abs(q.x);
  float lot = floor(q.z/10.);
  float lz = mod(q.z, 10.) - 5.;
  float h = 12. + 30.*hash11(lot*2.1 + sign(p.x)*5.);
  float b = sdBox(vec3(q.x - 16., q.y - h*.5, lz), vec3(6., h*.5, 4.7));
  float fy = mod(q.y, 3.) - 1.5, fz = mod(lz, 2.) - 1.;
  float win = sdBox2(vec2(fy, fz), vec2(.8, .55));
  b = max(b, -max(max(10.3 - q.x, q.x - 10.6), win));      // punched windows
  float ledge = sdBox(vec3(q.x - 10., mod(q.y, 3.) - .1, lz), vec3(.3, .1, 4.8));
  b = min(b, max(ledge, q.y - h));
  float g = p.y;
  // a giant green billboard slab tilted into the street
  vec3 s = p - vec3(-6., 9., 26.);
  s.xy *= rot(.5); s.xz *= rot(.3);
  float slab = sdBox(s, vec3(.4, 8., 6.));
  // taxi
  vec3 c = p - vec3(2.5, .8, 16.);
  float taxi = min(sdRBox(c, vec3(1., .4, 2.2), .2), sdRBox(c - vec3(0,.6,0), vec3(.8,.35,1.2), .25));
  float d = g; m = 0.;
  if(b < d){ d = b; m = 1. + step(.5, hash11(lot*7.+sign(p.x))); }
  if(slab < d){ d = slab; m = 3.; }
  if(taxi < d){ d = taxi; m = 4.; }
  return d;
}
float map(vec3 p){ float m; return map(p, m); }
vec3 nrm(vec3 p){ const vec2 k = vec2(1., -1.); const float h = .01;   // tetrahedral: 4 taps
  return normalize(k.xyy*map(p + k.xyy*h) + k.yyx*map(p + k.yyx*h) + k.yxy*map(p + k.yxy*h) + k.xxx*map(p + k.xxx*h)); }

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  vec3 ro = vec3(-1.5 + t*.6, 13. - t*1.5, t*6.);
  vec3 rd = camRay(uv, ro, ro + vec3(.1, -.42, 1.), 1.5708 + .12*sin(t*1.3) - t*.08, .85);
  float d = 0., m = 0., prevH = 1e9, edge = 0.;
  float px = 1.6/uRes.y;
  for(int i=0;i<110;i++){
    float h = map(ro + rd*d, m);
    // silhouette ink: the ray grazed a surface and moved on
    if(h > prevH && prevH < px*d*2.2 && h > .02) edge = 1.;
    if(h < .0015*d || d > 120.) break;
    prevH = h;
    d += h*.9;
  }
  vec3 col = vec3(.85,.9,.97);
  col = mix(col, vec3(.35,.6,.95), smoothstep(.0,.5,rd.y));
  // comic speed-lines in the sky
  col = mix(col, vec3(1.), .5*step(.93, fract(atan(uv.y,uv.x)*14.))*smoothstep(.2,.9,length(uv)));
  if(d < 120.){
    vec3 p = ro + rd*d, n = nrm(p);
    vec3 alb = m == 0. ? vec3(.55,.56,.6) : m == 1. ? vec3(.86,.86,.9) : m == 2. ? vec3(.8,.45,.35) : m == 3. ? vec3(.1,.85,.2) : vec3(1.,.8,.1);
    if(m == 0.){ alb = mix(alb, vec3(.95), step(abs(p.x), .2)*step(.5, fract(p.z*.1))); }
    float dif = sat(dot(n, SUN));
    float band = dif > .6 ? 1. : dif > .2 ? .72 : .45;
    col = alb*band*vec3(1.,.98,.95) + vec3(.05,.08,.18)*(1.-band);
    // blue ben-day halftone in the shadows
    vec2 hp = fc/uRes.y*120.; hp *= rot(.785);
    float dots = smoothstep(.35, .3, length(fract(hp) - .5));
    col = mix(col, col*vec3(.55,.65,1.), dots*(1.-band)*1.2);
    // windows are drawn as flat dark-blue panes
    vec3 q = p; q.x = abs(q.x);
    if((m == 1. || m == 2.) && q.x > 10.25) col = vec3(.25,.4,.7)*(.7 + .3*step(.5, fract((q.y+q.z)*.5)));
    // crease ink from normal discontinuities
    float crease = length(fwidth(n))*1.2;
    edge = max(edge, smoothstep(.4, .9, crease));
    col = mix(col, vec3(.85,.9,.97), 1.-exp(-d*.0025));
  }
  col = mix(col, vec3(.03,.03,.06), edge);
  // comic glass shards: flat triangles with black outlines, flying out
  for(int i=0;i<16;i++){
    vec3 h = hash31(float(i)*3.3);
    vec2 c = (h.xy - .5)*vec2(2.6, 1.2);
    c += normalize(c)*t*(.25 + h.z*.4);
    vec2 q = (uv - c)*rot(h.z*6. + t*(h.x-.5)*6.);
    float s = .02 + .05*h.y;
    float tri = max(abs(q.x)*.866 + q.y*.5, -q.y) - s*.5;
    if(tri < 0.) col = mix(vec3(.75,.88,1.), vec3(1.), step(.0, q.x));
    col = mix(col, vec3(0.), smoothstep(.004, .0, abs(tri)));
  }
  return col;
}
`;

// 13. Incursion -- a shattered, drifting city under a dead sky.
const ruinsGLSL = /* glsl */ `
uniform sampler2D uConcC, uConcN, uRockC, uRockN;
float map(vec3 p, out float m){
  m = 0.;
  // hollowed tower shells
  vec2 c = floor(p.xz/14.);
  vec2 q = mod(p.xz, 14.) - 7.;
  vec2 h = hash22(c);
  float H = 10. + 30.*h.x;
  float tower = sdBox(vec3(q.x, p.y - H*.5 + 10., q.y), vec3(3. + h.y*2., H*.5, 3.));
  float hollow = sdBox(vec3(q.x, p.y - H*.5 + 10., q.y), vec3(2.6 + h.y*2., H*.5 + 1., 2.6));
  tower = max(tower, -hollow);
  // blown-out window grid
  float g = max(abs(mod(p.y, 3.) - 1.5) - .9, abs(mod(q.x + q.y, 2.2) - 1.1) - .6);
  tower = max(tower, -g);
  // broken tops
  tower = max(tower, p.y - (H - 10.) - 4.*fbm3(p.xz*.3));
  float d = tower + .15*noise(p*2.);
  // drifting rubble
  vec3 r = mod(p + vec3(0., uT*.8, 0.), 5.) - 2.5;
  vec3 rc = floor((p + vec3(0., uT*.8, 0.))/5.);
  vec3 rh = hash33(rc);
  r.xy *= rot(rh.x*6. + uT*.3); r.yz *= rot(rh.y*6.);
  float rock = sdOcta(r - (rh-.5)*1.5, .25 + .45*rh.z) + .08*noise(p*6.);
  if(rh.x < .55) rock = 2.;
  if(rock < d){ d = rock; m = 1.; }
  return d;
}
float map(vec3 p){ float m; return map(p, m); }
vec3 nrm(vec3 p){ const vec2 k = vec2(1., -1.); const float h = .01;   // tetrahedral: 4 taps
  return normalize(k.xyy*map(p + k.xyy*h) + k.yyx*map(p + k.yyx*h) + k.yxy*map(p + k.yxy*h) + k.xxx*map(p + k.xxx*h)); }

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  vec3 ro = vec3(7. + t*1.5, 8. - t*1.5, t*3.);
  vec3 rd = camRay(uv, ro, ro + vec3(.3, -.6 + t*.15, 1.), 2.8 + t*.35, 1.0);
  float d = 0., m = 0.;
  for(int i=0;i<100;i++){
    float h = map(ro + rd*d, m);
    if(h < .002*d || d > 90.) break;
    d += h*.8;
  }
  vec3 L = normalize(vec3(-.3, .7, .6));
  // stormy, sick sky with distant lightning
  float cl = fbm(rd.xz/max(abs(rd.y),.15)*1.5 + t*.05);
  vec3 sky = envSky(rd)*vec3(.75,.85,.9)*(.55 + .45*cl);
  float fl = step(.93, hash11(floor(t*6.)))*pow(sat(dot(rd, normalize(vec3(.5,.3,1.)))), 6.);
  sky += vec3(.5,.7,1.)*fl;
  vec3 col = sky;
  if(d < 90.){
    vec3 p = ro + rd*d, n = nrm(p);
    Mat cm;
    if(m == 1.) cm = triMat(uRockC, uRockN, p*.6, n, 1., 1.3);
    else cm = triMat(uConcC, uConcN, p*.3, n, 1., 1.3);
    vec3 alb = cm.alb*(m == 1. ? .7 : .85); n = cm.n;
    float dif = sat(dot(n, L));
    col = alb*(dif*vec3(.85,.9,1.)*2.2 + vec3(.2,.24,.28)*(n.y*.5+.5));
    col += alb*vec3(.5,.7,1.)*fl*3.;
    col += ambPBR(alb, cm.rough, 0., n, -rd, cm.ao)*.6;
    col = mix(col, envLod(rd, 5.)*vec3(.3,.34,.36), 1.-exp(-d*.022));
  }
  // green warning lights, scattered in the ruins
  for(int i=0;i<14;i++){
    vec3 h = hash31(float(i)*4.7);
    vec3 lp = ro + vec3((h.x-.5)*30., (h.y-.7)*20., 6. + h.z*30.);
    vec3 v = ro + rd*max(dot(lp-ro,rd),0.) - lp;
    float blink = step(.3, fract(t*1.5 + h.x));
    col += vec3(.2,1.,.4)*.0015/(dot(v,v)+.0005)*blink*step(dot(lp-ro,rd), d);
  }
  // dust
  col += vec3(.6,.65,.7)*.04*fbm3(uv*6. + t*.4);
  return col;
}
`;

export const ruins = {
  glsl: ruinsGLSL,
  uses: { uEnv: 'env:overcast', uConc: 'mat:concrete', uRock: 'mat:rock' },
  env: { rot: 0.5, gain: 0.8 },
};

// 14. Block realm -- a golden city built out of cubes.
export const voxel = /* glsl */ `
bool solid(vec3 c){
  vec2 b = floor(c.xz/7.);
  vec2 f = mod(c.xz, 7.);
  float h = hash12(b);
  float H = 6. + floor(h*h*40.);
  bool tower = f.x > 1. && f.x < 6. && f.y > 1. && f.y < 6. && c.y < H;
  // setbacks and crenellations near the top
  if(tower && c.y > H - 6. && (f.x < 2. || f.x > 5. || f.y < 2. || f.y > 5.)) tower = hash13(c) > .5;
  // clear a flight corridor
  if(abs(c.x - 3.) < 6. && c.y > 4.) tower = false;
  // floating debris cubes
  bool flo = hash13(c) > .9975 && c.y > 3.;
  return tower || flo || c.y < 0.;
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  vec3 ro = vec3(3.5 + sin(t*.5)*1.5, 14. + sin(t*.8), t*9.);
  vec3 rd = camRay(uv, ro, ro + vec3(.2*sin(t*.4), -.28, 1.), -.35 + t*.12, 1.0);
  vec3 c = floor(ro), st = sign(rd), dl = abs(1./rd);
  vec3 sd = (st*(c - ro) + st*.5 + .5)*dl;
  vec3 mk = vec3(0);
  bool hit = false;
  float dist = 0.;
  for(int i=0;i<180;i++){
    if(solid(c)){ hit = true; break; }
    mk = step(sd.xyz, sd.yzx)*step(sd.xyz, sd.zxy);
    sd += mk*dl; c += mk*st;
  }
  vec3 sky = mix(vec3(.95,.8,.55), vec3(.35,.2,.55), smoothstep(-.2,.6,rd.y + rd.x*.3));
  sky += vec3(1.,.8,.5)*pow(sat(dot(rd, normalize(vec3(-.6,.3,1.)))), 8.)*1.5;
  vec3 col = sky;
  if(hit){
    vec3 n = -mk*st;
    dist = dot(sd - dl, mk);
    vec3 p = ro + rd*dist;
    vec3 uvw = fract(p);
    vec2 fuv = mk.x > .5 ? uvw.yz : mk.y > .5 ? uvw.xz : uvw.xy;
    // warm gold in the light, violet in shadow
    vec3 L = normalize(vec3(-.6, .6, .5));
    float dif = sat(dot(n, L));
    float h = hash13(c);
    vec3 alb = mix(vec3(.75,.55,.3), vec3(.55,.45,.6), step(.7, h))*(.8 + .3*h);
    // per-voxel ambient occlusion from the 8 neighbours of this face
    vec3 a1 = mk.x > .5 ? vec3(0,1,0) : vec3(1,0,0);
    vec3 a2 = mk.z > .5 ? vec3(0,1,0) : vec3(0,0,1);
    vec3 base = c + n;
    float s1 = solid(base + a1) ? 1. : 0., s2 = solid(base - a1) ? 1. : 0.;
    float s3 = solid(base + a2) ? 1. : 0., s4 = solid(base - a2) ? 1. : 0.;
    vec2 f2 = vec2(dot(fract(p), a1), dot(fract(p), a2));
    float occ = 1. - .35*(s1*f2.x + s2*(1.-f2.x) + s3*f2.y + s4*(1.-f2.y));
    col = alb*(dif*vec3(1.,.85,.6)*2. + vec3(.35,.3,.5)*.6)*occ;
    // bevelled cube edges catch light
    float e = min(min(fuv.x, 1.-fuv.x), min(fuv.y, 1.-fuv.y));
    col *= .7 + .3*smoothstep(.0, .08, e);
    col += vec3(1.,.8,.5)*smoothstep(.05,.0,e)*dif*.5;
    // lit windows (random voxels glow)
    if(hash13(c + 7.) > .86 && c.y > 1.) col += vec3(1.,.7,.3)*1.4*smoothstep(.1,.25,e);
    col = mix(col, mix(vec3(.6,.45,.55), sky, .5), 1.-exp(-dist*.012));
  }
  // twinkling golden motes
  for(int i=0;i<30;i++){
    vec3 h = hash31(float(i)*5.1);
    vec3 sp = ro + vec3((h.x-.5)*12., (h.y-.5)*8., 2. + h.z*15.);
    vec3 v = ro + rd*max(dot(sp-ro,rd),0.) - sp;
    col += vec3(1.,.8,.4)*.0004/(dot(v,v)+.0001)*(.5+.5*sin(t*8.+h.x*20.));
  }
  return col;
}
`;

// 15. Paint realm -- riding thick ribbons of wet paint.
export const paint = /* glsl */ `
const vec3 PCOL[6] = vec3[6](vec3(1.,.12,.08), vec3(1.,.55,.02), vec3(1.,.85,.1), vec3(.05,.75,.9), vec3(.12,.3,1.), vec3(.6,.1,.9));

vec2 path(float z, float i){
  return vec2(sin(z*.21 + i*1.7)*2.2 + sin(z*.47 + i)*.6, cos(z*.17 + i*2.3)*1.6 + sin(z*.39 + i*.5)*.5) + vec2(i - 2.5, 0.)*.9;
}

float map(vec3 p, out vec3 col){
  float d = 1e9; col = vec3(0); float wsum = 0.;
  float nz = noise(p*2.5);
  for(int i=0;i<6;i++){
    float fi = float(i);
    vec2 c = path(p.z, fi);
    float r = .35 + .15*sin(p.z*.6 + fi*3.) + .12*(sin(nz*6.283 + fi*2.1)*.5 + .5);
    float di = length(p.xy - c) - r;
    float w = exp(-max(di,0.)*6.);
    col += PCOL[i]*w; wsum += w;
    d = smin(d, di, .45);
  }
  // splatter droplets
  vec3 q = mod(p + vec3(0,0,uT*2.), 1.6) - .8;
  vec3 h = hash33(floor((p + vec3(0,0,uT*2.))/1.6));
  float drop = length(q - (h-.5)*.8) - .07*h.z;
  if(h.x > .75 && drop < d){ d = drop; col = PCOL[int(h.y*5.99)]; wsum = 1.; }
  col /= max(wsum, 1e-3);
  return d;
}
float map(vec3 p){ vec3 c; return map(p, c); }
vec3 nrm(vec3 p){ const vec2 k = vec2(1., -1.); const float h = .004;   // tetrahedral: 4 taps
  return normalize(k.xyy*map(p + k.xyy*h) + k.yyx*map(p + k.yyx*h) + k.yxy*map(p + k.yxy*h) + k.xxx*map(p + k.xxx*h)); }

vec3 env(vec3 rd){
  float s = fbm3(rd.xy*3. + rd.z);
  vec3 c = mix(vec3(.25,.05,.45), vec3(.7,.3,1.), s);
  c = mix(c, vec3(.1,.7,.5), smoothstep(.6,.8,fbm3(rd.yz*5.))*.6);
  c += vec3(1.,.95,.9)*pow(sat(rd.y*.8 + rd.x*.3), 6.)*2.;
  return c;
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  float z = t*6.;
  vec3 ro = vec3(path(z, 2.5) + vec2(-.5, 2.2), z);
  vec3 ta = vec3(path(z + 5., 2.5), z + 5.);
  vec3 rd = camRay(uv, ro, ta, -.4 + .3*sin(t*.9), 1.0);
  float d = 0.; vec3 pc;
  for(int i=0;i<90;i++){
    float h = map(ro + rd*d, pc);
    if(h < .001*d || d > 40.) break;
    d += h*.8;
  }
  // violet crystal backdrop
  vec3 bg = env(rd);
  float shard = step(.55, fract(atan(rd.y, rd.x)*3.2 + fbm3(rd.xy*2.)*2.));
  bg *= .6 + .5*shard;
  vec3 col = bg;
  if(d < 40.){
    vec3 p = ro + rd*d, n = nrm(p);
    map(p, pc);
    vec3 L = normalize(vec3(.4, .8, -.3));
    float dif = sat(dot(n, L))*.8 + .2;
    vec3 r = reflect(rd, n);
    float fr = fresnel(n, rd, .05);
    col = pc*dif*1.3;
    col += pc*pc*pow(1.-sat(dot(n,-rd)), 2.)*.5;                  // wet saturation at glancing angles
    col += env(r)*fr*1.2;
    col += vec3(1.)*pow(sat(dot(r, L)), 60.)*3.;                  // glossy highlight
    col = mix(col, bg, 1.-exp(-d*.04));
  }
  return col;
}
`;

// 16. Old world -- a cobbled avenue under a drifting zeppelin.
const sepiaGLSL = /* glsl */ `
uniform sampler2D uCobC, uCobN, uWallC, uWallN;
const vec3 SUN = normalize(vec3(-.4, .5, .6));
float map(vec3 p, out float m){
  m = 0.;
  float d = p.y;
  vec3 q = p; q.x = abs(q.x);
  float lot = floor(q.z/8.);
  float lz = mod(q.z, 8.) - 4.;
  float h = 12. + 10.*hash11(lot + sign(p.x)*3.);
  float b = sdBox(vec3(q.x - 14., q.y - h*.5, lz), vec3(6., h*.5, 3.9));
  float win = sdBox2(vec2(mod(q.y, 3.5) - 2., mod(lz, 2.) - 1.), vec2(.9, .45));
  b = max(b, -max(max(8.2 - q.x, q.x - 8.5), win));
  b = min(b, sdBox(vec3(q.x - 8., mod(q.y, 3.5) - .2, lz), vec3(.3, .12, 4.)));
  if(b < d){ d = b; m = 1.; }
  // gas lamps
  vec3 l = vec3(q.x - 6.5, p.y, mod(p.z, 12.) - 6.);
  float lamp = min(sdCylY(l - vec3(0,2.,0), .07, 2.), sdBox(l - vec3(0,4.2,0), vec3(.2,.25,.2)));
  if(lamp < d){ d = lamp; m = 2.; }
  // an old car
  vec3 c = p - vec3(-2., .9, 14.);
  c.xz *= rot(.5);
  float car = min(sdRBox(c, vec3(.9,.45,2.), .2), sdRBox(c - vec3(0,.8,-.2), vec3(.85,.5,1.), .15));
  if(car < d){ d = car; m = 3.; }
  return d;
}
float map(vec3 p){ float m; return map(p, m); }
vec3 nrm(vec3 p){ const vec2 k = vec2(1., -1.); const float h = .005;   // tetrahedral: 4 taps
  return normalize(k.xyy*map(p + k.xyy*h) + k.yyx*map(p + k.yyx*h) + k.yxy*map(p + k.yxy*h) + k.xxx*map(p + k.xxx*h)); }

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  vec3 ro = vec3(2. - t*1.5, 1.2 + t*.5, t*5.);
  vec3 rd = camRay(uv, ro, ro + vec3(-.3, .08, 1.), -.7 + t*.5, 1.0);
  float d = 0., m = 0.;
  for(int i=0;i<100;i++){
    float h = map(ro + rd*d, m);
    if(h < .001*d || d > 100.) break;
    d += h*.9;
  }
  vec3 sky = envSky(rd);
  vec3 col = sky;
  // the zeppelin
  vec3 zp = vec3(-10. + t*.5, 30., 60.);
  vec3 er = vec3(14., 3.6, 3.6);
  vec3 oc = (ro - zp)/er, dd = rd/er;
  float a = dot(dd,dd), b = dot(oc,dd), c = dot(oc,oc) - 1., h = b*b - a*c;
  if(h > 0. && d > 90.){
    vec3 zn = normalize(((ro + rd*(-b - sqrt(h))/a) - zp)/(er*er));
    col = vec3(.6,.57,.52)*(.35 + .65*sat(dot(zn, SUN))) * (.9 + .1*step(.5, fract(zn.x*8.)));
  }
  if(d < 100.){
    vec3 p = ro + rd*d, n = nrm(p);
    Mat wm = triMat(uWallC, uWallN, p*.4, n, 1., 1.2);
    vec3 alb = wm.alb; n = wm.n;
    if(m == 0.){
      Mat cm = planarMat(uCobC, uCobN, p.xz*.4, n, 1.3);
      alb = cm.alb; n = cm.n;
    }
    if(m == 2. || m == 3.) alb = vec3(.08);
    float dif = sat(dot(n, SUN));
    col = alb*dif*2.2 + ambPBR(alb, .7, 0., n, -rd, 1.)*.9;
    col = mix(col, sky, 1.-exp(-d*.02));
  }
  return col;
}
`;

export const sepia = {
  glsl: sepiaGLSL,
  uses: { uEnv: 'env:overcast', uCob: 'mat:cobble', uWall: 'mat:sandbrick' },
  env: { rot: 0.0, gain: 1.0 },
};

// 17. Glass city -- threading glass towers above a sea of cloud.
const neonGLSL = /* glsl */ `
float map(vec3 p, out float m){
  vec2 c = floor(p.xz/16.);
  vec2 q = mod(p.xz, 16.) - 8.;
  vec2 h = hash22(c);
  float H = 20. + 60.*h.x;
  vec3 bp = vec3(q.x, p.y + 20. - H*.5, q.y);
  bp.xz *= rot((h.y-.5)*.5);
  float d = sdRBox(bp, vec3(2.5 + 1.5*h.y, H*.5, 2.5 + 1.5*h.x), .5);
  // stepped crowns
  d = max(d, -sdBox(bp - vec3(0, H*.5, 0), vec3(10., 3.*h.y, 1.)));
  m = 0.;
  return d;
}
float map(vec3 p){ float m; return map(p, m); }
vec3 nrm(vec3 p){ const vec2 k = vec2(1., -1.); const float h = .01;   // tetrahedral: 4 taps
  return normalize(k.xyy*map(p + k.xyy*h) + k.yyx*map(p + k.yyx*h) + k.yxy*map(p + k.yxy*h) + k.xxx*map(p + k.xxx*h)); }

vec3 sky(vec3 rd){ return envSky(rd)*vec3(.8,1.,1.05); }

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  float z = t*16.;
  vec3 ro = vec3(2.*sin(z*.05), 2. + sin(t)*.5, z);
  vec3 rd = camRay(uv, ro, vec3(2.*sin((z+8.)*.05), 1.5, z + 8.), .5 - t*.4, 1.0);
  float d = 0., m = 0.;
  for(int i=0;i<90;i++){
    float h = map(ro + rd*d, m);
    if(h < .002*d || d > 150.) break;
    d += h*.9;
  }
  vec3 col = sky(rd);
  if(d < 150.){
    vec3 p = ro + rd*d, n = nrm(p);
    vec3 r = reflect(rd, n);
    float fr = fresnel(n, rd, .1);
    // curtain-wall glazing: mullion grid, reflections, cyan tint
    vec2 g = fract(vec2(p.y*.5, (p.x + p.z)*.5));
    float mull = step(.06, min(g.x, g.y));
    vec3 glass = sky(r)*(.12 + .6*fr)*vec3(.5,.95,1.) + vec3(.0,.04,.06);
    glass += vec3(.2,.9,1.)*step(.93, hash12(floor(vec2(p.y*.5, (p.x+p.z)*.5))))*1.5;
    col = mix(vec3(.85,.9,.95)*(sat(dot(n, normalize(vec3(-.4,.5,1.))))+.2), glass, mull);
    col = mix(col, sky(rd), 1.-exp(-d*.007));
  }
  // cloud sea below
  if(rd.y < 0.){
    float tc = (-10. - ro.y)/rd.y;
    if(tc < d){
      vec3 cp = ro + rd*tc;
      float cl = fbm(cp.xz*.03 + vec2(0, t*.1));
      vec3 cc = mix(vec3(.5,.65,.75), vec3(1.), smoothstep(.3,.7,cl));
      col = mix(col, cc, smoothstep(.35,.55,cl)*exp(-tc*.004));
    }
  }
  // light streaks: traffic lanes flying past
  for(int i=0;i<16;i++){
    vec3 h = hash31(float(i)*2.1);
    vec3 a = vec3((h.x-.5)*20., (h.y-.5)*10., ro.z + mod(h.z*80. - t*60., 80.));
    vec3 v = ro + rd*max(dot(a-ro,rd),0.) - a;
    col += mix(vec3(.2,1.,1.), vec3(1.,.3,.4), step(.7,h.x))*.002/(dot(v.xy,v.xy)+.0005)*exp(-abs(v.z)*.5);
  }
  // glass fragments tumbling
  for(int i=0;i<24;i++){
    vec3 h = hash31(float(i)*7.3);
    vec3 sp = ro + vec3((h.x-.5)*6., (h.y-.5)*4., 1. + h.z*8. - mod(t*6., 3.));
    vec3 v = ro + rd*max(dot(sp-ro,rd),0.) - sp;
    col += vec3(.8,1.,1.)*.0003/(dot(v,v)+.00008);
  }
  // the blinding exit
  col += vec3(1.,.9,.8)*smoothstep(uDur - .6, uDur, t)*4.;
  return col;
}
`;

export const neon = {
  glsl: neonGLSL,
  uses: { uEnv: 'env:haze' },
  env: { rot: 0.0, gain: 1.0 },
};

