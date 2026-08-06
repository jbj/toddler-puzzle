/**
 * Before changing this file, read docs/layout.md.
 *
 * The background landscape, generated from a Layout.
 *
 * This is drawn in code rather than shipped as a fixed-size SVG so that both
 * orientations share one piece of art and stay in sync automatically.
 *
 * ## A backdrop belongs to the level's theme
 *
 * A level names a theme (`themes.ts`) and the deal narrows the cast to it, so
 * the landscape is dealt from the same world: a farm level stands its animals in
 * a field with a barn in it, a sea level stands them on a seabed, a jungle level
 * under a canopy. Each palette and each prop is taken from that theme's
 * hand-drawn picture scene - `farmyard.svg`, `rockpool.svg`, `jungle-path.svg` -
 * so the chapter a child plays here and the chapter they cut into jigsaws later
 * are recognisably one world. They are redrawn here rather than inlined from
 * there: a scene is a fixed 480x360 picture with a big shape in every quarter,
 * which is what its own contract needs and the opposite of what a board needs
 * behind it.
 *
 * Three rules hold across all of them, and
 * `docs/puzzle-kinds.md` states them:
 *
 *  - **no animal is ever painted into a background.** Every animal in the game
 *    is a piece a child may be asked to place, and one already standing in the
 *    field says, as far as a two-year-old can tell, that the job is done. That
 *    is why the farmyard's cow is a tractor here, and why the rockpool's crab
 *    and the jungle's bird are simply left out;
 *  - **the ground stays lighter than what stands on it**, because a piece is
 *    dropped onto the ground bands rather than into the sky: the jungle floor is
 *    green rather than brown, and the seabed is pale sand;
 *  - **the furniture is not themed.** The tray, the buttons and the holes look
 *    the same in every level, because they are what a child learns once.
 */
import type { Rect } from "./geometry";
import type { Layout } from "./layout";
import type { ThemeId } from "./themes";

function hillCrest(width: number, y: number, depth: number, amplitude: number): string {
  const w = (fraction: number) => (fraction * width).toFixed(1);
  return `M0 ${y - amplitude * 0.5}
    C${w(0.12)} ${y - amplitude} ${w(0.24)} ${y - amplitude} ${w(0.36)} ${y - amplitude * 0.2}
    C${w(0.47)} ${y + amplitude * 0.7} ${w(0.56)} ${y - amplitude * 0.5} ${w(0.7)} ${y - amplitude * 0.35}
    C${w(0.82)} ${y - amplitude * 0.2} ${w(0.91)} ${y - amplitude * 0.8} ${width} ${y - amplitude * 0.45}
    L${width} ${y + depth} L0 ${y + depth} Z`;
}

/**
 * Where a backdrop has to put things. The scene box rather than the canvas,
 * because where the tray runs down the sides the room between the columns is
 * all the sky there is, and `scale` because the props below are drawn once at a
 * nominal thousand-wide board and stood on whichever board this is.
 */
interface Scene {
  readonly open: Rect;
  /** The whole canvas's width, for the few things that run edge to edge. */
  readonly width: number;
  readonly skyTop: number;
  readonly horizon: number;
  readonly scale: number;
}

/** Where a prop standing in the distance puts its feet. */
const standing = (scene: Scene): number => scene.horizon + 10;

/** Stand a prop, which is drawn with its feet at its own origin. */
function place(markup: string, x: number, y: number, scale: number): string {
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)})">${markup}</g>`;
}

/** A point across the open scene, as a fraction of it. */
const across = (scene: Scene, fraction: number): number =>
  scene.open.x + fraction * scene.open.width;

/**
 * One theme's landscape: what colour everything is, and what stands in it.
 *
 * `skyline` is drawn after the ground bands and their crests, with its props
 * standing a little below the horizon, so whatever stands there sits into the
 * field rather than floating at the join - a crest rises above the horizon, and
 * drawing the props first would bury them behind it.
 */
interface Backdrop {
  /** The wash behind everything: sky for a land theme, water for the sea. */
  readonly wash: readonly [string, string];
  /** The far ground band, flat, just below the horizon. */
  readonly far: string;
  /** The near ground band, as a gradient down to the bottom of the canvas. */
  readonly near: readonly [string, string];
  /** What furnishes the air: sun and clouds, hanging leaves, light shafts. */
  readonly air: (scene: Scene) => string;
  /** What stands along the horizon. Nothing, under water. */
  readonly skyline?: (scene: Scene) => string;
  /** What grows on one of the ground lines. */
  readonly growth: (width: number, groundY: number) => string;
}

// --- the air ---------------------------------------------------------------

/**
 * The sun and two clouds. Shared by the two themes with a sky over them, because
 * a cloud is a cloud; the farm's sun wears the farmyard's four rays and the
 * meadow's does not.
 */
function sunAndClouds(
  scene: Scene,
  sun: { readonly disc: string; readonly rim: string; readonly rays?: boolean },
): string {
  const { open, skyTop, horizon } = scene;
  const rays = sun.rays
    ? `<g fill="${sun.disc}">
        <rect x="-8" y="-72" width="16" height="18" rx="8" />
        <rect x="-8" y="54" width="16" height="18" rx="8" />
        <rect x="-72" y="-8" width="18" height="16" rx="8" />
        <rect x="54" y="-8" width="18" height="16" rx="8" />
      </g>`
    : "";
  return `
    <g transform="translate(${open.x + open.width - 108} ${skyTop + 74})">
      ${rays}<circle r="46" fill="${sun.disc}" />
      <circle r="46" fill="none" stroke="${sun.rim}" stroke-width="5" />
    </g>

    <g fill="#ffffff" opacity="0.92">
      <g transform="translate(${across(scene, 0.16)} ${Math.round(skyTop + (horizon - skyTop) * 0.29)})">
        <circle cx="0" cy="0" r="30" /><circle cx="34" cy="8" r="24" /><circle cx="-32" cy="10" r="22" />
        <rect x="-32" y="0" width="66" height="22" rx="11" />
      </g>
      <g transform="translate(${across(scene, 0.55)} ${Math.round(skyTop + (horizon - skyTop) * 0.19)})">
        <circle cx="0" cy="0" r="24" /><circle cx="28" cy="6" r="19" /><circle cx="-26" cy="8" r="17" />
        <rect x="-26" y="0" width="54" height="18" rx="9" />
      </g>
    </g>
  `;
}

/**
 * How far the canopy hangs down over the scene. A share of the sky rather than
 * a height, because a portrait board has a third of the sky a landscape one
 * has, and a fixed canopy would close over it.
 */
const canopyBottom = (scene: Scene): number =>
  scene.skyTop + Math.max(44, (scene.horizon - scene.skyTop) * 0.32);

/**
 * The canopy: a band of leaves across the top of the scene in the jungle path's
 * three greens, with the gap of sky it leaves and the sun through that gap.
 * Hung from the top of the *scene* rather than the top of the canvas, so no
 * level has a jungle growing out of its tray.
 */
function canopy(scene: Scene): string {
  const { width, skyTop, scale } = scene;
  const bottom = canopyBottom(scene);
  const leaf = (fraction: number, drop: number, rx: number, fill: string) =>
    `<ellipse cx="${(fraction * width).toFixed(1)}" cy="${(bottom + drop * scale).toFixed(1)}"
       rx="${(rx * scale).toFixed(1)}" ry="${(rx * 0.56 * scale).toFixed(1)}" fill="${fill}" />`;
  return `
    <circle cx="${across(scene, 0.74).toFixed(1)}" cy="${(bottom + 52 * scale).toFixed(1)}"
      r="${(38 * scale).toFixed(1)}" fill="#ffe58a" />
    <rect x="0" y="${skyTop}" width="${width}" height="${(bottom - skyTop).toFixed(1)}" fill="#2f6b3a" />
    <g>
      ${leaf(0.03, -4, 46, "#2f6b3a")}${leaf(0.31, 2, 48, "#2f6b3a")}${leaf(0.85, -2, 44, "#2f6b3a")}
      ${leaf(0.17, 14, 44, "#4e9a51")}${leaf(0.58, 10, 42, "#4e9a51")}${leaf(0.99, 12, 46, "#4e9a51")}
      ${leaf(0.09, 30, 34, "#7ec24f")}${leaf(0.44, 26, 36, "#7ec24f")}${leaf(0.7, 32, 32, "#7ec24f")}
    </g>
    <g transform="translate(${across(scene, 0.26).toFixed(1)} ${(bottom + 18 * scale).toFixed(1)}) scale(${scale.toFixed(3)})">
      <path d="M0 0 C-6 28 8 46 2 74" fill="none" stroke="#3d7b40" stroke-width="7" stroke-linecap="round" />
      <circle cx="2" cy="88" r="19" fill="#f2903c" stroke="#c26a1e" stroke-width="4" />
    </g>
  `;
}

/**
 * Under water there is no sun and there are no clouds: the light comes down in
 * shafts from a surface above the top of the board, and the only things going
 * the other way are bubbles. Anybody restoring a sun here would be drawing a sky
 * the child is meant to be underneath.
 */
function underwater(scene: Scene): string {
  const { skyTop, horizon, scale } = scene;
  const depth = horizon - skyTop;
  const shaft = (fraction: number, width: number, lean: number) => {
    const x = across(scene, fraction);
    const w = width * scale;
    return `<path d="M${x.toFixed(1)} ${skyTop} L${(x + w).toFixed(1)} ${skyTop}
      L${(x + w + lean).toFixed(1)} ${horizon} L${(x + lean).toFixed(1)} ${horizon} Z" />`;
  };
  const bubble = (fraction: number, up: number, r: number) =>
    `<circle cx="${across(scene, fraction).toFixed(1)}" cy="${(horizon - up).toFixed(1)}"
       r="${(r * scale).toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="4" stroke-opacity="0.55" />`;
  return `
    <g fill="#ffffff" opacity="0.16">
      ${shaft(0.08, 74, 52)}${shaft(0.44, 96, 66)}${shaft(0.78, 62, 44)}
    </g>
    <g fill="none" stroke="#8fd0f2" stroke-width="7" stroke-linecap="round" opacity="0.8">
      <path d="M${across(scene, 0.12).toFixed(1)} ${skyTop + 30} c20 -12 40 10 62 -2" />
      <path d="M${across(scene, 0.56).toFixed(1)} ${skyTop + 22} c20 -12 40 10 62 -2" />
    </g>
    ${bubble(0.3, depth * 0.62, 11)}${bubble(0.34, depth * 0.44, 7)}
    ${bubble(0.68, depth * 0.5, 9)}${bubble(0.71, depth * 0.3, 6)}
  `;
}

// --- what stands on the horizon --------------------------------------------

/** The farmyard's barn, tree, haystack and fence - and its cow as a tractor. */
function farmyard(scene: Scene): string {
  const { scale } = scene;
  // A little below the horizon, so the ground line tucks in every base.
  const ground = standing(scene);
  const barn = `
    <g stroke-width="5">
      <rect x="-66" y="-98" width="132" height="98" fill="#d95a4e" stroke="#9c3a32" />
      <path d="M-78 -94 L0 -152 L78 -94 Z" fill="#8c3b3b" stroke="#6d2c2c" />
      <rect x="-23" y="-66" width="46" height="66" fill="#8c3b3b" stroke="#6d2c2c" />
      <rect x="-56" y="-84" width="26" height="26" fill="#ffe9a8" stroke="#9c3a32" stroke-width="4" />
      <rect x="30" y="-84" width="26" height="26" fill="#ffe9a8" stroke="#9c3a32" stroke-width="4" />
    </g>`;
  const tree = `
    <rect x="-12" y="-86" width="24" height="86" fill="#8a5a3b" />
    <circle cx="0" cy="-110" r="48" fill="#43903f" />
    <circle cx="-32" cy="-86" r="30" fill="#4fa249" />
    <circle cx="32" cy="-88" r="28" fill="#4fa249" />`;
  const haystack = `
    <path d="M-58 0 C-58 -44 -34 -72 0 -72 C34 -72 58 -44 58 0 Z" fill="#e8c25b" stroke="#bd923a" stroke-width="5" />
    <path d="M-48 -28 C-24 -36 24 -36 48 -28" fill="none" stroke="#bd923a" stroke-width="5" />`;
  const fence = `
    <g fill="#a9764a" stroke="#7d5433" stroke-width="4">
      <rect x="-64" y="-56" width="16" height="56" /><rect x="-8" y="-56" width="16" height="56" />
      <rect x="48" y="-56" width="16" height="56" />
      <rect x="-72" y="-46" width="136" height="14" /><rect x="-72" y="-20" width="136" height="14" />
    </g>`;
  // The farmyard's cow, as a tractor: no animal is ever painted into a
  // background. A cow standing in the field beside a cow-shaped hole tells a
  // two-year-old that the cow they are holding is already there.
  const tractor = `
    <g stroke="#2f6d94" stroke-width="5">
      <rect x="-46" y="-46" width="84" height="30" rx="8" fill="#4f9fd4" />
      <rect x="-42" y="-74" width="42" height="32" rx="7" fill="#7dc0e8" />
      <rect x="-14" y="-88" width="11" height="16" rx="5" fill="#4f9fd4" />
    </g>
    <g fill="#3b3b44"><circle cx="24" cy="-18" r="26" /><circle cx="-34" cy="-13" r="17" /></g>
    <g fill="#ffd63d"><circle cx="24" cy="-18" r="10" /><circle cx="-34" cy="-13" r="7" /></g>`;
  return `
    ${place(tree, across(scene, 0.06), ground, scale)}
    ${place(haystack, across(scene, 0.21), ground, scale * 0.78)}
    ${place(fence, across(scene, 0.38), ground, scale * 0.9)}
    ${place(barn, across(scene, 0.61), ground, scale)}
    ${place(tractor, across(scene, 0.86), ground, scale * 0.84)}
  `;
}

/** The jungle path's trunks: two big ones, two far ones, and no bird. */
function trunks(scene: Scene): string {
  const { scale } = scene;
  const top = canopyBottom(scene) - 6;
  const ground = standing(scene) + 2;
  const height = Math.max(0, ground - top);
  const trunk = (fraction: number, halfWidth: number, fill: string, flare: string) => {
    const x = across(scene, fraction);
    const w = halfWidth * scale;
    return `<rect x="${(x - w).toFixed(1)}" y="${top.toFixed(1)}" width="${(w * 2).toFixed(1)}"
      height="${height.toFixed(1)}" fill="${fill}" />${place(flare, x, ground, scale)}`;
  };
  const root = `<path d="M-21 -30 C-33 -18 -41 -10 -48 -4 L48 -4 C41 -10 33 -18 21 -30 Z" fill="#6b4429" />`;
  return `
    ${trunk(0.09, 8, "#6b9a52", "")}
    ${trunk(0.35, 21, "#8a5a3b", root)}
    ${trunk(0.62, 8, "#6b9a52", "")}
    ${trunk(0.88, 19, "#8a5a3b", root)}
  `;
}

// --- what grows on a ground line -------------------------------------------

/** Grass tufts and round flowers: the meadow's, and the farm's in its palette. */
function meadowGrowth(
  width: number,
  groundY: number,
  palette: {
    readonly stem: string;
    readonly petals: readonly [string, string, string];
    readonly heart: string;
  },
): string {
  const tufts = [0.06, 0.33, 0.64, 0.9]
    .map((fraction) => {
      const x = fraction * width;
      return `<path d="M${x} ${groundY} q6 -18 14 -24 M${x + 14} ${groundY} q-4 -16 -2 -26" />`;
    })
    .join("");
  const flowers = [0.21, 0.48, 0.79]
    .map((fraction, index) => {
      const x = (fraction * width).toFixed(1);
      const y = groundY - 14 + (index % 2) * 10;
      return `<circle cx="${x}" cy="${y}" r="8" fill="${palette.petals[index] as string}" />
              <circle cx="${x}" cy="${y}" r="3" fill="${palette.heart}" />`;
    })
    .join("");
  return `
      <g stroke="${palette.stem}" stroke-width="6" stroke-linecap="round" fill="none">${tufts}</g>
      <g>${flowers}</g>`;
}

/** Ferns, a mushroom and a flower, from the jungle path's understorey. */
function jungleGrowth(width: number, groundY: number): string {
  const fern = (fraction: number, size: number, stroke: string) => {
    const x = fraction * width;
    return `<g stroke="${stroke}" stroke-width="${(size * 0.2).toFixed(1)}" transform="translate(${x.toFixed(1)} ${groundY})">
      <path d="M0 0 c-4 -${(size * 0.5).toFixed(0)} -${(size * 0.6).toFixed(0)} -${(size * 0.7).toFixed(0)} -${size} -${(size * 0.8).toFixed(0)}
        M0 0 c2 -${(size * 0.7).toFixed(0)} -2 -${size} -4 -${(size * 1.25).toFixed(0)}
        M0 0 c4 -${(size * 0.5).toFixed(0)} ${(size * 0.6).toFixed(0)} -${(size * 0.7).toFixed(0)} ${size} -${(size * 0.8).toFixed(0)}" />
    </g>`;
  };
  return `
      <g fill="none" stroke-linecap="round">${fern(0.06, 34, "#3d7b40")}${fern(0.16, 22, "#4e9a51")}
        ${fern(0.68, 30, "#3d7b40")}${fern(0.92, 25, "#4e9a51")}</g>
      <g transform="translate(${(0.47 * width).toFixed(1)} ${groundY})">
        <rect x="-7" y="-14" width="14" height="14" fill="#f2e2b6" />
        <path d="M-26 -13 C-26 -33 -10 -45 0 -45 C10 -45 26 -33 26 -13 Z" fill="#d9534f" stroke="#a83c34" stroke-width="4" />
        <g fill="#ffffff"><circle cx="-8" cy="-25" r="5" /><circle cx="9" cy="-28" r="4" /></g>
      </g>
      <g transform="translate(${(0.28 * width).toFixed(1)} ${groundY})">
        <path d="M0 0 L0 -30" fill="none" stroke="#3d7b40" stroke-width="6" stroke-linecap="round" />
        <circle cx="0" cy="-38" r="12" fill="#ffd63d" stroke="#e8a81c" stroke-width="4" />
      </g>`;
}

/** Seaweed, a shell and a starfish, from the rockpool's sand. */
function seabedGrowth(width: number, groundY: number): string {
  const weed = [0.07, 0.34, 0.88]
    .map((fraction) => {
      const x = fraction * width;
      return `<path d="M${x.toFixed(1)} ${groundY} c-20 -20 17 -37 -3 -63 M${(x + 22).toFixed(1)} ${groundY} c17 -17 -14 -31 6 -49" />`;
    })
    .join("");
  return `
      <g stroke="#3f9e6a" stroke-width="9" stroke-linecap="round" fill="none">${weed}</g>
      <g transform="translate(${(0.52 * width).toFixed(1)} ${groundY})">
        <path d="M-22 0 C-22 -22 -12 -36 0 -36 C12 -36 22 -22 22 0 Z" fill="#ffd0bd" stroke="#d99c85" stroke-width="4" />
        <g fill="none" stroke="#d99c85" stroke-width="3">
          <path d="M0 -36 L-15 -1" /><path d="M0 -36 L0 0" /><path d="M0 -36 L15 -1" />
        </g>
      </g>
      <g transform="translate(${(0.7 * width).toFixed(1)} ${groundY - 16}) scale(0.4)">
        <path d="M0 -54 L18 -12 L62 -8 L28 20 L38 46 L0 26 L-38 46 L-28 20 L-62 -8 L-18 -12 Z"
          fill="#f2745f" stroke="#c4503c" stroke-width="7" stroke-linejoin="round" />
        <circle cx="0" cy="0" r="10" fill="#ffc9b6" />
      </g>`;
}

// --- the themes ------------------------------------------------------------

/**
 * What a level with no theme gets, which is most of them: chapters 1, 4, 5 and
 * 6 name none, and this is the game's own green hill, unchanged.
 */
const MEADOW: Backdrop = {
  wash: ["#7ec8e8", "#d6f0f8"],
  far: "#8ed76f",
  near: ["#8ccf63", "#6cb349"],
  air: (scene) => sunAndClouds(scene, { disc: "#ffd23f", rim: "#f6b820" }),
  growth: (width, groundY) =>
    meadowGrowth(width, groundY, {
      stem: "#57a038",
      petals: ["#ff8fa3", "#fff3b0", "#c9a7f5"],
      heart: "#fff3b0",
    }),
};

/** The farmyard, in the farmyard's colours. */
const FARM: Backdrop = {
  wash: ["#9ed8ff", "#e2f3ff"],
  far: "#79b94e",
  near: ["#8cc95c", "#6aa844"],
  air: (scene) => sunAndClouds(scene, { disc: "#ffd63d", rim: "#e8a81c", rays: true }),
  skyline: farmyard,
  growth: (width, groundY) =>
    meadowGrowth(width, groundY, {
      stem: "#3d7b40",
      petals: ["#ef6f8e", "#ffd63d", "#f2f2f2"],
      heart: "#e8a81c",
    }),
};

/** Under water, in the rockpool's blues and sands. */
const SEA: Backdrop = {
  wash: ["#2f8fd0", "#8ed3ef"],
  far: "#ddc793",
  near: ["#f2e2b6", "#e0cb95"],
  air: underwater,
  growth: seabedGrowth,
};

/** Under the canopy, in the jungle path's greens. */
const JUNGLE: Backdrop = {
  wash: ["#bfe6ff", "#dff0d8"],
  far: "#5f9a4a",
  near: ["#7ec24f", "#57893f"],
  air: canopy,
  skyline: trunks,
  growth: jungleGrowth,
};

/**
 * Every backdrop, by the name the level table uses. `vehicles` is a theme with
 * nothing drawn for it anywhere in the game - no cast, and no level naming one -
 * so it stands on the meadow until there is something to put in it.
 */
const BACKDROPS: Record<ThemeId | "meadow", Backdrop> = {
  meadow: MEADOW,
  farm: FARM,
  sea: SEA,
  jungle: JUNGLE,
  vehicles: MEADOW,
};

/** The backdrop a level of this theme is played against. */
export function backdropFor(theme: ThemeId | undefined): Backdrop {
  return BACKDROPS[theme ?? "meadow"];
}

/**
 * The shelf the waiting pieces stand on: a band of sand with a darker lip along
 * the edge the scene is on, which is what makes it read as a shelf rather than
 * as a stripe. Shared with the picture boards, which have no landscape behind
 * them but still have a tray, so the two cannot drift apart.
 */
export function renderTrayBands(layout: Layout): string {
  return layout.trayBands
    .map(({ rect, lip }) => {
      const edge =
        lip === "bottom"
          ? { x: rect.x, y: rect.y + rect.height, width: rect.width, height: 10 }
          : lip === "right"
            ? { x: rect.x + rect.width - 10, y: rect.y, width: 10, height: rect.height }
            : { x: rect.x, y: rect.y, width: 10, height: rect.height };
      return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="#f6ead0" />
       <rect x="${edge.x}" y="${edge.y}" width="${edge.width}" height="${edge.height}" fill="#d9c398" />`;
    })
    .join("");
}

export function renderScenery(layout: Layout): string {
  const { width, height } = layout.canvas;
  const { sceneTop, horizon, bands } = layout;
  const skyTop = sceneTop;
  // The air, and everything standing in the distance, belong to the scene
  // rather than to the whole canvas: where the tray runs down the sides, the
  // room between the columns is all the sky there is.
  const open = layout.sceneBox;
  const backdrop = backdropFor(layout.level.theme);
  const scene: Scene = {
    open,
    width,
    skyTop,
    horizon,
    // The props are drawn at a nominal thousand-wide board. A portrait board is
    // narrower rather than further away, so they shrink with it - but only so
    // far, because a barn the size of a piece stops reading as distance.
    scale: Math.min(1, Math.max(0.72, open.width / 1000)),
  };

  const bandMarkup = bands
    .map((band, index) => {
      const next = bands[index + 1];
      const bottom = next ? next.top : height;
      const fill = index === 0 ? backdrop.far : "url(#ground)";
      return `<rect x="0" y="${band.top}" width="${width}" height="${bottom - band.top}" fill="${fill}" />`;
    })
    .join("");

  const crests = bands
    .map((band, index) =>
      index === 0
        ? `<path d="${hillCrest(width, band.top, 46, 44)}" fill="${backdrop.far}" />`
        : `<path d="${hillCrest(width, band.top, 30, 26)}" fill="url(#ground)" opacity="0.95" />`,
    )
    .join("");

  const decor = layout.decorLines.map((groundY) => backdrop.growth(width, groundY)).join("");

  const trayBand = renderTrayBands(layout);

  return `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${backdrop.wash[0]}" />
        <stop offset="100%" stop-color="${backdrop.wash[1]}" />
      </linearGradient>
      <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${backdrop.near[0]}" />
        <stop offset="100%" stop-color="${backdrop.near[1]}" />
      </linearGradient>
    </defs>

    <rect x="0" y="${skyTop}" width="${width}" height="${height - skyTop}" fill="url(#sky)" />
    ${backdrop.air(scene)}

    ${bandMarkup}
    ${crests}

    <!-- After the ground, because a barn stands in the field rather than behind
         it: a crest that rises above the horizon would otherwise bury a prop. -->
    ${backdrop.skyline ? backdrop.skyline(scene) : ""}
    ${decor}

    <!-- Last, because a tray down the gutters stands in front of the ground it
         crosses; a tray across the top has nothing to cover. -->
    ${trayBand}
  `;
}
