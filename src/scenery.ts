/**
 * The background landscape, generated from a Layout.
 *
 * This is drawn in code rather than shipped as a fixed-size SVG so that both
 * orientations share one piece of art and stay in sync automatically.
 */
import type { Layout } from "./layout";

function hillCrest(width: number, y: number, depth: number, amplitude: number): string {
  const w = (fraction: number) => (fraction * width).toFixed(1);
  return `M0 ${y - amplitude * 0.5}
    C${w(0.12)} ${y - amplitude} ${w(0.24)} ${y - amplitude} ${w(0.36)} ${y - amplitude * 0.2}
    C${w(0.47)} ${y + amplitude * 0.7} ${w(0.56)} ${y - amplitude * 0.5} ${w(0.7)} ${y - amplitude * 0.35}
    C${w(0.82)} ${y - amplitude * 0.2} ${w(0.91)} ${y - amplitude * 0.8} ${width} ${y - amplitude * 0.45}
    L${width} ${y + depth} L0 ${y + depth} Z`;
}

function tufts(width: number, groundY: number): string {
  const positions = [0.06, 0.33, 0.64, 0.9];
  return positions
    .map((fraction) => {
      const x = fraction * width;
      return `<path d="M${x} ${groundY} q6 -18 14 -24 M${x + 14} ${groundY} q-4 -16 -2 -26" />`;
    })
    .join("");
}

function flowers(width: number, groundY: number): string {
  const petals = ["#ff8fa3", "#fff3b0", "#c9a7f5"];
  return [0.21, 0.48, 0.79]
    .map((fraction, index) => {
      const x = (fraction * width).toFixed(1);
      const y = groundY - 14 + (index % 2) * 10;
      return `<circle cx="${x}" cy="${y}" r="8" fill="${petals[index] as string}" />
              <circle cx="${x}" cy="${y}" r="3" fill="#fff3b0" />`;
    })
    .join("");
}

export function renderScenery(layout: Layout): string {
  const { width, height } = layout.canvas;
  const { sceneTop, horizon, bands } = layout;

  const bandMarkup = bands
    .map((band, index) => {
      const next = bands[index + 1];
      const bottom = next ? next.top : height;
      return `<rect x="0" y="${band.top}" width="${width}" height="${bottom - band.top}" fill="${band.fill}" />`;
    })
    .join("");

  const crests = bands
    .map((band, index) =>
      index === 0
        ? `<path d="${hillCrest(width, band.top, 46, 44)}" fill="${band.fill}" />`
        : `<path d="${hillCrest(width, band.top, 30, 26)}" fill="${band.fill}" opacity="0.95" />`,
    )
    .join("");

  const decor = layout.decorLines
    .map(
      (groundY) => `
      <g stroke="#57a038" stroke-width="6" stroke-linecap="round" fill="none">${tufts(width, groundY)}</g>
      <g>${flowers(width, groundY)}</g>`,
    )
    .join("");

  return `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7ec8e8" />
        <stop offset="100%" stop-color="#d6f0f8" />
      </linearGradient>
      <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#8ccf63" />
        <stop offset="100%" stop-color="#6cb349" />
      </linearGradient>
    </defs>

    <rect x="0" y="0" width="${width}" height="${sceneTop}" fill="#f6ead0" />
    <rect x="0" y="${sceneTop}" width="${width}" height="10" fill="#d9c398" />

    <rect x="0" y="${sceneTop}" width="${width}" height="${height - sceneTop}" fill="url(#sky)" />

    <g transform="translate(${width - 108} ${sceneTop + 74})">
      <circle r="46" fill="#ffd23f" />
      <circle r="46" fill="none" stroke="#f6b820" stroke-width="5" />
    </g>

    <g fill="#ffffff" opacity="0.92">
      <g transform="translate(${width * 0.16} ${Math.round(sceneTop + (horizon - sceneTop) * 0.29)})">
        <circle cx="0" cy="0" r="30" /><circle cx="34" cy="8" r="24" /><circle cx="-32" cy="10" r="22" />
        <rect x="-32" y="0" width="66" height="22" rx="11" />
      </g>
      <g transform="translate(${width * 0.55} ${Math.round(sceneTop + (horizon - sceneTop) * 0.19)})">
        <circle cx="0" cy="0" r="24" /><circle cx="28" cy="6" r="19" /><circle cx="-26" cy="8" r="17" />
        <rect x="-26" y="0" width="54" height="18" rx="9" />
      </g>
    </g>

    ${bandMarkup}
    ${crests}
    ${decor}
  `;
}
