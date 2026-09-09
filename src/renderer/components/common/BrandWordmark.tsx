/**
 * The Axe Code brand wordmark — the Axe AI mark + "Axe Code".
 *
 * The mark is the shared Axe AI glyph (viewBox 0 0 197 168), rendered at cap
 * height and inheriting `currentColor` so it tracks the theme foreground,
 * mirroring `branding/brand-showcase.html`. Reads as "Axe Code" to assistive
 * tech.
 */
const AXE_MARK_PATHS = [
  "M97.1923 0.128124L196.375 164.224C196.545 164.505 196.159 164.786 195.947 164.536L97.1036 47.7897C96.9985 47.6655 96.8084 47.6646 96.7021 47.7878L68.7241 80.2122C68.5317 80.4351 68.1757 80.2248 68.2748 79.9469L96.7167 0.176713C96.792 -0.0344117 97.0765 -0.0634694 97.1923 0.128124Z",
  "M196.128 167.965L0.265052 168C-0.0615031 168 -0.0989738 167.521 0.223566 167.469L153.138 143.075C153.305 143.049 153.404 142.874 153.344 142.716L138.868 104.828C138.762 104.553 139.113 104.334 139.311 104.552L196.324 167.518C196.479 167.69 196.358 167.965 196.128 167.965Z",
  "M0.0463391 165.242L94.1125 0.500409C94.2762 0.213784 94.7089 0.423656 94.5886 0.731324L38.778 143.501C38.7144 143.663 38.8206 143.842 38.9929 143.863L83.2019 149.225C83.5024 149.262 83.517 149.695 83.2197 149.752L0.325476 165.638C0.102957 165.68 -0.066612 165.44 0.0463391 165.242Z",
];

export function BrandWordmark({ className }: { className?: string | undefined }) {
  return (
    <span className={className} aria-label="Axe Code">
      <svg
        viewBox="0 0 197 168"
        aria-hidden="true"
        className="mr-[0.28em] inline-block h-[1em] w-auto align-[-0.1em] [fill:currentColor]"
      >
        {AXE_MARK_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      <span aria-hidden="true">
        <span className="font-bold">Axe</span> <span className="font-semibold">Code</span>
      </span>
    </span>
  );
}
