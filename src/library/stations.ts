import { useMemo } from 'react';
import { freshSlot, useViewer, type BoxCm, type Slot } from '../store';

/** Pedestal and base sizes as the install plan writes them: height × width × depth, cm. */
const hwd = (heightCm: number, widthCm: number, lengthCm: number): BoxCm => ({
  heightCm,
  widthCm,
  lengthCm,
});

type StationObject = {
  /** As the plan names it. */
  label: string;
  /** Catalogue number, for the HUD and for matching a scan when one turns up. */
  catalog: string;
  /**
   * The decimated Pluriversal Studio scan in public/seed/stations/, if one exists — all
   * the pairing scans live in Box › 3DWorks-and-Facsimiles_MuseoDeAmerica_2026 ›
   * MAM_PluriversalStudio[PS]. Several are filed under a different catalogue number than
   * the plan prints, or are still a placeholder there; those were matched by the plan's
   * own photograph of the object. Where nothing matches, the pedestal stands empty.
   */
  scan?: string;
  /** Along the wall from the sheet's centre line, cm — measured off the elevation. */
  xCm: number;
  pedestal: BoxCm;
  base?: BoxCm;
};

export type Station = {
  id: string;
  title: string;
  painting: string;
  print: {
    /** In public/seed/stations/. */
    file: string;
    heightCm: number;
    widthCm: number;
    /** Bottom edge above the plinth, cm — the vertical dimension at the left of each page. */
    bottomCm: number;
  };
  objects: StationObject[];
  /** What the plan leaves open, or where staging it here had to interpret the drawing. */
  notes: string[];
};

/**
 * BM38–BM49, every pairing in `BM38-49_EdicionJM-opt.pdf` (Box › 01_SIGNATURE-PROJECTS ›
 * BlackMirror_Images-and-Pairing-Index). Sizes are the plan's; x positions are scaled off
 * each elevation against its own pedestal width. Two things the plan does not give at all,
 * and which are therefore assumptions:
 *   - the gap from the sheet — elevations have no depth. Each pedestal is set 10 cm off
 *     the glass (gap = half its depth + 10), and a drag (once confirmed) moves it;
 *   - the plinth's height — the grey band reads as about 10 cm against BM38's 180 cm sheet.
 */
export const STATIONS: Station[] = [
  {
    id: 'BM38',
    title: 'Guerra sexual',
    painting: 'Fabrés, La esclava',
    print: { file: 'BM38_Fabrés_LaEsclava_1866_180x80cm.jpg', heightCm: 180, widthCm: 40, bottomCm: 0 },
    objects: [
      {
        label: 'Prisionero Moche',
        catalog: 'MAM 01425',
        scan: 'MAM_01425_PrisioneroMoche.glb',
        xCm: 1,
        pedestal: hwd(90, 30, 30),
      },
    ],
    notes: ['The sheet is a 180 × 40 strip, cropped from the 180 × 80 painting.'],
  },
  {
    id: 'BM39',
    title: 'Pez y humano',
    painting: 'José de Ribera, San Andrés',
    print: { file: 'BM39_JoseDeRibera_SanAndres_1631_123x92cm.jpg', heightCm: 123, widthCm: 92, bottomCm: 50 },
    // The plan's placeholder line; the Museo de América reference set (Box › 01_STUDIO ›
    // Museo de América) has one object at the plan's 51 × 20.5 cm: 1981-04-048.
    objects: [{ label: 'Figura con pez', catalog: 'MAM 1981-04-048', xCm: 0, pedestal: hwd(75, 50, 40) }],
    notes: ['Figura con pez is MAM 1981-04-048, photographed but never 3D-scanned — the pedestal stands empty.'],
  },
  {
    id: 'BM40',
    title: 'Visiones y ofrendas',
    painting: 'El Greco, San Juan Evangelista',
    print: {
      file: 'BM40_ElGreco_SanJuanEvangelista_1650_100x78cm.jpg',
      heightCm: 100,
      widthCm: 78,
      bottomCm: 60,
    },
    objects: [{ label: 'Figure with offerings', catalog: 'FA Cat 2013-02-03', xCm: 0, pedestal: hwd(70, 50, 40) }],
    notes: ['MAM 2013-02-03 (58 cm, arms raised) was photographed but never 3D-scanned — the pedestal stands empty.'],
  },
  {
    id: 'BM41',
    title: 'Fragmentos encarados',
    painting: 'Goya, Romería de San Isidro (detalle)',
    print: { file: 'BM41_Goya_RomeríaSanIsidro_1820_96x120cm.jpg', heightCm: 96, widthCm: 120, bottomCm: 65 },
    objects: [{ label: 'Xipe Totec mask', catalog: 'FA Cat 1985-01-100', xCm: 0, pedestal: hwd(90, 30, 30) }],
    notes: ['The Xipe Totec mask 1985-01-100 was photographed but never 3D-scanned — the pedestal stands empty.'],
  },
  {
    id: 'BM42',
    title: 'Saturno Xipe Totec',
    painting: 'Goya, Saturno',
    print: { file: 'BM42_Goya_Saturno_1820_143x81cm-bw.jpg', heightCm: 143, widthCm: 81, bottomCm: 18 },
    objects: [{ label: 'Xipe Totec', catalog: 'FA Cat 1991-11-48', xCm: 0, pedestal: hwd(50, 50, 40) }],
    notes: ['No scan of Xipe Totec 1991-11-48 (64.8 cm) — photographed but never 3D-scanned; the pedestal stands empty.'],
  },
  {
    id: 'BM43',
    title: 'Una fábula',
    painting: 'El Greco, Una fábula',
    print: { file: 'BM43_ElGreco_UnaFábula,c.1580_50x64cm.jpg', heightCm: 50, widthCm: 64, bottomCm: 90 },
    objects: [
      {
        label: 'Figure FA',
        catalog: 'FA Cat 1981-04-113',
        scan: 'MAM_1981_04_113.glb',
        xCm: -15,
        pedestal: hwd(85, 30, 35),
        base: hwd(10, 20, 20),
      },
      {
        label: 'Figure FB',
        catalog: 'FB Cat 1981-04-049',
        scan: 'MAM_1981_04_049.glb',
        xCm: 15,
        pedestal: hwd(85, 30, 35),
      },
    ],
    notes: ['The plan has one 85×60×35 pedestal; staged as two 30 cm halves side by side so each object moves on its own.'],
  },
  {
    id: 'BM44',
    title: 'Lluvia, agua y flores',
    painting: 'Tintoretto, Flora',
    print: { file: 'BM44_61x55cm_Flora-Tintoretto-bw.jpg', heightCm: 61, widthCm: 55, bottomCm: 105 },
    objects: [{ label: 'Chalchiuhtlicue', catalog: 'FA Cat 02619', xCm: 0, pedestal: hwd(110, 45, 45) }],
    notes: ['The stone Chalchiuhtlicue 02619 (35 cm) was photographed but never 3D-scanned — the pedestal stands empty.'],
  },
  {
    id: 'BM45',
    title: 'Sin título',
    painting: 'Velázquez, El bufón el Primo',
    print: {
      file: 'BM45_106,5x82,5cm_El bufón el Primo-bw.jpg',
      heightCm: 106.5,
      widthCm: 82.5,
      bottomCm: 60,
    },
    objects: [
      {
        label: 'Seated figure',
        catalog: 'FA Cat 1985-01-128',
        scan: 'MAM_1985_01_128.glb',
        xCm: -9,
        pedestal: hwd(85, 40, 40),
        base: hwd(10, 25, 20),
      },
    ],
    notes: [],
  },
  {
    id: 'BM46',
    title: 'Sin título',
    painting: 'Velázquez, El bufón Calabacillas',
    print: { file: 'BM46_106x83cm_El bufón Calabacillas-bw.jpg', heightCm: 106, widthCm: 83, bottomCm: 55 },
    objects: [
      {
        label: 'Standing figure, pointed head',
        catalog: 'MAM 1985-01-118',
        scan: 'MAM_1985_01_118.glb',
        xCm: 11.5,
        pedestal: hwd(85, 50, 50),
      },
    ],
    notes: ['The plan still has a placeholder catalogue line here; the figure in its photo is 1985-01-118.'],
  },
  {
    id: 'BM47',
    title: 'Sin título',
    painting: 'Caravaggio, David vencedor de Goliat',
    print: { file: 'BM47_110x91cm_David vencedor de Goliat-bw.jpg', heightCm: 110, widthCm: 91, bottomCm: 65 },
    objects: [
      {
        label: 'Mask',
        catalog: 'FA Cat 1985-01-106',
        scan: 'MAM_1985_01_106.glb',
        xCm: -11.5,
        pedestal: hwd(100, 25, 25),
        // "con soporte" — the mask is held about 8 cm above the pedestal top.
        base: hwd(8, 5, 5),
      },
    ],
    notes: ["The mask's support is drawn as a narrow 8 cm post; its real form is not in the plan."],
  },
  {
    id: 'BM48',
    title: 'Sin título',
    painting: 'Velázquez, El príncipe Baltasar Carlos, cazador',
    print: {
      file: 'BM48_191x103cm_El príncipe Baltasar Carlos, cazador-bw.jpg',
      heightCm: 191,
      widthCm: 103,
      bottomCm: 30,
    },
    objects: [
      { label: 'Dog vessel', catalog: 'FA Cat 00000', xCm: -25, pedestal: hwd(40, 50, 45) },
      {
        label: 'Standing painted figure',
        catalog: 'MAM 2002-05-032',
        scan: 'MAM_2002_05_032.glb',
        xCm: 25,
        pedestal: hwd(40, 50, 45),
        base: hwd(25, 35, 30),
      },
    ],
    notes: [
      'The painted figure in the plan\'s photo is 2002-05-032; there is no scan of the dog vessel.',
      'One 40×100×45 pedestal in the plan, staged as two halves.',
    ],
  },
  {
    id: 'BM49',
    title: 'Sin título',
    painting: 'Velázquez, Los borrachos (detalle)',
    print: {
      file: 'BM49_165x225cm_Los borrachos, o El triunfo de Baco-bw.jpg',
      heightCm: 125.5,
      widthCm: 158.8,
      bottomCm: 60,
    },
    objects: [
      { label: 'To be chosen', catalog: 'FA Cat 00000', xCm: 0, pedestal: hwd(80, 50, 35), base: hwd(20, 30, 25) },
    ],
    notes: [
      'The object is still a placeholder in the plan, and no scan matches its photo.',
      'The sheet is a 158.8 × 125.5 detail, cropped from the full painting.',
    ],
  },
];

/** The plinth height the stations assume — see the note on STATIONS. */
const STATION_PLINTH_CM = 10;

/** Sheet optics for the white room — on the Z and X step grids, so the keys land cleanly. */
const STATION_REFLECTANCE = 0.1;
const STATION_PRINT = 2;

const label = (file: string) => file.replace(/\.[^.]+$/, '');

/** One starter file from public/seed/stations/, or null where this build has none. */
export async function fetchSeed(file: string): Promise<File | null> {
  try {
    // encodeURI, not encodeURIComponent: the plan's filenames have commas in them
    // ("106,5x82,5cm"), and static servers decode paths with decodeURI, which leaves an
    // encoded comma as a literal "%2C" and misses the file. # and ? are the only
    // characters encodeURI leaves alone that would still break the path.
    const path = encodeURI(file.normalize('NFC')).replace(/#/g, '%23').replace(/\?/g, '%3F');
    const res = await fetch(`seed/stations/${path}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    // A dev server answers a missing file with index.html; refuse that rather than
    // import a web page as a scan.
    if (blob.type.includes('html')) return null;
    return new File([blob], file);
  } catch {
    return null;
  }
}

/**
 * Stage a station: its print on the sheet at the plan's size and height, the plinth,
 * and each object on its pedestal and base. Prints and scans already in the library are
 * reused; anything missing is loaded from the local starter set (public/seed/stations/),
 * which exists on local builds only — the scans are the museum's, never published.
 *
 * Resolves with anything that could not be staged, for the import toast.
 */
export async function applyStation(
  station: Station,
  importFiles: (files: File[]) => Promise<void>,
): Promise<string[]> {
  const problems: string[] = [...station.notes];
  const get = useViewer.getState;

  // ── The print ──────────────────────────────────────────────────────────────────
  const printLabel = label(station.print.file);
  const findPrint = () => get().artworks.findIndex((a) => a.name === printLabel || a.name.startsWith(`${station.id}_`));
  if (findPrint() < 0) {
    const file = await fetchSeed(station.print.file);
    if (file) await importFiles([file]);
  }
  const artIndex = findPrint();
  if (artIndex < 0) problems.unshift(`${station.id}: print ${station.print.file} is not in the library.`);

  // ── The objects ────────────────────────────────────────────────────────────────
  const indices: number[] = [];
  for (const obj of station.objects) {
    if (!obj.scan) {
      indices.push(-1);
      continue;
    }
    const name = label(obj.scan);
    const find = () => get().artifacts.findIndex((a) => a.name === name);
    if (find() < 0) {
      const file = await fetchSeed(obj.scan);
      if (file) await importFiles([file]);
    }
    const i = find();
    if (i < 0) problems.unshift(`${station.id}: scan ${obj.scan} (${obj.catalog}) is not available here.`);
    indices.push(i);
  }

  const slotFor = (obj: StationObject, objectIndex: number): Slot =>
    freshSlot({
      objectIndex,
      xCm: obj.xCm,
      gapCm: obj.pedestal.lengthCm / 2 + 10,
      pedestal: obj.pedestal,
      ...(obj.base ? { base: obj.base, baseOn: true } : { baseOn: false }),
    });

  const [a, b] = station.objects;
  const s = get();
  useViewer.setState({
    station: station.id,
    setupId: null,
    moveAsk: null,
    moveUnlocked: null,
    panel: {
      widthCm: station.print.widthCm,
      heightCm: station.print.heightCm,
      bottomCm: station.print.bottomCm,
    },
    plinth: { on: true, heightCm: STATION_PLINTH_CM },
    slots: { A: slotFor(a, indices[0]), B: b ? slotFor(b, indices[1]) : s.slots.B },
    twoUp: Boolean(b),
    active: 'A',
    artIndex: artIndex >= 0 ? artIndex : s.artIndex,
    // The install is a white gallery. B still cycles away from it.
    studioTheme: 'white',
    // The default reflectance (0.28) is set high so the overlay reads in the black void.
    // In a white room the same sheet mirrors the walls straight across the print and
    // washes it out; glass is honestly 0.04–0.08. 0.10 with the print lifted to 2× keeps
    // the painting legible and the object's reflection clearly over it. Z and X still move both.
    reflectance: STATION_REFLECTANCE,
    print: STATION_PRINT,
  });
  get().reframe();

  return problems;
}

/**
 * The pairing the scene is showing: the station whose painting is on the sheet, so picking
 * a print from the gallery is enough; otherwise the station last staged.
 */
export function pairingStation(s: {
  artworks: { name: string }[];
  artIndex: number;
  station: string | null;
}): Station | undefined {
  const art = s.artIndex < 0 ? undefined : s.artworks[s.artIndex];
  const byPrint = art && STATIONS.find((st) => art.name.normalize('NFC').startsWith(`${st.id}_`));
  return byPrint ?? STATIONS.find((st) => st.id === s.station);
}

export type Recommendation = {
  /** "Recommended", or "Recommended A" / "Recommended B" when the pairing has two objects. */
  tag: string;
  /** The object as the plan names it. */
  label: string;
  /** Position in the library, or -1 when there is no scan of it here. */
  index: number;
  /** Why it cannot be chosen, when index is -1. */
  missing?: string;
};

/** The objects the install plan pairs with what is on the sheet, in plan order. */
export function recommendationsFor(
  station: Station | undefined,
  artifacts: { name: string }[],
): Recommendation[] {
  if (!station) return [];
  const two = station.objects.length > 1;
  return station.objects.map((o, i) => {
    const tag = two ? `Recommended ${i === 0 ? 'A' : 'B'}` : 'Recommended';
    if (!o.scan) return { tag, label: o.label, index: -1, missing: 'no scan' };
    const index = artifacts.findIndex((a) => a.name === label(o.scan!));
    return { tag, label: o.label, index, ...(index < 0 ? { missing: 'not in the library' } : {}) };
  });
}

/** The current pairing and its recommended objects, kept live as the print or library changes. */
export function useRecommendations(): { station: Station | undefined; recs: Recommendation[] } {
  const artifacts = useViewer((s) => s.artifacts);
  const artworks = useViewer((s) => s.artworks);
  const artIndex = useViewer((s) => s.artIndex);
  const stationId = useViewer((s) => s.station);
  return useMemo(() => {
    const station = pairingStation({ artworks, artIndex, station: stationId });
    return { station, recs: recommendationsFor(station, artifacts) };
  }, [artifacts, artworks, artIndex, stationId]);
}
