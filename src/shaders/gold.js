// Gold lettering from a signed-distance atlas: bevel, brushed metal,
// studio reflections, a travelling light sweep and an ember reveal.
export const GOLD = /* glsl */ `
// ---------------------------------------------------------------- the gold title
float tSD(sampler2D T, vec2 v){ return (texture(T, v).r*255. - 128.)/127.*24.; }   // texture px, <0 inside

// Returns premultiplied colour in rgb, coverage in a; glow and shadow via out params.
vec4 goldText(sampler2D T, sampler2D SC, sampler2D SN, vec4 rect, float qStart, float reveal, float energy,
              vec2 nuv, float t, float warp, out vec3 glow, out float shadow){
  glow = vec3(0); shadow = 0.;
  nuv = .5 + (nuv - .5)/(1. + warp*warp*3.);
  vec2 tuv = (nuv - rect.xy)/rect.zw;
  if(any(lessThan(tuv, vec2(-.05))) || any(greaterThan(tuv, vec2(1.05)))) return vec4(0);
  vec2 tv = vec2(tuv.x, 1. - tuv.y);
  float pxs = rect.z*uRes.x/1024.;               // screen px per texture px
  float sd = tSD(T, tv);
  vec2 e = vec2(1./1024., 1./256.)*1.2;
  vec2 g = vec2(tSD(T, tv + vec2(e.x, 0.)) - tSD(T, tv - vec2(e.x, 0.)), tSD(T, tv - vec2(0., e.y)) - tSD(T, tv + vec2(0., e.y)))/2.4;
  // reveal: letters condense out of embers, sweeping left to right
  float nz = fbm3(tuv*vec2(26., 7.) + 3.);
  float front = reveal*1.45 - tuv.x*.4 - nz*.35;
  float vis = smoothstep(0., .06, front);
  float emberEdge = exp(-abs(front)*22.)*step(0., reveal - .001)*(1. - smoothstep(.95, 1., reveal));
  float cover = sat(.5 - sd*pxs)*vis;
  // drop shadow and warm halo behind the letters
  float sdS = tSD(T, tv + vec2(-.004, .03));
  shadow = sat(1. - sdS*.2)*.7*vis*smoothstep(23., 12., sdS);
  glow = vec3(1., .45, .12)*exp(-max(sd, 0.)*.11)*smoothstep(22., 8., sd)*.22*vis*(1. + energy);
  glow += vec3(1., .55, .2)*emberEdge*sat(1. - abs(sd)*.08)*3.;
  if(cover <= 0.) return vec4(0);

  float bev = 4.5;
  float depth = sat(-sd/bev);
  float slope = 1. - depth;
  vec3 n = normalize(vec3(g*slope*2.2, 1.));
  // brushed metal: roughness and fine normal from the scratch texture
  vec4 sc = texture(SC, tuv*vec2(5., 1.25));
  vec4 sn = texture(SN, tuv*vec2(5., 1.25));
  n = normalize(n + vec3((sn.xy*2. - 1.)*.12*depth, 0.));
  float rough = mix(.12, .38, sc.a);
  vec3 v = vec3(0., 0., 1.);
  vec3 r = reflect(-v, n);
  vec3 dir = normalize(vec3(r.x*1.3, r.y*1.1 + .08, -r.z + .15));
  bool q = tuv.x > qStart;
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
    col += litPBR(F0, rough, 1., n, v, normalize(vec3(.6, -.6, .5)), vec3(1., .4, .7)*.5*(.4 + energy));
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

`;
