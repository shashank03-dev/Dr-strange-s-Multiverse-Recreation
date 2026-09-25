# Multiverse

A real-time, fully procedural short film that runs in a browser tab. It's a
shot-for-shot homage to the multiverse fall in *Doctor Strange in the
Multiverse of Madness*: there are no characters, and the camera does the
falling in their place.

No video, no images, no meshes and no samples. Every frame is ray-marched
live on the GPU, and the score is synthesised from oscillators in the page.

## Running it

It's a static page, but ES modules need to be served over HTTP:

```bash
npx http-server -c-1 .     # or: python3 -m http.server
```

Open `http://localhost:8080` and put headphones on.

The film opens on a title screen that asks: *Do you want to enter the
Multiverse?* A circle of sling-ring sparks draws itself while the universes
compile and the score renders. Choose **Yes** and the star at its centre opens
into a portal, you dive through a hyperspace tunnel, and everything collapses
to the single point of light the film begins with. Choosing **No** doesn't work
for long. When the film ends you're returned to the title screen.

| Key | Action |
| --- | --- |
| `←` `→`, `Enter` | title screen: choose, confirm (or `Y` / `N`) |
| `Space` | pause / play |
| `←` `→` | seek 2 s |
| `1`–`9`, `0` | jump to a chapter |
| `F` | fullscreen |
| `Q` | cycle the resolution ceiling (50 / 75 / 100 %) |
| `M` | mute |
| `H` | show / hide the HUD |
| `Esc` | back to the title screen |

URL parameters: `?t=16` starts at a given second, `?q=0.6` fixes the render
scale (by default it adapts to hold 60 fps), `?noaudio` skips the score, and
`?autoplay` answers the title screen for you.

## The edit

The cut follows the reference beat for beat. The camera stands in for the
travellers.

| Time | Universe | What's on screen |
| --- | --- | --- |
| 0:00 | The Spark | A five-pointed star ignites in magenta haze |
| 0:02.6 | Sanctum | A lantern-lit temple hall; a star-shaped rift tears open with lightning and crystal shards, then pulls the camera in |
| 0:08.4 | Hall of Giants | Stone colossi with glowing eyes above a river of fire and smoke |
| 0:10.4 | Deep Space | A crackling starburst over a planet's night side, with debris tumbling past |
| 0:11.8 | Silk | Endless translucent magenta fabric, lit from behind |
| 0:13.2 | Crystal | A cathedral of refracting ice shards |
| 0:14.8 | The Fall | A banded sandstone slot canyon, dropping towards the light |
| 0:16.0 | Ocean | Sunlit water, caustics, coral, fish schools, bubbles and god-rays |
| 0:20.2 | Manhattan | Tumbling across a sunny street: fire escapes, taxis, falling glass |
| 0:23.2 | Machine | Down a shaft of white conduits and cyan light |
| 0:25.4 | Boneyard | Flying through the ribs of something colossal, among fires and embers |
| 0:28.4 | Primeval | Plunging down a mossy cliff through rainforest sunbeams |
| 0:30.4 | Ink | A cel-shaded comic-book city with ink outlines and halftone |
| 0:32.9 | Incursion | A shattered, drifting city under a dead sky |
| 0:35.6 | Blocks | A voxel city of gold and violet |
| 0:38.4 | Paint | Riding thick ribbons of glossy paint |
| 0:41.8 | Old World | A sepia avenue, cobblestones and a zeppelin, with flickering film |
| 0:43.4 | Glass City | Threading glass towers above a sea of cloud |
| 0:45.6 | Earth-616 | Thrown out onto a rooftop garden at golden hour; the portal collapses |
| 0:50.0 | Title | A golden relic, a bloom of red ink, and the title |

## How it's made

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
- **Performance**: dynamic resolution holds the frame rate by rendering scenes
  into a scaled viewport. Shaders compile in parallel where
  `KHR_parallel_shader_compile` exists. Only transitions render two universes
  at once.

Needs a WebGL2 browser. A discrete GPU is recommended for full resolution.
