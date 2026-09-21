import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalImageDisplayUrl, setRemoteLocalImageResolver } from "./localImageDisplay";

describe("resolveLocalImageDisplayUrl", () => {
  afterEach(() => {
    setRemoteLocalImageResolver(null);
  });

  it("returns URLs unchanged when no resolver is installed (desktop behavior)", () => {
    const local = "axecode-local://local/tmp/a.png";
    expect(resolveLocalImageDisplayUrl(local)).toBe(local);
    expect(resolveLocalImageDisplayUrl("https://example.com/a.png")).toBe(
      "https://example.com/a.png",
    );
  });

  it("rewrites axecode-local URLs through the installed resolver", () => {
    setRemoteLocalImageResolver(
      (url) => `https://desktop.test/api/files/image?from=${encodeURIComponent(url)}`,
    );

    expect(resolveLocalImageDisplayUrl("axecode-local://local/tmp/a.png")).toBe(
      "https://desktop.test/api/files/image?from=axecode-local%3A%2F%2Flocal%2Ftmp%2Fa.png",
    );
    // Non axecode-local sources bypass the resolver entirely.
    expect(resolveLocalImageDisplayUrl("data:image/png;base64,AA")).toBe(
      "data:image/png;base64,AA",
    );
    expect(resolveLocalImageDisplayUrl("https://example.com/a.png")).toBe(
      "https://example.com/a.png",
    );
  });
});
