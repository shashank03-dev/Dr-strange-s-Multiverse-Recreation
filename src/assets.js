// Loads the CC0 asset pack (HDRIs, PBR materials, model distance volumes,
// title lettering) described by assets/manifest.json into GPU textures.

let aniso = null;

async function bitmap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  const blob = await res.blob();
  return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}

// Volumes ship as PNGs with their z-slices stacked vertically; unpack to raw bytes.
async function volumeBytes(url, channels) {
  const img = await bitmap(url);
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(img.width, img.height) : Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const rgba = g.getImageData(0, 0, img.width, img.height).data;
  if (channels === 4) return new Uint8Array(rgba.buffer);
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4];
  return out;
}

function tex2D(gl, img, { srgb = false, repeat = true, mips = true } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  if (aniso && mips) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
  return t;
}

function tex3D(gl, data, n, format) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  if (format === 'r8') gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, n, n, n, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  else gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, n, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
  return t;
}

// A tiny placeholder so scenes still render if an asset fails to arrive.
function fallback2D(gl, rgba) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba));
  return t;
}
function fallback3D(gl, v) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, t);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([v, v, v, 255]));
  return t;
}

export class AssetLibrary {
  constructor(gl) {
    this.gl = gl;
    this.manifest = null;
    this.items = new Map();
    aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.blank = fallback2D(gl, [128, 128, 128, 200]);
    this.flatNormal = fallback2D(gl, [128, 128, 255, 128]);
    this.blank3D = fallback3D(gl, 255);
  }

  async loadManifest(url = 'assets/manifest.json') {
    const res = await fetch(url);
    this.manifest = res.ok ? await res.json() : { env: {}, mat: {}, vol: {}, ui: {} };
    return this.manifest;
  }

  // keys like 'env:sunset', 'mat:grass', 'vol:bust', 'ui:the'
  async load(keys, onProgress = () => {}) {
    const gl = this.gl, m = this.manifest;
    let done = 0;
    const jobs = [...new Set(keys)].map(async (key) => {
      const [kind, name] = key.split(':');
      try {
        if (kind === 'env') {
          const e = m.env[name];
          const img = await bitmap(e.file);
          this.items.set(key, { tex: tex2D(gl, img, { repeat: true }), meta: e });
        } else if (kind === 'mat') {
          const e = m.mat[name];
          const [c, n] = await Promise.all([bitmap(e.c), bitmap(e.n)]);
          this.items.set(key, { c: tex2D(gl, c, { srgb: true }), n: tex2D(gl, n), meta: e });
        } else if (kind === 'vol') {
          const e = m.vol[name];
          const [s, c] = await Promise.all([volumeBytes(e.sdf, 1), volumeBytes(e.col, 4)]);
          this.items.set(key, { s: tex3D(gl, s, e.n, 'r8'), c: tex3D(gl, c, e.nc, 'rgba'), meta: e });
        } else if (kind === 'ui') {
          const e = m.ui[name];
          const img = await bitmap(e.file);
          this.items.set(key, { tex: tex2D(gl, img, { repeat: false }), meta: e });
        }
      } catch (err) {
        console.warn('asset failed', key, err);
      }
      onProgress(++done, keys.length);
    });
    await Promise.all(jobs);
  }

  get(key) { return this.items.get(key); }

  // Bind a scene's declared assets. Returns the next free texture unit.
  bind(prog, uses, unit) {
    const gl = this.gl, u = prog.uniforms;
    const set2D = (name, tex) => {
      if (u[name] === undefined) return;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u[name], unit++);
    };
    const set3D = (name, tex) => {
      if (u[name] === undefined) return;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_3D, tex);
      gl.uniform1i(u[name], unit++);
    };
    for (const [uname, key] of Object.entries(uses || {})) {
      const [kind] = key.split(':');
      const it = this.items.get(key);
      if (kind === 'env') {
        set2D(uname, it ? it.tex : this.blank);
        if (u[uname + 'Max'] !== undefined) gl.uniform1f(u[uname + 'Max'], it ? it.meta.max : 1);
        if (u[uname + 'K'] !== undefined) gl.uniform1f(u[uname + 'K'], it ? it.meta.k : 16);
        if (u[uname + 'Sun'] !== undefined) gl.uniform3fv(u[uname + 'Sun'], it ? it.meta.sun : [0, 1, 0]);
      } else if (kind === 'mat') {
        set2D(uname + 'C', it ? it.c : this.blank);
        set2D(uname + 'N', it ? it.n : this.flatNormal);
      } else if (kind === 'vol') {
        set3D(uname + 'S', it ? it.s : this.blank3D);
        set3D(uname + 'Col', it ? it.c : this.blank3D);
        if (u[uname + 'R'] !== undefined) gl.uniform1f(u[uname + 'R'], it ? it.meta.range : 1);
        if (u[uname + 'E'] !== undefined) gl.uniform3fv(u[uname + 'E'], it ? it.meta.extent : [1, 1, 1]);
      } else if (kind === 'ui') {
        set2D(uname, it ? it.tex : this.blank);
      }
    }
    return unit;
  }
}
