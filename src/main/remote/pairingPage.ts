import { type PoracodeChannel, productNameFor, resolvePoracodeChannel } from "@/shared/channel";

function jsonForScript(value: string): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

/**
 * Shared skeleton for the two server-rendered dark pages in this file (the
 * pairing fallback and the forward-enter error). Both are emitted outside the
 * renderer bundle, so they carry no i18n and hand-roll their own minimal HTML.
 * The shell owns the doctype, viewport/theme meta, channel-branded title, and
 * the `<style>`/`<body>` wrappers so that boilerplate lives in one place; each
 * caller supplies any extra `<head>` markup, its page-specific CSS, and the
 * `<body>` inner markup.
 */
function buildDarkPageShell(input: {
  readonly headExtra?: string;
  readonly css: string;
  readonly body: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#070709" />
  <title>${productNameFor(resolvePoracodeChannel())}</title>${input.headExtra ?? ""}
  <style>
${input.css}
  </style>
</head>
<body>
${input.body}
</body>
</html>
`;
}

export function buildLocalPairingPageHtml(input: { readonly httpBaseUrl: string }): string {
  const endpointJson = jsonForScript(input.httpBaseUrl);

  return buildDarkPageShell({
    headExtra: `
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" href="/app-icon.svg" />`,
    css: `    :root {
      color-scheme: dark;
      --bg: #070709;
      --panel: #0e0e14;
      --line: rgba(255, 255, 255, 0.12);
      --text: #eaf0fb;
      --muted: #9ba6be;
      --accent: #8892ef;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
    }
    button {
      font: inherit;
    }
    .app {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: calc(24px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));
    }
    main {
      width: min(100%, 520px);
      display: grid;
      gap: 16px;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 20px;
      background: var(--panel);
    }
    h1 {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.45;
    }
    .inline-code {
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.92em;
    }
    .endpoint {
      display: block;
      overflow-wrap: anywhere;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.04);
      color: var(--muted);
      font-size: 13px;
    }`,
    body: `  <div class="app">
    <main>
      <h1>${productNameFor(resolvePoracodeChannel())}</h1>
      <p>The mobile web app bundle is not available from this desktop build. Rebuild ${productNameFor(resolvePoracodeChannel())} so <span class="inline-code">mobile.html</span> is included in the renderer output, then open the pairing link again.</p>
      <p>Desktop endpoint</p>
      <code class="endpoint" id="endpoint"></code>
    </main>
  </div>
  <script>
    document.getElementById("endpoint").textContent = ${endpointJson};
  </script>`,
  });
}

/** Plain error page for a failed `GET /forward/<id>/enter` (invalid/expired
 * token, or a forward that was stopped since the token was minted). Server-
 * rendered outside the renderer bundle, so — like the rest of this file — it
 * carries no i18n; the phone only lands here on a broken/expired deep link. */
export function buildForwardEnterErrorPageHtml(): string {
  return buildDarkPageShell({
    css: `    :root {
      color-scheme: dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #070709;
      color: #eaf0fb;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
    }
    main {
      width: min(100%, 480px);
      display: grid;
      gap: 12px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      padding: 20px;
      background: #0e0e14;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      line-height: 1.2;
    }
    p {
      margin: 0;
      color: #9ba6be;
      line-height: 1.45;
    }`,
    body: `  <main>
    <h1>Link expired</h1>
    <p>This forwarded-port link is invalid, expired, or the forward was closed on the desktop. Reopen it from the app.</p>
  </main>`,
  });
}

// Pairing from a nightly desktop installs a nightly PWA: same identity rules as
// the hosted build (scripts/finalize-mobile-build.mjs), so the two never look
// alike on a home screen.
function pairingIconBaseName(channel: PoracodeChannel): string {
  return channel === "nightly" ? "icon-nightly" : "icon";
}

function buildPairingManifest(channel: PoracodeChannel): string {
  const icon = pairingIconBaseName(channel);
  const name = productNameFor(channel);
  return JSON.stringify({
    id: "/app",
    name,
    short_name: name,
    start_url: "/app",
    scope: "/",
    display: "standalone",
    // Matches the installed PWA's splash/status chrome to the app's dark
    // background (mobile.html theme-color).
    background_color: "#070709",
    theme_color: "#070709",
    // PNG icons are copied from public/ into the built renderer (/icons) and
    // served by tryServeBuiltMobileApp; the SVG falls back for older builds.
    icons: [
      { src: `/icons/${icon}-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/icons/${icon}-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: `/icons/${icon}-maskable-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      // Served inline by httpRouter, which renders the channel's art at this
      // one path — no per-channel URL needed for the SVG.
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  });
}

export function buildLocalPairingManifestJson(
  channel: PoracodeChannel = resolvePoracodeChannel(),
): string {
  return buildPairingManifest(channel);
}

const LOCAL_PAIRING_SERVICE_WORKER_JS = `const CACHE_NAME = "poracode-remote-local-__PORACODE_LOCAL_BUILD_VERSION__";
const LEGACY_CACHE_NAME = "lightcode-remote-local-v1";
const NAVIGATION_FALLBACK_DELAY_MS = 500;
const SHELL_URLS = ["/app", "/manifest.webmanifest", "/app-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.delete(LEGACY_CACHE_NAME),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("poracode-remote-local-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
    ]).then(() => self.clients.claim()),
  );
});

function parsePushPayload(event) {
  try {
    const payload = event.data?.json();
    if (
      !payload ||
      typeof payload.title !== "string" ||
      typeof payload.body !== "string" ||
      typeof payload.threadId !== "string" ||
      typeof payload.url !== "string" ||
      !/^\\/(?!\\/)[^?#]*$/.test(payload.url)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  if (!payload) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      if (windows.some((client) => client.visibilityState === "visible")) return;
      return self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "__PORACODE_LOCAL_NOTIFICATION_ICON__",
        badge: "__PORACODE_LOCAL_NOTIFICATION_ICON__",
        tag: \`poracode-thread-\${payload.threadId}\`,
        data: { url: payload.url },
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url;
  if (typeof path !== "string" || !/^\\/(?!\\/)[^?#]*$/.test(path)) return;
  const targetUrl = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/oauth/") || url.pathname === "/ws") return;
  const isAppRequest = url.pathname === "/app" || url.pathname.startsWith("/app/");
  const isPwaStaticRequest =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/poracode-ssh-runtime/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/app-icon.svg" ||
    url.pathname === "/notification.mp3";
  if (!isAppRequest && !isPwaStaticRequest) return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const contentType = response.headers.get("content-type") ?? "";
            if (response.ok && contentType.startsWith("text/html")) {
              return new Response("Not found", { status: 404, statusText: "Not Found" });
            }
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    const networkResponse = fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put("/app", response.clone());
      }
      return response;
    });
    const cachedResponse = new Promise((resolve) => {
      setTimeout(() => {
        caches.match("/app").then(resolve);
      }, NAVIGATION_FALLBACK_DELAY_MS);
    });
    event.waitUntil(networkResponse.then(() => undefined, () => undefined));
    event.respondWith(
      Promise.race([networkResponse, cachedResponse])
        .then((response) => response || networkResponse)
        .catch(() => caches.match("/app").then((cached) => cached || Response.error())),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          const cacheKey = request.mode === "navigate" ? "/app" : request;
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/app"))),
  );
});
`;

export function buildLocalPairingServiceWorkerJs(
  appVersion: string,
  channel: PoracodeChannel = resolvePoracodeChannel(),
): string {
  const buildVersion = appVersion.replace(/[^a-zA-Z0-9._-]/g, "-");
  return LOCAL_PAIRING_SERVICE_WORKER_JS.replace(
    "__PORACODE_LOCAL_BUILD_VERSION__",
    buildVersion,
  ).replaceAll(
    "__PORACODE_LOCAL_NOTIFICATION_ICON__",
    `/icons/${pairingIconBaseName(channel)}-192.png`,
  );
}

// Kept in sync with public/app-icon.svg and public/app-icon-nightly.svg (the
// static/standalone icons). The tile is approximated with a rounded rect rather
// than the masters' squircle path — at favicon and home-screen sizes the two
// are indistinguishable, and it keeps this inline copy readable. The glyph is
// the same Axe mark as branding/assets/axecode-glyph.svg, scaled to the 1024
// viewBox.
const PAIRING_ICON_GLYPH = `  <g transform="translate(187 235) scale(3.3)" fill="__GLYPH__">
    <path d="M97.1923 0.128124L196.375 164.224C196.545 164.505 196.159 164.786 195.947 164.536L97.1036 47.7897C96.9985 47.6655 96.8084 47.6646 96.7021 47.7878L68.7241 80.2122C68.5317 80.4351 68.1757 80.2248 68.2748 79.9469L96.7167 0.176713C96.792 -0.0344117 97.0765 -0.0634694 97.1923 0.128124Z"/>
    <path d="M196.128 167.965L0.265052 168C-0.0615031 168 -0.0989738 167.521 0.223566 167.469L153.138 143.075C153.305 143.049 153.404 142.874 153.344 142.716L138.868 104.828C138.762 104.553 139.113 104.334 139.311 104.552L196.324 167.518C196.479 167.69 196.358 167.965 196.128 167.965Z"/>
    <path d="M0.0463391 165.242L94.1125 0.500409C94.2762 0.213784 94.7089 0.423656 94.5886 0.731324L38.778 143.501C38.7144 143.663 38.8206 143.842 38.9929 143.863L83.2019 149.225C83.5024 149.262 83.517 149.695 83.2197 149.752L0.325476 165.638C0.102957 165.68 -0.066612 165.44 0.0463391 165.242Z"/>
  </g>`;

const PAIRING_ICON_TILE: Record<
  PoracodeChannel,
  { readonly fill: string; readonly glyph: string }
> = {
  stable: { fill: "#060AE6", glyph: "#FFFFFF" },
  // Matches branding/assets/axecode-icon-nightly's teal gradient tile.
  nightly: { fill: "url(#nightlyTile)", glyph: "#0B1220" },
};

const NIGHTLY_TILE_DEFS = `  <defs>
    <linearGradient id="nightlyTile" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#3BE0DA"/>
      <stop offset="1" stop-color="#12A6B8"/>
    </linearGradient>
  </defs>
`;

export function buildLocalPairingIconSvg(
  channel: PoracodeChannel = resolvePoracodeChannel(),
): string {
  const tile = PAIRING_ICON_TILE[channel];
  const defs = channel === "nightly" ? NIGHTLY_TILE_DEFS : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="${productNameFor(channel)}">
${defs}  <rect width="1024" height="1024" rx="232" fill="${tile.fill}"/>
${PAIRING_ICON_GLYPH.replace("__GLYPH__", tile.glyph)}
</svg>
`;
}
