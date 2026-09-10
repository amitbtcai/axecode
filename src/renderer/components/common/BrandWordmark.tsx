/**
 * The Axe Code brand lockup — the Axe AI mark at cap height + "AXE CODE" in
 * all caps, as a single `currentColor` SVG so it tracks the theme foreground.
 * The mark (viewBox 0 0 197 168) is scaled to the 128-unit cap height,
 * matching `branding/brand-showcase.html`. Reads as "Axe Code" to assistive
 * tech. Mirrored inline in `mobile.html`'s boot screen.
 */
const AXE_MARK_PATHS = [
  "M97.1923 0.128124L196.375 164.224C196.545 164.505 196.159 164.786 195.947 164.536L97.1036 47.7897C96.9985 47.6655 96.8084 47.6646 96.7021 47.7878L68.7241 80.2122C68.5317 80.4351 68.1757 80.2248 68.2748 79.9469L96.7167 0.176713C96.792 -0.0344117 97.0765 -0.0634694 97.1923 0.128124Z",
  "M196.128 167.965L0.265052 168C-0.0615031 168 -0.0989738 167.521 0.223566 167.469L153.138 143.075C153.305 143.049 153.404 142.874 153.344 142.716L138.868 104.828C138.762 104.553 139.113 104.334 139.311 104.552L196.324 167.518C196.479 167.69 196.358 167.965 196.128 167.965Z",
  "M0.0463391 165.242L94.1125 0.500409C94.2762 0.213784 94.7089 0.423656 94.5886 0.731324L38.778 143.501C38.7144 143.663 38.8206 143.842 38.9929 143.863L83.2019 149.225C83.5024 149.262 83.517 149.695 83.2197 149.752L0.325476 165.638C0.102957 165.68 -0.066612 165.44 0.0463391 165.242Z",
];

// "AXE" letterforms (cap height 128, ~15.6-unit stems / 14.5-unit bars).
const AXE_GLYPH_PATHS = [
  // A
  "M118.551 128H101.977L88.3284 92.5091H30.0278L16.3788 128H0L50.1113 0H68.6349L118.551 128ZM35.6823 77.9636H82.6738L59.0806 14.9333L35.6823 77.9636Z",
  // X
  "M224.94 128H207.001L172.099 75.2485L137.002 128H118.868L163.91 62.8364L122.768 0H141.096L173.659 49.8424L206.611 0H223.575L181.848 62.0606L224.94 128Z",
  // E
  "M246.308 128V0H336.586V14.5455H261.907V55.8545H320.012V70.4H261.907V113.455H339.511V128H246.308Z",
];

// "CODE" letterforms in the same weight, each drawn at origin and placed with
// a per-glyph translate (~21-unit tracking, ~30-unit word space after "AXE").
const CODE_GLYPHS: { readonly d: string; readonly x: number; readonly evenodd?: boolean }[] = [
  {
    x: 370,
    d: "M48 0C22.5 0 4 27 4 64C4 101 22.5 128 48 128C62 128 74.5 121 82.5 109.5L70.5 98.5C64 107 56.5 113.5 48 113.5C31.5 113.5 19.5 93.5 19.5 64C19.5 34.5 31.5 14.5 48 14.5C56.5 14.5 64 21 70.5 29.5L82.5 18.5C74.5 7 62 0 48 0Z",
  },
  {
    x: 477,
    evenodd: true,
    d: "M50 0C76.5 0 96 27 96 64C96 101 76.5 128 50 128C23.5 128 4 101 4 64C4 27 23.5 0 50 0ZM50 14.5C66.5 14.5 80.5 35 80.5 64C80.5 93 66.5 113.5 50 113.5C33.5 113.5 19.5 93 19.5 64C19.5 35 33.5 14.5 50 14.5Z",
  },
  {
    x: 598,
    evenodd: true,
    d: "M0 0H44C74 0 95 27 95 64C95 101 74 128 44 128H0V0ZM15.6 14.5V113.5H40C62 113.5 79.5 93 79.5 64C79.5 35 62 14.5 40 14.5H15.6Z",
  },
  {
    x: 714,
    d: "M0 128V0H90.278V14.5455H15.599V55.8545H73.704V70.4H15.599V113.455H93.203V128H0Z",
  },
];

export function BrandWordmark({ className }: { className?: string | undefined }) {
  return (
    <svg
      viewBox="0 0 997 128"
      role="img"
      aria-label="Axe Code"
      className={`inline-block h-[1em] w-auto fill-current${className ? ` ${className}` : ""}`}
    >
      <g transform="scale(0.761905)">
        {AXE_MARK_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g transform="translate(190 0)">
        {AXE_GLYPH_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
        {CODE_GLYPHS.map(({ d, x, evenodd }) => (
          <path
            key={d}
            transform={`translate(${x} 0)`}
            {...(evenodd ? { fillRule: "evenodd" as const } : {})}
            d={d}
          />
        ))}
      </g>
    </svg>
  );
}
