# Reflection Viewer

A museum artifact viewer where the object faces a sheet of **dark acrylic**. You see the object
directly, and its reflection laid over the artwork printed on the sheet.

This is the **sister app** to the [Artifact Viewer](../artifact-viewer-web/), not a replacement.
Both are kept, both install, and both can run at the same time — they use different ports,
different browser storage and different bundle identifiers on purpose. It rebuilds
`LV_ReflectiveObjectCapture` from the Unreal project, where the baseline app rebuilds
`LV_BasicObjectCapture1`.

## The idea

The object rests **turned to face the sheet**. So the camera sees its back, and the sheet's
reflection carries its front — the two halves of the same object, at once, with the artwork
between them.

What the surface shows is one equation:

```
what you see  =  print × (1 − F)  +  reflection × F        F = Fresnel(viewing angle)
```

Head-on, `F` is a few percent: mostly artwork, with a ghost on it. From the side, `F` climbs toward
1 and the sheet becomes a mirror. **Walking around the piece is what makes it work**, which is why
every camera preset is off-axis and why free orbit is fenced to the front of the sheet.

That also means the reflection has to be a *real* planar render, not an environment map. It has to
show this object, at this distance, with correct parallax against the print behind it.

**Distance decides sharpness too.** Reflection blur is not a property of the surface on its own —
scatter accumulates along the distance the reflected ray travels, which is why an object pressed
against acrylic reads razor sharp while the far wall behind it is a smear. The sheet measures that
distance per pixel and blurs accordingly, so bringing the object toward the sheet with `G` brings
its reflection into focus. The finish (`U`) sets how hard the sheet scatters; distance sets how much
of that scattering has had room to happen.

## Running it

```bash
export PATH="/usr/local/bin:$PATH"     # node lives here, not on the default PATH

npm install
npm run dev        # http://localhost:5179
```

The baseline viewer uses 5178, so both can run side by side.

To test it as an installed app — which needs the service worker, and so needs a real build:

```bash
npm run build
npm run preview    # http://localhost:4179 — then use the browser's Install button
```

## Adding things

Drag files onto the window. **A drop means one of two things, and the overlay tells you which
before you let go:**

| You drop | It becomes |
|---|---|
| A model, on its own or with images | An **object** to stand in front of the sheet. Images in the drop are its textures. |
| Images, on their own | **Artwork**, printed on the acrylic. |

That split exists because most museum scans embed their texture, but a few reference an absolute
`X:/…` path from the exporting machine and import grey — for those, dropping the `.fbx` and its
`.jpg` together has to keep meaning "here is the texture". An image on its own is unambiguous.

Objects: `.fbx` `.glb` `.gltf` `.obj` `.stl` `.ply` `.usd`. Artwork: any image the browser reads.

**The sheet is cut to the artwork.** Its height is not a control — the print's aspect ratio decides
it and you set only the width, which is how a print is actually ordered.

## Controls

Shift reverses any adjustment. The first group is identical to the baseline viewer and to the
Unreal `BP_KeyboardControls` legend, so muscle memory carries over.

| Key | Object |
|---|---|
| `C` | switch camera view (13 presets) |
| `O` | cycle object |
| `R` | rotate 30° |
| `P` | object scale |
| `H` `K` `L` | pedestal height / width / length |
| `V` | show / hide pedestal |

| Key | The acrylic |
|---|---|
| `A` | cycle print — includes a bare-sheet slot, so this both changes the print and takes it off |
| `G` | gap between object and sheet |
| `N` | sheet width |
| `M` | mount height |
| `Z` | reflectance — how mirror-like the sheet is |
| `U` | surface finish — polished through to frosted; sets the blur reached at distance, not a flat blur |
| `X` | print brightness |

| Key | Room |
|---|---|
| `B` | background — void / gallery / reveal |
| `F` | front light on / off |
| `Tab` | this legend |

Click and drag to revolve, scroll to zoom. The gallery is deliberately **not** on a key — it sits
behind a permanent tab in the top-right corner, so it is discoverable without knowing a shortcut.

`F` is a curiosity: `BP_PhotoViewerController` already defines `FrontLight`, `bFrontLightOn` and
`SavedFrontIntensity` but binds them to no key, and the light itself lives in this level rather than
the baseline one. The logic was there, dormant. It is reproduced here, off by default.

## Staging a piece

The two dials that decide whether the overlay reads are `Z` and `X`.

- A **dark object against a bright print** disappears. Push `X` down, or `Z` up.
- A **bright object against a dark print** swamps it. The reverse.
- Moving the camera round with `C` does more than either: reflectance is a function of angle, and
  the difference between preset 11 (`Print`, nearly square to the sheet) and preset 13 (`Grazing`,
  almost in its plane) is the difference between an artwork with a ghost and a mirror.
- `G` does two things at once. It changes how far the reflection sits behind the sheet's surface,
  and so how much parallax separates it from the print as you move — close in they lock together,
  far out they slide. It also changes how *sharp* the reflection is, because scatter accumulates
  over the distance travelled: at 8 cm the reflected object is nearly as crisp as the object itself,
  by 120 cm it is a soft presence behind the artwork. If the overlay is not reading, `G` is often a
  better answer than `Z` — a sharp reflection survives against a print that a bright blurry one
  cannot.

## Sharing a collection

A staged pairing exports as a single `.zip`: every object, every print, and the geometry and optics
between them. In this setup the *pairing* is the work — an object in front of a particular print at
a particular gap — so shipping one without the other loses the thing being shared.

Gallery tab → **Export gallery**. On another machine, **Import gallery**. The models and images are
also readable straight out of the `artifacts/` and `artworks/` folders inside the zip.

**The gallery starts empty on purpose.** Museum scans belong to the collection and are gitignored,
so a public repo cannot make them downloadable. Collections travel as these zips instead.

## Checking it still works

```bash
node scripts/verify-reflection.mjs ./shots    # the one that matters
node scripts/verify-import.mjs ./shots        # import, cycle, reload, remove
node scripts/verify-packaging.mjs ./shots     # export/import + offline (needs preview on 4179)
```

`verify-reflection.mjs` measures pixels rather than just taking screenshots, because **a planar
reflection that silently renders black still produces a perfectly plausible dark studio shot.** It
samples the region where the reflection lands and asserts that each control moves the numbers the
way it claims to.

SwiftShader crashes now and then under the doubled render load — a `TargetCloseError` on the first
run is usually not a real failure. Re-run before investigating.

## Known gaps

- **The print does not respond to scene lighting.** The sheet runs a custom shader that composites
  the artwork and the reflection, and there is no lighting model in it, so the print's brightness is
  `X` and nothing else. Turning the room lights up does not brighten the artwork. This is the
  clearest thing to fix next.
- **The sheet does not receive shadows** for the same reason. Objects cast onto the floor and the
  back wall, not onto the acrylic.
- **The scene is rendered twice per frame** — once for the reflection, once for the view. Heavy
  scans cost roughly double, and the import warning says so. `ACRYLIC.reflectionScale` is the dial;
  it sits at 1 (reflection sampled at canvas density) because anything less magnifies a smaller
  image and no narrowing of the blur recovers the detail. Drop it toward 0.65 if a 111–137 MB scan
  drags.
- **Scene values are reconstructions.** `src/scene/presets.ts` holds the cameras, lights and sheet
  as plain data; the real Unreal transforms should replace them verbatim once captured. That swap
  touches one file.
- No global illumination — the `bounce` light stands in for Lumen. No thumbnails, no on-screen
  sliders, no automatic decimation of the 111–137 MB scans.

## Packaging as a Mac app

```bash
export PATH="/usr/local/bin:$HOME/.cargo/bin:$PATH"
npx tauri build          # -> src-tauri/target/release/bundle/macos/Reflection Viewer.app
```

`dragDropEnabled` must stay `false` in `src-tauri/tauri.conf.json`. Tauri's native file-drop handler
swallows drops before the page sees them, which breaks the headline feature.
