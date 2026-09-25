// 0. The Spark -- a five-pointed star ignites in magenta darkness.
export const eye = /* glsl */ `
vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  vec2 p = uv*rot(.05*sin(t*.7));
  float r = length(p);
  // velvet magenta haze, slowly breathing
  float n = fbm(p*2.2 + vec2(t*.08, -t*.05));
  float n2 = fbm(p*5. - vec2(t*.1, t*.03) + n);
  vec3 col = mix(vec3(.12,.0,.03), vec3(.9,.05,.28), smoothstep(.2,.9,n))*(.35+.8*n2);
  col *= smoothstep(1.3, .1, r)*1.2;
  // iris ring, almost subliminal
  float ring = exp(-abs(r-.23)*40.)*smoothstep(.2,1.4,t);
  col += vec3(1.,.3,.6)*ring*.35*(.6+.4*noise(vec2(atan(p.y,p.x)*8.,t)));
  // the star ignites
  float ig = smoothstep(.25, 1.6, t);
  float s = sdStar5(p*rot(t*.25), .1*ig + .01, .45);
  float core = exp(-max(s,0.)*60.)*ig;
  float halo = .004/(r*r+.006)*ig;
  vec3 starCol = mix(vec3(1.,.55,.9), vec3(.85,.9,1.), smoothstep(.0,.08,-s));
  col += starCol*(core*4. + halo*.55);
  // diffraction spikes (5 + 5)
  float a = atan(p.y,p.x) - t*.25;
  float spikes = pow(abs(cos(a*2.5)), 180.)*exp(-r*5.)*ig*3.;
  col += vec3(1.,.6,.95)*spikes;
  // sparks orbiting
  for(int i=0;i<24;i++){
    float fi = float(i);
    vec3 h = hash31(fi*3.7);
    float ang = h.x*TAU + t*(.3+h.y);
    float rr = .08 + h.z*.55 - mod(t*.1*h.y, .2);
    vec2 sp = vec2(cos(ang), sin(ang))*rr;
    col += vec3(1.,.5,.8)*.00018/(dot(p-sp,p-sp)+.00002)*ig*(.5+.5*sin(t*9.+fi));
  }
  // final blow-out into the sanctum
  col *= 1. + smoothstep(1.9, 2.6, t)*6.;
  return col;
}
`;

// 1. Sanctum -- a temple hall at night; a star-shaped rift tears open.
export const sanctum = /* glsl */ `
const vec3 PORTAL = vec3(0., 2.4, 9.);
float portalR(float t){ return 2.3*smoothstep(.6, 2.6, t)*(1.+.04*sin(t*13.)) + .3*smoothstep(4.5,5.6,t); }

float lattice(vec2 p){ // carved wooden screen
  vec2 q = fract(p*vec2(3.,3.)) - .5;
  float d = min(abs(q.x), abs(q.y));
  vec2 r = fract(p*1.5) - .5;
  d = min(d, abs(abs(r.x)+abs(r.y)-.5)*.7);
  return d;
}

float map(vec3 p, out float m){
  m = 0.;
  float d = p.y;                                   // floor
  float ceil_ = 8.5 - p.y; if(ceil_<d){ d=ceil_; m=1.; }
  // pillars along both sides
  vec3 q = p; q.x = abs(q.x) - 5.2; float cz = floor((q.z+2.)/4.); q.z = mod(q.z+2., 4.) - 2.;
  float pil = sdCylY(q - vec3(0,4.2,0), .42 + .04*sin(p.y*10.)*step(.5,fract(p.y*.25)), 4.2);
  pil = min(pil, sdBox(q-vec3(0,.3,0), vec3(.7,.3,.7)));
  pil = min(pil, sdBox(q-vec3(0,8.1,0), vec3(.75,.35,.75)));
  pil = min(pil, sdCylY(q-vec3(0,1.1,0), .55, .12));
  if(pil<d){ d=pil; m=2.; }
  // side walls with lattice screens
  float wall = 8.2 - abs(p.x);
  float lat = lattice(vec2(p.z*.25, p.y*.25));
  float scr = wall - .1*smoothstep(.07,.03,lat);
  if(scr<d){ d=scr; m=3.; }
  // back wall + big round window
  float back = 21. - p.z;
  float win = length(p.xy-vec2(0,4.2)) - 3.2;
  back = max(back, -max(win, -(back+.3)));
  if(back<d){ d=back; m=3.; }
  // ceiling beams
  vec3 b = p; b.z = mod(b.z, 4.) - 2.;
  float beam = sdBox(b-vec3(0,8.1,0), vec3(8.,.25,.3));
  if(beam<d){ d=beam; m=2.; }
  // steps towards the dais
  float st = sdBox(p-vec3(0,.12,12.), vec3(4.,.12,2.2));
  st = min(st, sdBox(p-vec3(0,.36,13.), vec3(3.,.12,1.4)));
  if(st<d){ d=st; m=4.; }
  // lanterns (emissive, handled separately)
  return d;
}
float map(vec3 p){ float m; return map(p,m); }

vec3 nrm(vec3 p){ vec2 e = vec2(.002,0); float m;
  return normalize(vec3(map(p+e.xyy,m)-map(p-e.xyy,m), map(p+e.yxy,m)-map(p-e.yxy,m), map(p+e.yyx,m)-map(p-e.yyx,m))); }

float ao(vec3 p, vec3 n){ float s=0., w=1.; for(int i=1;i<=5;i++){ float h=.12*float(i); s+=w*(h-map(p+n*h)); w*=.6; } return sat(1.-s*1.2); }

vec3 lanternPos(int i){
  float side = (i%2==0) ? -1. : 1.;
  float z = float(i/2)*4. - 2.;
  return vec3(side*4.4, 3.2, z);
}

vec3 render(vec2 uv, vec2 fc){
  float t = uT;
  // camera: slow dolly towards the rift, then yanked in
  float pull = smoothstep(4.6, 5.9, t);
  vec3 ro = vec3(sin(t*.3)*.4 - .6, 1.7 + .1*sin(t*.5), -4. + t*.55 + pull*pull*12.);
  vec3 ta = vec3(0., 2.2, 9.);
  vec3 rd = camRay(uv, ro, ta, .04*sin(t*.4) - pull*.3, 1.35 - pull*.4);

  float R = portalR(t);
  float flick = .7 + .3*noise(vec2(t*25., 1.)) + .6*step(.8, hash11(floor(t*18.)));
  vec3 pc = vec3(.45,.7,1.)*(R*R)*1.6*flick;   // portal light power

  // march
  float d = 0., m = 0.; vec3 p;
  for(int i=0;i<110;i++){
    p = ro + rd*d;
    float h = map(p, m);
    if(abs(h) < .001*d || d > 60.) break;
    d += h*.9;
  }
  vec3 col = vec3(0);
  if(d < 60.){
    vec3 n = nrm(p);
    float o = ao(p, n);
    // materials
    vec3 alb = vec3(.25,.12,.07);                 // lacquered wood
    float rough = .5;
    if(m == 0.){                                  // stone floor tiles
      vec2 g = p.xz*.5; vec2 gi = floor(g); vec2 gf = fract(g);
      float tile = hash12(gi);
      float grout = smoothstep(.0,.03,min(min(gf.x,1.-gf.x), min(gf.y,1.-gf.y)));
      alb = mix(vec3(.08,.07,.07), vec3(.2,.17,.15), tile)*(.6+.4*grout)*(.7+.5*fbm(p.xz*3.));
      rough = .15 + .3*tile + (1.-grout)*.5;
      // inlaid circle pattern
      float ring = abs(length(p.xz-vec2(0,6.))-3.5);
      alb = mix(alb, vec3(.45,.3,.12), smoothstep(.08,.0,ring)*.8);
    } else if(m == 1.){ alb = vec3(.1,.05,.03); }
    else if(m == 2.){ alb = vec3(.18,.05,.03)*(.7+.6*fbm(p*4.)); rough = .35; }
    else if(m == 3.){
      alb = vec3(.2,.09,.04)*(.6+.6*fbm(p*2.));
      // paper panes between the carved screen glow with warm light behind
      float lat = lattice(vec2(p.z*.25, p.y*.25));
      float pane = smoothstep(.05,.09,lat)*step(abs(p.x),8.3)*step(7.9,abs(p.x))*step(1.2,p.y)*step(p.y,7.5);
      col += vec3(1.,.5,.2)*pane*.35*(.6+.4*fbm(p.yz*.7));
      // moonlit round window at the back
      float win = length(p.xy-vec2(0,4.2));
      col += vec3(.35,.45,.8)*.5*step(20.5,p.z)*smoothstep(3.2,2.8,win)*(.5+.5*smoothstep(.06,.1,lattice(p.xy*.35)));
    }
    else if(m == 4.){ alb = vec3(.15,.12,.1); }
    // portal light (area-ish via distance)
    vec3 lv = PORTAL - p; float ld = length(lv); lv /= ld;
    float dif = sat(dot(n, lv))*.8 + .2*sat(dot(n,lv)*.5+.5);
    col += alb*pc*dif/(ld*ld*.6+1.)*o;
    // lanterns
    for(int i=0;i<10;i++){
      vec3 lp = lanternPos(i); vec3 l = lp-p; float ll = length(l); l/=ll;
      float lf = .85+.15*noise(vec2(t*8.,float(i)));
      col += alb*vec3(1.,.45,.15)*1.6*lf*sat(dot(n,l))/(ll*ll+.3)*o;
    }
    // warm moonlight through the back window
    col += alb*vec3(.15,.2,.35)*.25*(n.y*.5+.5)*o;
    // wet stone reflection of the rift
    if(m == 0.){
      vec3 rr = reflect(rd, n);
      float fr = fresnel(n, rd, .04);
      float tp = (PORTAL.z - p.z)/rr.z;
      if(tp > 0.){
        vec2 q = (p + rr*tp).xy - PORTAL.xy;
        vec4 sp = starPortal(q*vec2(1,-1)*-1., R, t);
        col += sp.rgb*fr*(1.-rough)*1.4*exp(-tp*.05);
      }
    }
  }
  float tmax = min(d, 60.);
  // lantern bodies + glow
  for(int i=0;i<10;i++){
    vec3 lp = lanternPos(i);
    float g = fogLight(ro, rd, lp, tmax);
    col += vec3(1.,.42,.12)*g*.012*(.85+.15*noise(vec2(t*8.,float(i))));
    vec3 q = ro + rd*max(dot(lp-ro, rd),0.) - lp;
    col += vec3(1.,.55,.2)*smoothstep(.2,.12,length(q*vec3(1,.7,1)))*step(dot(lp-ro,rd),tmax)*3.;
  }
  // volumetric haze lit by the rift
  col += vec3(.4,.65,1.)*fogLight(ro, rd, PORTAL, tmax)*R*R*.018*flick;
  col += vec3(.02,.025,.04)*(1.-exp(-tmax*.04));
  // the rift itself (a plane at z = PORTAL.z)
  float tp = (PORTAL.z - ro.z)/rd.z;
  if(tp > 0. && tp < d+.01){
    vec2 q = (ro + rd*tp).xy - PORTAL.xy;
    vec4 sp = starPortal(q, R, t);
    // view into the next reality: a churning fire-lit hall
    vec2 iq = q*.3 + vec2(0, t*.2);
    vec3 beyond = mix(vec3(.25,.35,.6), vec3(1.,.45,.15), smoothstep(.4,.7,fbm(iq*3.)))*.7*(.4+fbm(iq*6.-t));
    col = mix(col, beyond + col*.3, sp.a*.85);
    col += sp.rgb;
  }
  // electric bolts crawling across the hall (screen-space, projected from portal)
  vec3 pv = PORTAL - ro;
  float zc = dot(pv, rd);
  for(int i=0;i<6;i++){
    float fi = float(i);
    float on = step(.45, hash11(floor(t*7.)+fi*5.))*smoothstep(1.2,2.,t);
    vec2 a = vec2(0.,.05) + (hash21(fi+floor(t*7.))-.5)*.2;
    vec2 b = vec2((hash11(fi*3.1+floor(t*7.))-.5)*3.2, (hash11(fi*7.7+floor(t*7.))-.4)*1.2);
    col += vec3(.55,.8,1.)*bolt(uv, a, b, fi+floor(t*7.), t, .004)*on*1.2;
  }
  // flying crystal debris near the camera once the rift is open
  for(int i=0;i<18;i++){
    float fi = float(i);
    vec3 h = hash31(fi*1.93);
    vec3 sp = PORTAL + (h-.5)*vec3(10.,6.,2.) - vec3(0,0,(t-1.)*(1.+h.z*3.));
    vec3 q = ro + rd*max(dot(sp-ro, rd),0.) - sp;
    float s = length(q);
    col += vec3(.6,.85,1.)*.0025/(s*s+.0008)*smoothstep(1.,2.,t)*step(dot(sp-ro,rd),tmax);
  }
  // the pull: everything bleaches into the rift
  col = mix(col, vec3(.7,.85,1.)*1.6, smoothstep(5.3, 6.0, t)*.35);
  return col;
}
`;
