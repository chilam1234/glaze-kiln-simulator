# Glaze Kiln v3: browser pottery glaze simulator

**Live demo:** https://chilam1234.github.io/glaze-kiln-simulator/

`dist/glaze-kiln.html` is a single-file offline copy of the same app (open it locally with no server or internet).

No build step. Serve the folder and open it:

    cd /workspace/glaze-sim && python3 -m http.server 8765   # then http://localhost:8765/

three.js r165 is vendored in `vendor/` and loaded through the import map in index.html, so it works offline.

- `js/pot.js`: lathe profiles (cylinder, bowl, vase, plate, chawan, bottle, jar, mug, plus a Custom silhouette) with foot ring, rim, inner wall and throwing ridges; optional C-loop / side handle and pouring-lip / teapot spout; arc-length UVs;
  per-row curvature -> edge (convex) and cavity (concave) maps, gravity direction/steepness, wax line.
- `js/shape.js`: custom profile (quadratic nodes + bulges), extract-from-preset, capacity in ml.
- `js/glazes.js`: glaze library (raw colour, fired colour/opacity/roughness stops by thickness, fluidity, crackle,
  speckle) and pair interactions (overlap colour and halo line).
- `js/grid.js`: texture size shared by the pot and the kiln thread.
- `js/sim.js`: UV-space state (a thickness map and a paint-order stamp map for each glaze), brush/pour, raw composition,
  firing (melt leveling, long-range 1D gravity redistribution, drips/runs, 2D sheet flow, fired composition).
  `fire()` runs on a module worker (`js/fire-worker.js`) so the pot can still be orbited; the page thread is the fallback.
  After a firing, `__sim.engine` is `"worker"` or `"page"`. Seed, cone, and `dripStats` stay the stable result.
- `js/material.js`: MeshPhysicalMaterial patch with object-space Voronoi crackle, iron/carbon speckle, kiln glow.
- `js/main.js`: scene (RoomEnvironment PMREM, soft shadow), UI, input, firing animation, `window.__sim` test hook.
- `js/webgl.js`: WebGL2 probe (performance caveat on, then off), software-renderer detection, reduced-quality mode, and the no-GPU help overlay. three.js r165+ is WebGL2-only; a missing context never throws.
- `tests/verify.py`: headless-Chrome (SwiftShader) verification that writes `shots/`. `tests/lookdev.py`: scripted look-dev.
- `tests/verify_perf.py`: fire and drag timings (desktop, iPhone 13, 4× CPU throttle).
- `tests/verify_webgl.py`: normal / `--disable-gpu --disable-software-rasterizer` / `--disable-webgl` / simulated context loss.

## Performance
Dragging profile, handle, or spout nodes rebuilds a low-res preview on `requestAnimationFrame` and the full mesh on release. Sliders use the same preview path. Fire runs the melt on the kiln worker without yielding, overlaps the heat glow with the simulation, and shows a progress bar. Pixel ratio is capped (1.25 on a phone, 1.5 on desktop, 1.0 in reduced mode). Old geometries and pick materials are disposed.

## No GPU / software rendering
The app tries WebGL2 with `failIfMajorPerformanceCaveat`, then WebGL2 without the caveat (SwiftShader and other software renderers). Software rendering keeps a reduced-quality pot (no shadows, simpler shading, lower resolution). If no context can be created, a help overlay explains how to turn hardware acceleration on in Chrome (`chrome://settings/system`) and Safari, and `__sim` is still installed so the page does not throw. `webglcontextlost` is prevented and `webglcontextrestored` re-uploads textures.

## Drips / firing seed
Each Fire uses a new random seed, so the drip layout changes every time. To pin it, use `?seed=123` in the URL, or
`__sim.setSeed(123)` (`__sim.setSeed(null)` goes back to random). After a firing, `__sim.seed` gives the seed used and
`__sim.dripStats` gives the counts (sources, drips, forks, merges); both also go to the console.
`tests/verify_drips.py` makes `shots/drips-*.png`.
`tests/verify_drips2.py` (same flow, seed 20260926) makes `shots/drips2-*.png`: rounded bead tips, soft drip edges, old-vs-new close-up, plus tenmoku-over-shino and ash-over-cobalt checks.

## Custom shapes
A ninth **Custom** option in the Pot panel copies the current preset's outline (foot → optional middle nodes → rim, quadratic bulges between them) so you can drag it. Red nodes and grey bulge handles sit on the pot while you edit (desktop always; on a phone, switch the touch bar to **Shape**). `+` / `−` add or remove up to twelve middle nodes; tap or double-click the outline to insert a node at that height, or select a node and press **Delete** (the Delete key, the Pot-sheet button, or the on-canvas Delete node control). Sliders set height, rim, foot and wall in centimetres (wall 0.3–2.0 cm). Rim, middle-wall and base/floor thickness can be set separately, with an optional taper from base to rim; the inner surface, rim lip and capacity update live. Live capacity is millilitres of the inner volume (from the inner floor, not the foot cavity). Handles: none / C-loop / side, with height/width/thickness; the handle stays opposite the spout. Spouts: none / pouring lip / teapot. A teapot spout has height, around-the-pot rotation, tilt, length and opening sliders, plus blue (root) and yellow (mouth) on-canvas grips in Shape mode — drag the root up the wall, drag the mouth to change length and angle together. The root stays buried and thick, tapering to an open pouring lip. The **Foot** tab (a phone sub-tab; a stacked section on desktop) picks a 明腳 visible or 暗腳 hidden foot: visible foot ring, raised foot ring, pedestal/stem, hidden foot ring, recessed foot, or flat base. Sliders set foot height, outer diameter (the same Foot Ø as the Pot tab), ring thickness, underside carve, and — for a pedestal — stem width and base flare. The foot is generated from the bottom of the body profile so the join stays smooth; the pot rests on the table at the lowest point of the foot; the underside recess is visible from below. Glaze and drips stop short of a bare clay ring at the contact. Optional **Cross-section drawing**. Glaze already on the pot is remapped by height when the silhouette changes. Shape editing is locked after firing until **Unfire** (same as painting). Brush, pour, drips and cone 6 / cone 10 all run on the new wall, handle, spout and foot.
`tests/verify_custom.py` sets a custom bowl with handle and spout, paints, fires both cones, checks spout placement (height, tilt, length, mouth, around-pot), Delete-key node removal, each of the six foot styles on desktop and iPhone, wall thickness (range, per-zone, taper, rim and section, live capacity), a phone Shape-mode drag of the spout grips, outline-tap node insert, a wide rim on a tall pot, and writes `shots/custom-*.png`.

## Single-file build (open by double-click, no server, no internet)
    python3 tests/build_single.py      # -> dist/glaze-kiln.html
This uses esbuild to bundle `js/main.js` together with three.js, OrbitControls and RoomEnvironment into one minified
IIFE, then inlines that bundle and `css/style.css` into a copy of index.html. esbuild is looked up in `$ESBUILD`, then
`/workspace/.tools-esbuild`, then PATH, and `npx esbuild` is the fallback. The source files are not changed. Rebuild
after every source change. `tests/verify_single.py` opens the file over file://, paints one real stroke, fires, and
saves `shots/single-file-after.png`.

## UI palette
The chrome is a two-ink editorial log on pale beige paper (`#F5F1E8`): cobalt `#2148B8` for type, rules, and tools,
terracotta `#C65F38` only on Fire. Glaze chips keep their real colours. No remote fonts (a system serif for the title,
a system mono for the record). The pot sits on the same paper. `tests/verify_amaco.py` still writes `shots/amaco-*.png`.

## Glaze library (v3: 21 glazes)
The picker groups glazes by family (Whites & neutrals, Blues & greens, Warm & bright, Dark & metallic) in a scrollable
grid. Each swatch shows raw colour | fired colour, and the line under the grid gives the selected glaze's loose inspiration.
Names are generic. None of them claims to be an actual AMACO product; notes like "like PC Blue Rutile" only say what
the look is modelled on.
Original 8: Celadon, Tenmoku, Shino, Crackle, Matte White, Cobalt, Copper Red, Ash.
Added: Blue Rutile, Turquoise, Seaweed, Chartreuse, Bright Yellow, Orange, Amber Honey, Iron Red, Rose Pink, Plum,
Oatmeal, Black Matte, Bronze (metallic).
Optional glaze fields: `family`, `like`, `transl` (translucency as a top coat), `float` (how readily it breaks into the
colour below), `rutile`, `iron`, `breakCol` (edge/rim colour), `vari` ({type: rutile|mottle|float, col, amt}), and
`metal` (written to props.b, which drives the material's metalnessMap).

## Two-glaze mixing (any pair, layer order matters)
`composeFired` runs a general layering model for every overlapping pair. The hand-tuned `PAIRS` still override the
reaction colour and halo. The model:
- Veil and translucency: the top glaze filters the one below it with its own hue. A translucent top (celadon, amber,
  crackle) keeps showing the base stained through it. An opaque top hides the base except where it's thin.
- Flux: in an overlap the melt runs about 2.8x as far (`1 + 1.8*mix`, used in both the sheet flow and the drip sources), so
  overlap zones throw more drips.
- Floating: the top glaze opens into blotches that follow the downhill streaks, with a lace of top colour around Voronoi
  cells of the base colour. Rutile tops break into streaks instead. Each pair samples the noise at a different
  rotation. How much it floats depends on the top's `float`, how mixed the two layers are, and how thin the top coat is.
- Reaction colour: a saturated geometric mean of the two colours. Iron-rich bases (tenmoku, iron red, black, bronze)
  under rutile or floating tops give gold-brown instead, plus extra rutile streaks. It shows as rims around float cells,
  a tint over the mixing zone, and (for non-override pairs) a pale opalescent band where the top feathers out.
- Gloss: the fluxed overlap is glossier than either glaze, so matte under glossy comes out satin to gloss. Metallic
  tops keep their shine except inside float cells.
`tests/mix_tiles.py mix` -> `shots/mix-grid.png`: each pair both ways (A over B, B over A) on cylinder test tiles.
`tests/mix_tiles.py colors` -> `shots/colors-grid.png`: every new glaze fired alone on a jar.
`tests/verify_mix.py` checks the single file: picker (`shots/palette-ui.png`), a real mouse-drag stroke, fire, a
3-glaze showcase vase (`shots/mix-vase.png`), and console errors.

## Colours matched to real AMACO glazes (v3.1)
20 of the 21 glazes are now named after, and coloured from, a real AMACO glaze (for example "Blue Rutile PC-20"). The
glaze info line shows the source product. Ash has no reasonable AMACO equivalent and stays generic. The UI footer says:
"Glaze colors approximated from AMACO product photos. Not affiliated with AMACO."
- References: shop.amaco.com product photos, and the Sheffield Pottery AMACO PC chart (cone 6 and cone 10 test cups:
  https://www.sheffield-pottery.com/pages/amaco-pc-glaze-chart-for-cone-6-and-cone-10). Matches target cone 6.
- `ref/` (git-ignored, never bundled) holds the downloaded photos and `ref/samples.json` (sampled hex values per region,
  including cone 10). `tools/amaco_refs.py` is the match table and sample regions. `tools/sample_refs.py` samples the
  photos (backdrop masked, highlights trimmed, median / dark band / light band / 3-means). `tools/calibrate.py` compares a
  rendered test cylinder with the reference median and scales that glaze's colours (one damped step per run).
- `tests/amaco_match.py` renders `shots/amaco-match-1..3.png`: reference crops (source labelled) next to our fired glaze.
