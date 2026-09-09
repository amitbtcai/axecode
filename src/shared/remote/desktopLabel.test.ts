import { describe, expect, it } from "vitest";
import { desktopTitle } from "./desktopLabel";

describe("desktopTitle", () => {
  it("strips the current brand prefix", () => {
    expect(desktopTitle("Axe Code on Mac")).toBe("Mac");
    expect(desktopTitle("Axe Code on work-laptop")).toBe("work-laptop");
  });

  it("strips legacy prefixes from desktops paired before each rebrand", () => {
    expect(desktopTitle("Poracode on Mac")).toBe("Mac");
    expect(desktopTitle("Lightcode on Mac")).toBe("Mac");
  });

  it("is case-insensitive", () => {
    expect(desktopTitle("axe code on Mac")).toBe("Mac");
  });

  it("leaves labels without a brand prefix untouched", () => {
    expect(desktopTitle("Mac")).toBe("Mac");
    expect(desktopTitle("studio")).toBe("studio");
  });

  it("falls back to the input when stripping would empty it", () => {
    expect(desktopTitle("Axe Code on ")).toBe("Axe Code on ");
  });
});
