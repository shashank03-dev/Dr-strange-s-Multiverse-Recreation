#!/usr/bin/env python3
"""Fetch and convert every external asset the film uses.

All sources are CC0 (Poly Haven). Output goes to ./assets with a manifest the
runtime reads. Run from the repository root:

    pip install trimesh scipy numpy pillow opencv-python-headless
    python3 tools/build_assets.py

Conversions:
  * HDRIs   -> log-encoded 8-bit JPEG (decoded to linear HDR in the shader).
  * PBR     -> <name>_c.webp (albedo RGB + roughness A) and
               <name>_n.webp (normal XY + AO + height).
  * Models  -> signed-distance volumes (uint8, N^3) plus a colour volume, so
               meshes drop straight into the ray-marched scenes.
  * Title   -> a signed-distance atlas of the title lettering in Cinzel Black.
"""
import io
import json
import math
import os
import sys
import urllib.request

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from scipy.spatial import cKDTree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets')
CACHE = os.environ.get('ASSET_CACHE', '/tmp/assetcache')
UA = {'User-Agent': 'multiverse-asset-builder/1.0'}

HDRIS = {
    # name: (poly haven id, resolution)
    'studio': ('studio_small_04', '2k'),
    'sunset': ('belfast_sunset_puresky', '2k'),
    'day': ('kloofendal_48d_partly_cloudy_puresky', '2k'),
    'clear': ('kloofendal_43d_clear_puresky', '2k'),
    'dawn': ('qwantani_dawn_puresky', '2k'),
    'overcast': ('kloofendal_overcast_puresky', '2k'),
    'furnace': ('smelting_tower_interior', '1k'),
    'haze': ('kloppenheim_05_puresky', '2k'),
    'snow': ('snow_field_2_puresky', '1k'),
}

MATERIALS = {
    # name: (poly haven id, resolution, uv tiling hint)
    'granite': ('granite_tile_02', '1k'),
    'darkwood': ('dark_wood', '1k'),
    'lacquer': ('lacquered_cherry_wood', '1k'),
    'rock': ('rock_06', '1k'),
    'cliff': ('cliff_side', '1k'),
    'sandstone': ('red_sandstone_wall', '1k'),
    'mossrock': ('mossy_rock', '1k'),
    'sand': ('coast_sand_01', '1k'),
    'coral': ('coral_ground_02', '1k'),
    'brick': ('brick_wall_09', '1k'),
    'asphalt': ('asphalt_02', '1k'),
    'pavement': ('concrete_pavement', '1k'),
    'facade': ('concrete_tile_facade', '1k'),
    'metal': ('metal_plate', '1k'),
    'rust': ('rusty_metal_02', '1k'),
    'dryground': ('dry_ground_rocks', '1k'),
    'bark': ('bark_brown_02', '1k'),
    'leaves': ('forest_leaves_02', '1k'),
    'concrete': ('concrete_floor_damaged_01', '1k'),
    'cobble': ('cobblestone_floor_08', '1k'),
    'sandbrick': ('white_sandstone_bricks', '1k'),
    'grass': ('leafy_grass', '1k'),
    'plaster': ('rough_plaster_03', '1k'),
}

MODELS = {
    # name: (poly haven id, sdf resolution, colour resolution)
    'bust': ('marble_bust_01', 128, 64),
    'lion': ('lion_head', 96, 48),
    'whale': ('bronze_whale_statue', 112, 48),
    'shark': ('bronze_shark_statue', 96, 32),
    'ship': ('dutch_ship_large_01', 128, 64),
    'moonrock': ('moon_rock_01', 64, 32),
    'hydrant': ('fire_hydrant', 64, 32),
    'streetlamp': ('street_lamp_01', 96, 32),
    'lantern': ('chinese_chandelier', 80, 48),
    'screen': ('chinese_screen_panels', 112, 64),
    'deadtree': ('dead_tree_trunk', 96, 48),
    'tree': ('island_tree_01', 96, 48),
    'boulder': ('boulder_01', 64, 32),
    'gnome': ('garden_gnome', 64, 32),
}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def cached(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        data = fetch(url)
        with open(path, 'wb') as f:
            f.write(data)
    return path


def files(asset_id):
    path = cached(f'https://api.polyhaven.com/files/{asset_id}', f'api/{asset_id}.json')
    return json.load(open(path))


def credit(asset_id):
    path = cached(f'https://api.polyhaven.com/info/{asset_id}', f'api/{asset_id}.info.json')
    info = json.load(open(path))
    return {'id': asset_id, 'name': info.get('name', asset_id), 'authors': list(info.get('authors', {}).keys())}


# ---------------------------------------------------------------- HDRIs
def build_hdri(name, pid, res):
    f = files(pid)
    src = cached(f['hdri'][res]['hdr']['url'], f'hdri/{pid}_{res}.hdr')
    img = cv2.imread(src, cv2.IMREAD_ANYDEPTH | cv2.IMREAD_COLOR)[:, :, ::-1].astype(np.float32)
    peak = float(np.percentile(img, 99.995))
    vmax = float(min(max(peak, 4.0), 512.0))
    k = 16.0
    enc = np.log2(1.0 + np.clip(img, 0, vmax) * k) / math.log2(1.0 + vmax * k)
    enc = np.clip(enc * 255.0 + 0.5, 0, 255).astype(np.uint8)
    path = os.path.join(OUT, 'env', f'{name}.jpg')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(enc).save(path, quality=94, subsampling=0, optimize=True)
    # dominant light direction (for analytic sun shading)
    lum = img.mean(axis=2)
    y, x = np.unravel_index(np.argmax(ndimage.gaussian_filter(lum, 4)), lum.shape)
    h, w = lum.shape
    phi = (x + 0.5) / w * 2 * math.pi - math.pi
    theta = (y + 0.5) / h * math.pi
    sun = [math.sin(theta) * math.cos(phi), math.cos(theta), math.sin(theta) * math.sin(phi)]
    return {'file': f'assets/env/{name}.jpg', 'max': vmax, 'k': k, 'sun': [round(v, 4) for v in sun],
            'credit': credit(pid)}


# ---------------------------------------------------------------- materials
def load_map(f, key, res, pid, gray=False):
    if key not in f:
        return None
    entry = f[key][res].get('jpg') or f[key][res].get('png')
    p = cached(entry['url'], f'tex/{pid}/{key}_{res}.jpg')
    im = Image.open(p)
    return im.convert('L') if gray else im.convert('RGB')


def build_material(name, pid, res):
    f = files(pid)
    diff = load_map(f, 'Diffuse', res, pid)
    nor = load_map(f, 'nor_gl', res, pid)
    rough = load_map(f, 'Rough', res, pid, True)
    ao = load_map(f, 'AO', res, pid, True)
    disp = load_map(f, 'Displacement', res, pid, True)
    size = diff.size
    rough = rough.resize(size) if rough else Image.new('L', size, 180)
    ao = ao.resize(size) if ao else Image.new('L', size, 255)
    disp = disp.resize(size) if disp else Image.new('L', size, 128)
    c = Image.merge('RGBA', (*diff.split(), rough))
    nr, ng, _ = nor.resize(size).split()
    n = Image.merge('RGBA', (nr, ng, ao, disp))
    d = os.path.join(OUT, 'mat')
    os.makedirs(d, exist_ok=True)
    c.save(os.path.join(d, f'{name}_c.webp'), quality=78, alpha_quality=70, method=6)
    n.save(os.path.join(d, f'{name}_n.webp'), quality=80, alpha_quality=70, method=6)
    return {'c': f'assets/mat/{name}_c.webp', 'n': f'assets/mat/{name}_n.webp', 'credit': credit(pid)}


# ---------------------------------------------------------------- models -> SDF volumes
def build_model(name, pid, N, NC):
    import trimesh
    f = files(pid)
    g = f['gltf']['1k']['gltf']
    base = f'model/{pid}/'
    gltf = cached(g['url'], base + 'model.gltf')
    for k, v in g['include'].items():
        cached(v['url'], base + k)
    scene = trimesh.load(gltf, force='scene')
    meshes = [m for m in scene.dump() if isinstance(m, trimesh.Trimesh) and len(m.faces)]
    allv = np.concatenate([m.vertices for m in meshes])
    lo, hi = allv.min(0), allv.max(0)
    center = (lo + hi) / 2
    half = (hi - lo).max() / 2 * 1.04
    # sample the surface densely with normals and texture colours
    total_area = sum(m.area for m in meshes)
    P, NRM, COL = [], [], []
    for m in meshes:
        n = max(2000, int(1_500_000 * m.area / total_area))
        pts, fi = trimesh.sample.sample_surface(m, n)
        P.append(pts)
        NRM.append(m.face_normals[fi])
        col = np.full((len(pts), 3), 200, np.uint8)
        vis = m.visual
        try:
            mat = vis.material
            img = getattr(mat, 'baseColorTexture', None)
            fac = np.array(getattr(mat, 'baseColorFactor', None) if getattr(mat, 'baseColorFactor', None) is not None else [255, 255, 255, 255])[:3]
            if fac.max() <= 1.0:
                fac = fac * 255
            if img is not None and getattr(vis, 'uv', None) is not None:
                tri = m.triangles[fi]
                bary = trimesh.triangles.points_to_barycentric(tri, pts)
                uv = (vis.uv[m.faces[fi]] * bary[:, :, None]).sum(1)
                arr = np.asarray(img.convert('RGB'))
                h, w = arr.shape[:2]
                px = (np.mod(uv[:, 0], 1) * (w - 1)).astype(int)
                py = ((1 - np.mod(uv[:, 1], 1)) * (h - 1)).astype(int)
                col = (arr[py, px].astype(np.float32) * fac / 255).astype(np.uint8)
            else:
                col[:] = fac.astype(np.uint8)
        except AttributeError:
            pass
        COL.append(col)
    P = (np.concatenate(P) - center) / half
    NRM = np.concatenate(NRM)
    COL = np.concatenate(COL)
    tree = cKDTree(P)

    def grid(n):
        a = (np.arange(n) + 0.5) / n * 2 - 1
        z, y, x = np.meshgrid(a, a, a, indexing='ij')
        return np.stack([x.ravel(), y.ravel(), z.ravel()], 1)

    G = grid(N)
    vox = 2.0 / N
    rng = vox * 10
    # narrow band: distances near the surface only
    dist, idx = tree.query(G, k=6, workers=-1, distance_upper_bound=rng * 1.2)
    fin = np.isfinite(dist)
    near = fin[:, 0]
    idx = np.where(fin, idx, 0)
    vote = np.einsum('ijk,ijk->ij', G[:, None, :] - P[idx], NRM[idx]) * fin
    inside_near = np.sign(vote).sum(1) < 0
    # far voxels: a flood fill from the grid border decides inside/outside
    far = (~near).reshape(N, N, N)
    lab, _ = ndimage.label(far)
    edges = np.concatenate([lab[0].ravel(), lab[-1].ravel(), lab[:, 0].ravel(), lab[:, -1].ravel(), lab[:, :, 0].ravel(), lab[:, :, -1].ravel()])
    border = np.setdiff1d(np.unique(edges), [0])
    far_inside = far & ~np.isin(lab, border)
    inside = np.where(near, inside_near, far_inside.ravel())
    d = np.where(near, dist[:, 0], rng * 2) * np.where(inside, -1, 1)
    q = np.clip(np.round(d / rng * 127 + 128), 0, 255).astype(np.uint8)
    dd = os.path.join(OUT, 'vol')
    os.makedirs(dd, exist_ok=True)
    q.tofile(os.path.join(dd, f'{name}_sdf.bin'))
    # colour volume (nearest surface colour, averaged)
    GC = grid(NC)
    _, cidx = tree.query(GC, k=6, workers=-1)
    cvol = COL[cidx].mean(1).astype(np.uint8)
    rgba = np.concatenate([cvol, np.full((len(cvol), 1), 255, np.uint8)], 1)
    rgba.tofile(os.path.join(dd, f'{name}_col.bin'))
    ext = ((hi - lo) / 2 / half).tolist()
    return {'sdf': f'assets/vol/{name}_sdf.bin', 'col': f'assets/vol/{name}_col.bin', 'n': N, 'nc': NC,
            'range': rng, 'extent': [round(v, 4) for v in ext], 'size': round(float(half), 4),
            'credit': credit(pid)}


# ---------------------------------------------------------------- title lettering
def google_font_ttf(family, weight):
    css = fetch(f'https://fonts.googleapis.com/css2?family={family.replace(" ", "+")}:wght@{weight}').decode()
    url = css.split('url(')[1].split(')')[0]
    return cached(url, f'fonts/{family.replace(" ", "_")}_{weight}.ttf')


def build_title():
    ttf = google_font_ttf('Cinzel', 900)
    W, H, S = 4096, 1024, 4
    out = {}
    lines = {'title': 'MULTIVERSE', 'the': 'THE MULTIVERSE?'}
    for key, text in lines.items():
        img = Image.new('L', (W, H), 0)
        dr = ImageDraw.Draw(img)
        size = 560 if key == 'title' else 400
        font = ImageFont.truetype(ttf, size)
        while True:
            bb = dr.textbbox((0, 0), text, font=font)
            tw = bb[2] - bb[0]
            if tw < W * 0.9:
                break
            size -= 10
            font = ImageFont.truetype(ttf, size)
        th = bb[3] - bb[1]
        # extra tracking between letters
        track = size * 0.06
        widths = [dr.textbbox((0, 0), ch, font=font)[2] for ch in text]
        total = sum(widths) + track * (len(text) - 1)
        if total > W * 0.94:
            track = (W * 0.94 - sum(widths)) / max(1, len(text) - 1)
            total = W * 0.94
        x = (W - total) / 2
        y = (H - th) / 2 - bb[1]
        qstart = 1.0
        for ch, cw in zip(text, widths):
            if ch == '?':
                qstart = (x - track * 0.5) / W
            dr.text((x, y), ch, font=font, fill=255)
            x += cw + track
        a = np.asarray(img) > 127
        inside = ndimage.distance_transform_edt(a)
        outside = ndimage.distance_transform_edt(~a)
        sd = (outside - inside) / S          # in output pixels
        small = cv2.resize(sd.astype(np.float32), (W // S, H // S), interpolation=cv2.INTER_AREA)
        enc = np.clip(small / 24.0 * 127 + 128, 0, 255).astype(np.uint8)   # +-24 px range
        path = os.path.join(OUT, 'ui', f'{key}_sdf.png')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        Image.fromarray(enc).save(path, optimize=True)
        out[key] = {'file': f'assets/ui/{key}_sdf.png', 'range': 24, 'w': W // S, 'h': H // S, 'q': round(qstart, 4)}
    return out


def main():
    only = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    mpath = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {'env': {}, 'mat': {}, 'vol': {}, 'ui': {}}
    if not only or 'env' in only:
        for name, (pid, res) in HDRIS.items():
            print('hdri', name, pid, flush=True)
            manifest['env'][name] = build_hdri(name, pid, res)
    if not only or 'mat' in only:
        for name, (pid, res) in MATERIALS.items():
            print('material', name, pid, flush=True)
            manifest['mat'][name] = build_material(name, pid, res)
    if not only or 'vol' in only:
        for name, (pid, n, nc) in MODELS.items():
            meta = os.path.join(OUT, 'vol', f'{name}.json')
            if os.path.exists(meta):
                manifest['vol'][name] = json.load(open(meta))
                continue
            print('model', name, pid, flush=True)
            manifest['vol'][name] = build_model(name, pid, n, nc)
            json.dump(manifest['vol'][name], open(meta, 'w'))
            json.dump(manifest, open(mpath, 'w'), indent=1)
    if not only or 'ui' in only:
        print('title', flush=True)
        manifest['ui'] = build_title()
    json.dump(manifest, open(mpath, 'w'), indent=1)
    print('done')


if __name__ == '__main__':
    main()
