# Multiverse

A real-time short film that runs in a browser tab. It's a shot-for-shot homage
to the multiverse fall in *Doctor Strange in the Multiverse of Madness*: there
are no characters, and the camera does the falling in their place.

This is the extended cut (1:26). There is no video and nothing is pre-rendered.
Every frame is ray-marched live on the GPU and lit with photographic HDRIs and
scanned PBR materials. Real 3D models are baked into distance fields so they sit
inside the ray-marched worlds. The score is synthesised in the page.

## Running it

It's a static page, but ES modules need to be served over HTTP:

```bash
npx http-server -c-1 .     # or: python3 -m http.server
```

Open `http://localhost:8080` and put headphones on.

The film opens like a game:

1. **Opening card.** A short studio-style card plays while the shaders compile.
2. **Title screen.** It asks *Do you want to enter the Multiverse?* The title is
   bevelled gold lettering rendered in WebGL from a signed-distance font atlas,
   lit by a studio HDRI, with a travelling light sweep and an ember reveal.
   Behind it, a circle of sling-ring sparks draws itself as loading progresses.
3. **Press any key.** The screen comes alive with sound.
4. **Main menu.** **Yes** / **No**, plus **Chapters** (jump to any of the 20
   universes), **Settings** (render quality, aspect ratio, volume, motion
   trails, film grain) and **Credits**.

Choose **Yes** and the star at the centre of the circle opens into a portal, you
dive through a hyperspace tunnel, and everything collapses to the single point
of light the film begins with. Choosing **No** doesn't work for long. When the
film ends you're returned to the title screen.

| Key | Action |
| --- | --- |
| `←` `→` `↑` `↓`, `Enter`, `Esc` | title screen: move, select, back (or `Y` / `N`) |
| `Space` | pause / play |
| `←` `→` | seek 2 s |
| `1`–`9`, `0` | jump to a chapter |
| `F` | fullscreen |
| `Q` | cycle the resolution ceiling (50 / 75 / 100 %) |
| `M` | mute |
| `H` | show / hide the HUD |
| `Esc` | back to the title screen |

## Deploying

It's a static site with no build step. `vercel.json` sets cache headers for
the asset pack. On Vercel, import the repository with the framework preset
**Other**, leave the build command empty, and set the output directory to
`.`. Any static host works the same way.

## Rendering the video

`tools/render_video.mjs` renders the whole experience to an MP4 one frame at a
time, so motion trails and blur match real time exactly. That covers the
opening card, the title screen (including a refused "no"), the dive and the
full film. The title-screen sounds are rendered offline in the page and mixed
with the film score.

```bash
npx http-server -p 8765 -c-1 .     # in one terminal
node tools/render_video.mjs out/multiverse.mp4
```

`FPS`, `WIDTH`, `HEIGHT` and `QUALITY` control the output; `FROM`/`TO` render
a frame range, which lets you resume. It needs Playwright and ffmpeg.

URL parameters: `?t=16` starts at a given second, `?q=0.6` fixes the render
scale (by default it adapts to hold 60 fps), `?noaudio` skips the score, and
`?autoplay` answers the title screen for you.

## The edit

The cut follows the reference beat for beat. The camera stands in for the
travellers.

| # | Universe | What's on screen |
| --- | --- | --- |
| 1 | The Spark | A five-pointed star ignites in magenta haze |
| 2 | Sanctum | A lantern-lit temple hall; a star-shaped rift tears open with lightning and crystal shards, then pulls the camera in |
| 3 | Hall of Giants | Stone colossi with glowing eyes above a river of fire and smoke |
| 4 | Deep Space | A crackling starburst over a planet's night side, with debris tumbling past |
| 5 | Silk | Endless translucent magenta fabric, lit from behind |
| 6 | Crystal | A cathedral of refracting ice shards |
| 7 | The Fall | A banded sandstone slot canyon, dropping towards the light |
| 8 | Ocean | Sunlit water, caustics, coral, fish schools, bubbles and god-rays |
| 9 | Manhattan | Tumbling across a sunny street: fire escapes, taxis, falling glass |
| 10 | Machine | Down a shaft of white conduits and cyan light |
| 11 | Boneyard | Flying through the ribs of something colossal, among fires and embers |
| 12 | Primeval | Plunging down a mossy cliff through rainforest sunbeams |
| 13 | Ink | A cel-shaded comic-book city with ink outlines and halftone |
| 14 | Incursion | A shattered, drifting city under a dead sky |
| 15 | Blocks | A voxel city of gold and violet |
| 16 | Paint | Riding thick ribbons of glossy paint |
| 17 | Old World | A sepia avenue, cobblestones and a zeppelin, with flickering film |
| 18 | Glass City | Threading glass towers above a sea of cloud |
| 19 | Earth-616 | Thrown out onto a rooftop garden at golden hour; the portal collapses |
| 20 | Title | A golden relic, a bloom of red ink, and the title |

## How it's made

- **Assets** (`tools/build_assets.py`): everything comes from Poly Haven (CC0)
  and is fetched and converted by one script. That's 9 HDRIs, 23 PBR materials
  and 14 models.
  - HDRIs are stored as log-encoded JPEGs and decoded back to linear radiance
    in the shader.
  - Each material is packed into two WebP textures: albedo plus roughness, and
    normal plus AO plus height.
  - Models (a marble bust, a whale, a shipwreck, sharks, Chinese screens and
    lanterns, a hydrant, street lamps, trees, moon rocks and a garden gnome)
    are baked into signed-distance volumes. The ray marcher treats them like
    any other shape, so they get the same shadows, occlusion and lighting.
  - The title lettering is baked into a signed-distance atlas.
- **Shading** (`src/shaders/common.js`): triplanar PBR materials with whiteout
  normal blending, GGX specular, and image-based lighting with
  roughness-filtered reflections and an analytic environment BRDF.

- **Rendering** (`src/scenes/*.js`): each universe is its own GLSL fragment
  shader, built on sphere-traced signed distance fields, voxel DDA, analytic
  ray-sphere and ray-ellipsoid hits, and volumetric marching for fire, smoke,
  silk and light shafts. Lighting uses soft shadows, ambient occlusion,
  closed-form in-scattering for glowing lights in fog, Fresnel reflections,
  fake refraction and water caustics. The shared toolkit (noise, Voronoi,
  SDFs, the star portal, lightning) is in `src/shaders/common.js`.
- **Transitions and post** (`src/shaders/post.js`): reality shatters into
  Voronoi glass shards, the star portal irises open, there are hyperspace zooms
  and prismatic flashes. The post chain adds a feedback motion trail, a
  seven-level bloom, anamorphic streaks, lens dirt, radial speed blur,
  chromatic aberration, ACES tone mapping, a per-universe grade, film grain and
  a sepia film gate.
- **Direction** (`src/timeline.js`): the shot list, transition types, a
  per-shot grade, and one shared camera-shake and impact language that every
  shader picks up.
- **Score** (`src/score.js`, `src/synth.js`): a small offline synthesiser
  running in a Web Worker. It has PolyBLEP oscillators, biquad filters, a
  formant-filtered choir, a string ostinato at 140 bpm over a D pedal, brass
  stabs, war drums, and a Freeverb-style reverb and limiter. Every whoosh,
  boom, glass shatter and electrical crackle is placed on the frame of its
  cut, and the music is muffled while the camera is underwater.
- **Performance**: each universe's shader cost was measured
  (`window.__profileScene`), and the heaviest were optimised (tetrahedral
  normals, bounded evaluation of props, cheaper noise in distance functions).
  Resolution is predictive: it drops the moment an expensive universe or a
  two-scene transition begins, and a controller tunes the overall budget to
  hold 60 fps. Scenes render into a scaled viewport. Shaders compile in parallel where
  `KHR_parallel_shader_compile` exists. Only transitions render two universes
  at once.

Needs a WebGL2 browser. A discrete GPU is recommended for full resolution.
