# Reflection Viewer — project context

Read this first. Claude Code loads it automatically; it exists so a fresh session starts with
the context the original build accumulated.

## What this is

**The sister app to the baseline Artifact Viewer, not a replacement for it.** Both are kept, both
install, both run at once. This one rebuilds `LV_ReflectiveObjectCapture` instead of
`LV_BasicObjectCapture1`.

A photogrammetry scan stands on a pedestal **facing a sheet of dark acrylic**. The camera sees the
object's back directly and its front in the sheet's reflection, laid over an artwork printed on the
acrylic. The overlay of reflection and print is the piece; everything else is in service of it.

The two apps deliberately share their controls, their import pipeline and their gallery format, so
muscle memory and collections carry across.

| | Baseline viewer | This app |
|---|---|---|
| Directory | `../artifact-viewer-web/` | `artifact-reflection-web/` |
| Unreal level | `LV_BasicObjectCapture1` | `LV_ReflectiveObjectCapture` |
| Dev port | 5178 | **5179** |
| Preview port | 4178 | **4179** |
| IndexedDB | `artifact-viewer` | **`artifact-reflection`** |
| Bundle id | `edu.duke.noma.artifactviewer` | **`edu.duke.noma.reflectionviewer`** |
| PWA name | Artifact Viewer | **Artifact Reflection Viewer** |

Every one of those is deliberately different so the two coexist on one machine without colliding.
**Do not converge them.**

## Where things are

| What | Path |
|---|---|
| This project | `~/Documents/Duke/Artifact Work/artifact-reflection-web/` |
| Baseline viewer | `~/Documents/Duke/Artifact Work/artifact-viewer-web/` — its `PLAN.md` holds the shared background |
| Source FBX scans | `~/Documents/Duke/Artifact Work/PhotogrammetryFiles/FBX_Files/` (21 files, 3–16 MB) |
| Larger scans, no materials | `~/Documents/Duke/Artifact Work/PhotogrammetryFiles/No Material/` (incl. 111–137 MB) |
| Test images for prints | `~/Documents/Duke/Artifact Work/NOMA Images/` |
| Unreal project (authoritative) | `smb://aah-space-pap1.oit.duke.edu/shares/Arthist_305_733_Virtual_Museums_25F/Nicole_Quinn` → `NOMA General/NOMA Unreal/Artifact_Setup/` |
| Unreal project (stale local copy) | `~/Documents/Duke/Artifact Work/NOMA Unreal/` — March, do not trust |

Paths contain a space — quote them. The user runs Unreal on a **separate Windows machine**.

**The SMB share needs Duke network and a Finder mount.** `mount_smbfs -N` fails with an auth error
because no credential is in the keychain; there is no way to mount it from a shell without the
user's NetID password. Ask them to mount it in Finder (`Cmd+K`, the URL above) and say when it is
up. Do not try to prompt for credentials.

## Status

Working: acrylic sheet with real planar reflection and print compositing, reflection sharpness
falling off with distance from the sheet, 13 camera presets +
click-drag orbit fenced to the front half-space, sheet width / mount height / gap in cm, reflectance
/ surface finish / print brightness, the white gallery room (the only one), pedestal in cm, stepped rotation,
scale, front light, drag-and-drop import of both objects and prints, IndexedDB library with a
two-tab gallery, gallery export/import as `.zip` carrying objects *and* prints *and* the staging,
PWA offline install, Tauri Mac app.

**BM42–49 iteration (2026-10-20), from Nikki's 10/8 notes and `BM38-49_EdicionJM-opt.pdf`:**
two objects (slots A and B), each with its own pedestal and an optional base (riser) on top;
a floor plinth under everything; a white-wall room; drag an object to move it (Shift-drag
turns), arrows nudge; a **Stage** panel (top left) with typed cm for sheet H × W, mount height,
plinth, and each object's position, true height, pedestal and base; and the eight BM42–49
stations staged straight from the install plan. The sheet's height can now be pinned (the print
is then cover-cropped); objects with a known real height render at true scale.

Verified with `verify-reflection.mjs` (17/17), `verify-import.mjs`, `verify-packaging.mjs` and
`verify-stage.mjs` (56/56) and `verify-seed.mjs` (10/10).

Not done: no thumbnails, no decimation *in the app* (big scans are shrunk offline — see below),
and the print does not respond to scene lighting (see Known gaps in the README).

**Scene values in `src/scene/presets.ts` are reconstructions, not the real Unreal values.** The
level has 13 `CineCameraActor`s and a RectLight rig whose transforms, FOV and intensities should
replace them verbatim once captured. It is all plain data so the swap touches one file.

**The published gallery starts empty on purpose.** Museum scans are gitignored — they belong to the
collection. Collections travel as exported `.zip` files. Baking artifacts into the build is a
collection-rights decision; do not do it without asking.

**Local builds start with the BM38–49 pairing set; the published site does not.** Since
2026-10-20 the starter gallery is every scan and print the stations use (7 objects, 12 prints, all
in `public/seed/stations/`, gitignored). `src/library/seed.ts` derives the list from `STATIONS` —
there is no `seed.json` any more — imports it once per browser (`localStorage` `seed-loaded-v2`),
then opens on BM38. A browser that had the v1 starter gallery (four NOMA scans) has exactly those
four removed by name and the pairing set added; anything the curator added stays. GitHub Pages
builds from the repo, where the folder does not exist, so the public gallery stays empty — seeding
is local-only until the museum clears scans for public release (decided with Nikki 2026-09-24).
Clear both seed keys and the database to reseed. Every verify script sets both keys first, or a
fresh profile imports the whole set underneath the test.

**The station assets live in `public/seed/stations/` (gitignored, ~65 MB).** They are not seeded;
choosing a station in the Stage panel imports what it needs on demand and reuses it after. Prints
are the BM42–49 images from Box › `01_SIGNATURE-PROJECTS/BlackMirror_Images-and-Pairing-Index/`,
resized to 4096 px. Scans come **only** from the Pluriversal Studio folder (Nikki's rule):
`3DWorks-and-Facsimiles_MuseoDeAmerica_2026/MAM_PluriversalStudio[PS]/`. Those GLBs are ~130 MB,
4M triangles, 8K textures — far too heavy for a scene drawn twice a frame — so they are shrunk
offline, originals untouched (renamed `MAM_<catalogue>.glb`):

```bash
npx gltf-transform optimize "<PS>/1985_01_128.glb" public/seed/stations/MAM_1985_01_128.glb \
  --compress false --texture-compress webp --texture-size 4096 \
  --simplify-ratio 0.04 --simplify-error 0.0005      # → ~11 MB, ~260K tris
```

`--compress false` because the loader has no Draco/Meshopt decoder; WebP textures load natively.
The PS scans are in **real metres** (glTF spec), so import records their height and they stand at
true size. **Several are filed under a different number than the plan prints, or are placeholders
in it, so pairings were matched by the plan's own photo of each object:** BM38 → 01425, BM43 →
1981_04_113 + 1981_04_049, BM45 → 1985_01_128, BM46 → 1985_01_118, BM47 → 1985_01_106, BM48's
painted figure → 2002_05_032. No scan anywhere in Signature Projects for BM39, 40, 41, 42, 44, BM48's
dog vessel or BM49 (the GDH and Factum Arte folders hold STLs / nothing) — those pedestals stand
empty and the station says why. BM39's print exists only as a PSD; `sips` converts it.

**Seed filenames must be NFC and the URL built with `encodeURI`.** Box hands macOS decomposed
accents (Fábula, bufón) and the plan's names have commas ("106,5x82,5cm"); Vite decodes paths
with `decodeURI`, which leaves `%2C` encoded, so `encodeURIComponent` silently 404s into
index.html.

## Architecture

```
src/
  scene/
    Acrylic.tsx        the sheet: planar reflection pass + print compositing shader
    panelGeometry.ts   sheet dimensions (derived or pinned height), plinth depth
    Studio.tsx         room, only ever in front of the sheet
    Pedestal.tsx       Stand (pedestal + base, per slot) and Plinth — translate only, never rotate
    ArtifactMesh.tsx   one per slot; true height or auto-fit; invisible grab box
    DragMove.tsx       drag to move / Shift-drag to turn; grab.ts is its hit-test registry
    rig.ts             offset that carries lights + camera presets to where the objects are
    Lighting.tsx  Environment.tsx  CameraRig.tsx
    presets.ts         every camera / light / sheet / pedestal / plinth value, as plain data
  import/     loadModel.ts (all formats), useImport.ts, DropZone.tsx
  library/    db.ts (IndexedDB), models.ts, artworks.ts, galleryFile.ts (zip), GalleryPanel,
              stations.ts (BM42–49 from the install plan)
  ui/         keybinds.ts, StagePanel.tsx (typed cm)
  store.ts    Zustand — slots A/B (object, position, pedestal, base), plinth, sheet, optics
```

Parsed `THREE.Group`s live in `library/models.ts` and decoded print textures in
`library/artworks.ts`, deliberately **outside** React state — they are large mutable objects and
putting them in the store re-renders the tree on every import. The store holds metadata only.

State is in **centimetres** to stay comparable with `BP_AdjustablePedestal`; three.js works in
metres. `src/lib/units.ts` converts at the boundary.

**Everything per-object is in a slot.** `slots.A` always exists; `slots.B` is in the scene when
`twoUp`. Keys and the Stage panel act on `active`. A slot's `objectIndex` points into `artifacts`
(-1 = empty pedestal). Heights stack: plinth (when on) → pedestal → base → object; the sheet's
`bottomCm` also measures from the plinth top, as the install plan's elevations do.

**The rig follows the subject.** Lights and camera presets were authored around one object at
`RIG_ORIGIN`; `rig.ts` offsets them by where the live objects actually are. Zero in the default
scene, which is why `verify-reflection.mjs`'s fixed pixel regions still hold. Lights follow live;
the camera only re-aims when a preset is chosen or a station applied (`camNonce`), so a drag
never drags the view.

**Gallery files stayed at format version 1.** The slot/plinth fields are optional additions, and
the v1 single-object fields are still written from slot A, so older builds can open new files.

**Moving a stand needs confirming.** A click on a pedestal, base or object sets `moveAsk` (white
outline via drei `Edges` + an `Html` "Move pedestal?" prompt); Move sets `moveUnlocked`, and only
then does DragMove claim the press. A press on a locked stand is left to OrbitControls, and only a
still click (< 5 px) asks. Arrows ask too; Esc, Done or a click on empty space locks. Shift-drag
turning, G, and typed Stage values are deliberate and stay ungated.

**Recommended objects follow the print.** `useRecommendations()` (stations.ts) finds the station
whose `BMxx_` print is on the sheet — else the last staged one — and its objects lead both the
Stage panel's Object dropdown and the gallery's Objects list as "Recommended — …", or
"Recommended A / B — …" for two-object pairings. Objects with no scan are listed greyed, with a
distinct option value so an empty pedestal never displays as one.

**There is one room: the white gallery** (Nikki, 2026-10-25 — "no option to have a scene or
background other than the white"; the grey floor and white walls are approved). The void /
gallery / reveal rooms and the B key are gone; galleries saved in them open white. It is tuned
for marketing stills: warm off-white paint (`#dbd7cf`, never `#fff`), concrete floor with a faint
sheen, pedestals a step darker than the wall, low flat fill (env 0.2), exposure 0.95, and two
warm `WALL_WASH` rect lights high on the wall for the pool-and-falloff of track lighting.

**`verify-reflection.mjs` reads the white room, not a black one.** A bare sheet mirrors the walls
(luma ~97, not 0), the object's reflection is a *darker* shape on it, and raising reflectance
*brightens* the print patch as the walls take over. Its checks are stated that way; don't
"fix" them back to black-room assumptions.

**Every corner panel reduces to a chip:** Stage and Gallery tabs, the lower-left readout (click
its camera line, as in the Pair Viewer), and the lower-right notes box (–).

**Brightness is the baseline viewer's slider**, ported: five steps in `LIGHT_LEVELS`, one
multiplier on the rect rig, the shadow spot and the wall washes (not the environment). Steps are
×0.12 / 0.3 / 0.45 / 0.6 / 0.8 of the authored rig (Nikki, 2026-10-21); default is the middle.

**Snapshots: I or the camera button (right edge).** `scene/Snapshot.tsx` renders a fresh frame and
reads it back in the same task (no `preserveDrawingBuffer`). Files and gallery exports both go
through `lib/saveFile.ts`: a download in the browser, the native Save panel in the Mac app
(`choose_save_path` / `write_saved_file` in `src-tauri/src/lib.rs`, from the baseline viewer —
an `<a download>` does nothing in the app's WebKit window).

**Camera presets run as one sweep** (right side outward → centre → left side outward), and
CameraRig blends along an arc about the subject with time scaled to the angle — so C never
throws the camera side to side. Grazing is index 4 now, not the last.

**Saved setups** (Stage panel) live in the IndexedDB `setups` store (DB version 2), are the
gallery's `SceneSettings` plus the object/print **ids** (not indices — the library reorders), and
ride along in gallery exports as optional `manifest.setups`.

## The layout, which everything else assumes

The sheet's front face is the world plane **z = 0**, facing +z. The object stands at `+gapCm` in
front of it, the back wall 8 cm behind it, and the camera is fenced into the +z half-space. Nothing
is modelled behind the sheet: the mirrored camera renders from back there looking out, so geometry
behind the plane is paid for twice a frame and never seen.

## Gotchas — all of these cost real time to find

**The acrylic — read before touching `Acrylic.tsx`**
- **The reflection pass must run at `useFrame(cb, -1)`.** Negative priority runs before R3F's own
  render and leaves auto-rendering alone; only a *positive* priority takes over the render loop and
  would blank the canvas.
- **Update world matrices by hand at the top of the pass.** R3F has not done it yet this frame, so
  anything that moved gets mirrored from its previous position.
- **The sheet must be `visible = false` during its own pass**, or it renders into its own reflection.
- **Rendering into a render target skips tone mapping and output encoding.** The reflection texture
  is therefore raw linear radiance — which is what you want, but it means the sheet's shader has to
  end with `<tonemapping_fragment>` and `<colorspace_fragment>` itself or the whole panel is wrong.
- The target is `HalfFloatType` so highlights on a lit object do not clip before compositing.
- **`transmission` in `ACRYLIC` is the number that makes or breaks the piece.** Without it the print
  composites at full photographic brightness and buries the reflection. See its comment.
- Oblique near-plane clipping is not optional: without it the pedestal leaks in from behind the
  mirror plane and floats in the print.
- **The blur radius is per-pixel, driven by the reflection pass's own depth buffer.** The oblique
  clip puts the near plane on the sheet, so that depth already measures distance *past* the sheet;
  `travelPastSheet` turns it into metres with `t = d·L / (1−d)`, where L is the camera's distance to
  the fragment. The mirrored camera is the real one reflected, so L is the same for both — which is
  what makes the sharpness hold still while you orbit and change only when the object actually
  moves. `ACRYLIC.blurDistanceM` is how far that scatter takes to reach full radius.
- The reflection target therefore needs a `DepthTexture` attached, not just `depthBuffer: true`.
  Cleared depth is 1, which sends travel to its ceiling and blurs the empty room out — correct,
  not a special case.
- `polish` is now the radius reached at full distance, not a flat blur over the sheet. A mirror
  finish stays sharp at every distance, which is what a mirror finish means.

**Rendering**
- `RectAreaLightUniformsLib.init()` must run once or every rect light renders black.
- **`RectAreaLight` cannot cast shadows** in three.js. The look and the shadowing are split: the
  rect rig shapes, a separate targeted `spotLight` casts.
- **A `spotLight` with no `target` aims at the world origin**, which lights the pedestal instead of
  the object and flattens the composition.
- **Dielectric specular does not scale with albedo.** A near-black pedestal still throws a bright
  lobe off its top face, and every camera preset here is at an angle that catches it — unlike the
  baseline viewer's head-on default. Roughness alone does not fix it; `specularIntensity` does.
- There is no global illumination. The `bounce` light is a hand-placed stand-in for Lumen's bounce.

**Model loading** (shared with the baseline viewer)
- **glTF defaults `metallicFactor` to 1.0.** Exporters omit it, so a scan renders as a black mirror.
  `normalizeMaterials` forces everything to dielectric.
- **FBXLoader produces `MeshPhongMaterial`**, which is not lit by `RectAreaLight` and ignores
  `scene.environment`. Converted to `MeshStandardMaterial` on import.
- **Texture images load asynchronously** even when `parse()` returns synchronously. Sidecar blob
  URLs are held for the model's lifetime and revoked in `dropModel`.
- **Auto-fit is load-bearing.** Files arrive in arbitrary units, orientations and pivots.
- **Only 14 of the 21 files in `FBX_Files/` embed their texture.** The rest reference an absolute
  `X:/…` path and import grey. Fix: drag the model and its `.jpg` in together.

**Import routing — the rule that makes two file types work on one drop target**
- A drop **containing a model** → images in it are that model's sidecar textures.
- A drop of **images only** → they are artworks to print on the sheet.
- The drag overlay reads `dataTransfer.items[].type` to say which it will do *before* the drop.
  Filenames are not exposed during a drag, only MIME types.

**Testing**
- `verify-reflection.mjs` is the one that matters. **A planar reflection that silently renders black
  still produces a perfectly plausible dark studio shot**, so it samples pixels out of the region
  where the reflection lands and asserts the numbers move the way each control claims.
- Isolate the reflection by turning the print off first. With the print on, raising reflectance
  makes the sheet *darker* — correct Fresnel, but it will read as a failing test if you assert
  naively.
- **SwiftShader crashes intermittently** under the doubled render load. A `TargetCloseError` on the
  first run is usually not a real failure; re-run before investigating.
- Headless Chrome's `--virtual-time-budget` fires before a 5 MB GLB decodes. Use the puppeteer
  scripts, which wait on real state.
- IndexedDB is shared across pages in one browser — the scripts clear `artifact-reflection`.

**Environment**
- Node is at `/usr/local/bin` and not on the default PATH. Prefix commands with
  `export PATH="/usr/local/bin:$PATH"`, and add `$HOME/.cargo/bin` for Tauri.
- **Vite HMR does not reliably apply Zustand store changes.** After editing `store.ts`, hard-refresh.
- `cd "~/path"` does not work — a tilde inside quotes is not expanded. Use full paths.

**Tauri**
- **`dragDropEnabled` must stay `false`.** Tauri's native file-drop handler swallows drops before
  the page sees them, which breaks the headline feature.
- **Run `cargo clean` in `src-tauri/` after moving the project** — Cargo bakes absolute paths in.

## Commands

```bash
export PATH="/usr/local/bin:$HOME/.cargo/bin:$PATH"

npm run dev                  # dev server on 5179
npm run build                # static site -> dist/  (includes PWA service worker)
npm run preview              # serve the build on 4179 — needed to test PWA install
npx tauri build              # Mac app -> src-tauri/target/release/bundle/macos/
npx tsc -b                   # typecheck
node scripts/make-icons.mjs  # regenerate the PWA icons

node scripts/verify-reflection.mjs ./shots    # THE one: reflection, print, sheet controls
node scripts/verify-import.mjs ./shots        # import, cycle, reload, remove
node scripts/verify-packaging.mjs ./shots     # export/import + offline (needs preview on 4179)
node scripts/verify-stage.mjs ./shots/stage   # stations, confirm-to-move, setups, typed cm (needs public/seed/stations)
node scripts/verify-seed.mjs ./shots/stage    # pairing set preloads, v1 seed migrates, once only
```

Always typecheck and re-run at least `verify-reflection.mjs` after changes; it catches rendering
regressions that typechecking cannot.

## Conventions

- Scene/light/camera/sheet/pedestal values live as plain data in `src/scene/presets.ts`, never
  inline in components, so the real Unreal values can be dropped in without touching logic.
- Keybindings mirror the baseline viewer and the Unreal `BP_KeyboardControls` legend exactly
  (C O R P H K L V F, Shift to reverse, Tab for help — B, the old room cycle, is gone). The additions are all the acrylic:
  **I** snapshot · **T** second object · **1**/**2** active object · **E** base · **Y** plinth · **arrows** nudge ·
  **A** print · **G** gap · **N** sheet width · **M** mount height · **Z** reflectance ·
  **U** surface finish · **X** print brightness.
- The gallery is deliberately **not** on a key — it lives behind a permanent tab so it is
  discoverable without knowing a shortcut.
