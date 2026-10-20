import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { USDLoader } from 'three/examples/jsm/loaders/USDLoader.js';
import {
  BufferGeometry,
  Group,
  LoadingManager,
  MathUtils,
  Mesh,
  MeshPhongMaterial,
  MeshStandardMaterial,
  Object3D,
} from 'three';

export type SupportedFormat = 'fbx' | 'gltf' | 'obj' | 'stl' | 'ply' | 'usd';

/** Extensions accepted by the drop zone and the file picker. */
export const ACCEPTED_EXTENSIONS = [
  '.fbx',
  '.glb',
  '.gltf',
  '.obj',
  '.stl',
  '.ply',
  '.usdz',
  '.usd',
  '.usda',
  '.usdc',
];

const FORMAT_BY_EXT: Record<string, SupportedFormat> = {
  fbx: 'fbx',
  glb: 'gltf',
  gltf: 'gltf',
  obj: 'obj',
  stl: 'stl',
  ply: 'ply',
  usdz: 'usd',
  usd: 'usd',
  usda: 'usd',
  usdc: 'usd',
};

export function formatOf(filename: string): SupportedFormat | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  return FORMAT_BY_EXT[ext] ?? null;
}

/** A file dropped alongside the model — a texture image, or an OBJ's .mtl. */
export type TextureFile = { name: string; bytes: ArrayBuffer };

const IMAGE_EXT = /\.(jpg|jpeg|png|tga|tif|tiff|webp|bmp)$/i;

export function isImageFile(filename: string): boolean {
  return IMAGE_EXT.test(filename);
}

export function isMaterialFile(filename: string): boolean {
  return /\.mtl$/i.test(filename);
}

/** Filename without any directory part — FBX often stores absolute paths from another machine. */
const fileName = (p: string) => p.split(/[/\\]/).pop() ?? p;
/** Lower-cased form used for matching, since path casing rarely matches the file on disk. */
const baseName = (p: string) => fileName(p).toLowerCase();

export type LoadResult = {
  group: Group;
  /** Texture filenames the model asked for that could not be resolved. */
  missing: string[];
};

export async function loadModel(
  buffer: ArrayBuffer,
  format: SupportedFormat,
  sidecars: TextureFile[] = [],
): Promise<LoadResult> {
  // Not every model embeds its texture — many only reference a path from the machine that
  // exported them ("X:/Exports/foo.jpg"), which a browser can never resolve. Files
  // supplied alongside the model are mapped in by filename so those still load in colour
  // without being re-exported.
  const urls = new Map<string, string>();
  for (const s of sidecars) {
    urls.set(baseName(s.name), URL.createObjectURL(new Blob([s.bytes])));
  }

  const missing = new Set<string>();
  const manager = new LoadingManager();
  manager.setURLModifier((url) => urls.get(baseName(url)) ?? url);
  // A texture referenced but neither embedded nor supplied fails here — this is what
  // distinguishes "imported grey" from "imported fine".
  manager.onError = (url) => missing.add(fileName(url));

  const root = await parseByFormat(buffer, format, manager, sidecars, urls);

  // Texture images load asynchronously even though some parsers return synchronously, so
  // wait for the manager to drain before deciding what is missing. Revoking the blob URLs
  // any earlier kills the very loads being waited on.
  await waitForManager(manager);

  const group = new Group();
  group.add(root);
  normalizeMaterials(group);

  // Held for the life of the model; released in dropModel() when it leaves the library.
  group.userData.blobUrls = [...urls.values()];

  return { group, missing: [...missing] };
}

async function parseByFormat(
  buffer: ArrayBuffer,
  format: SupportedFormat,
  manager: LoadingManager,
  sidecars: TextureFile[],
  urls: Map<string, string>,
): Promise<Object3D> {
  switch (format) {
    case 'fbx':
      return new FBXLoader(manager).parse(buffer, '');

    case 'gltf':
      return (await new GLTFLoader(manager).parseAsync(buffer, '')).scene;

    case 'obj': {
      const loader = new OBJLoader(manager);

      // OBJ keeps its materials in a separate .mtl, which in turn references image files.
      // All of them have to arrive in the same drop for the model to come in textured.
      const mtl = sidecars.find((s) => isMaterialFile(s.name));
      if (mtl) {
        const mtlLoader = new MTLLoader(manager);
        const materials = mtlLoader.parse(new TextDecoder().decode(mtl.bytes), '');
        materials.preload();
        loader.setMaterials(materials);
      }
      return loader.parse(new TextDecoder().decode(buffer));
    }

    case 'stl':
      // STL carries geometry only — no UVs, no colour. It will always render untextured.
      return meshFromGeometry(new STLLoader(manager).parse(buffer));

    case 'ply':
      // PLY from photogrammetry frequently carries per-vertex colour instead of a texture.
      return meshFromGeometry(new PLYLoader(manager).parse(buffer));

    case 'usd':
      return parseUsd(buffer, manager, urls);
  }
}

/** USDLoader is callback-based; wrap it so it fits the async path with everything else. */
function parseUsd(
  buffer: ArrayBuffer,
  manager: LoadingManager,
  _urls: Map<string, string>,
): Promise<Object3D> {
  return new Promise((resolve, reject) => {
    try {
      new USDLoader(manager).parse(buffer, '', resolve, reject);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function meshFromGeometry(geometry: BufferGeometry): Mesh {
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.75,
    metalness: 0,
    // Only meaningful when the file actually carries colours; harmless otherwise.
    vertexColors: !!geometry.attributes.color,
  });
  return new Mesh(geometry, material);
}

/**
 * Resolve once every resource queued on the manager has settled. onLoad never fires when
 * a model queued nothing at all, so the short-circuit below is the normal exit for
 * embedded-texture files rather than an error path.
 */
function waitForManager(manager: LoadingManager, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let started = false;

    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    manager.onStart = () => {
      started = true;
    };
    manager.onLoad = done;

    setTimeout(done, timeoutMs);
    setTimeout(() => {
      if (!started) done();
    }, 100);
  });
}

/**
 * Photogrammetry scans carry their whole appearance in the albedo texture, but exporters
 * routinely omit metallicFactor — and glTF defaults it to 1.0, which renders the artifact
 * as a black mirror. Everything is flattened to matte dielectric here.
 *
 * Genuinely metallic pieces (the gold Quimbaya artifacts) will need this relaxed once a
 * cubemap of the real studio gives them something true to reflect.
 */
export function normalizeMaterials(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const converted = materials.map((m) => {
      const mat = toStandard(m as MeshStandardMaterial | MeshPhongMaterial | undefined);
      if (!mat) return m;

      mat.metalness = 0;
      mat.roughness = MathUtils.clamp(mat.roughness, 0.45, 1);

      // Scanner-baked per-vertex colour double-darkens against an albedo map — but when
      // there is no map (common for PLY) it is the only colour the file has, so it stays.
      const hasVertexColour = !!mesh.geometry?.attributes?.color;
      mat.vertexColors = hasVertexColour && !mat.map;

      mat.needsUpdate = true;
      return mat;
    });

    mesh.material = Array.isArray(mesh.material) ? converted : converted[0];
  });
}

/**
 * FBXLoader and OBJLoader produce MeshPhongMaterial, which three.js **does not light with
 * RectAreaLight** and which ignores scene.environment. Since the studio rig is almost
 * entirely rect lights, those imports render far darker than the same object routed
 * through glTF. Converting to MeshStandardMaterial puts every import path on the same
 * lighting model.
 */
function toStandard(
  mat: MeshStandardMaterial | MeshPhongMaterial | undefined,
): MeshStandardMaterial | undefined {
  if (!mat) return undefined;
  if ((mat as MeshStandardMaterial).isMeshStandardMaterial) return mat as MeshStandardMaterial;

  const phong = mat as MeshPhongMaterial;
  const std = new MeshStandardMaterial({
    name: phong.name,
    color: phong.color,
    map: phong.map,
    normalMap: phong.normalMap,
    normalScale: phong.normalScale,
    aoMap: phong.aoMap,
    emissive: phong.emissive,
    emissiveMap: phong.emissiveMap,
    alphaMap: phong.alphaMap,
    transparent: phong.transparent,
    opacity: phong.opacity,
    side: phong.side,
  });
  std.userData = phong.userData;
  phong.dispose();
  return std;
}

/** Rough triangle count, used to warn before a very heavy scan is added. */
export function triangleCount(root: Object3D): number {
  let tris = 0;
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const g = mesh.geometry;
    tris += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
  });
  return Math.round(tris);
}