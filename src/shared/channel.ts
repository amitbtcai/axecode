export type AxeCodeChannel = "stable" | "nightly";

export const AXECODE_CHANNELS: readonly AxeCodeChannel[] = ["stable", "nightly"];

declare const __AXECODE_CHANNEL__: string | undefined;

export function normalizeChannel(value: unknown): AxeCodeChannel {
  return value === "nightly" ? "nightly" : "stable";
}

export function resolveAxeCodeChannel(): AxeCodeChannel {
  return normalizeChannel(typeof __AXECODE_CHANNEL__ === "string" ? __AXECODE_CHANNEL__ : "");
}

export function productNameFor(channel: AxeCodeChannel): string {
  return channel === "nightly" ? "Axe Code Nightly" : "Axe Code";
}

export function appIdFor(channel: AxeCodeChannel): string {
  return channel === "nightly" ? "com.axecode.app.nightly" : "com.axecode.app";
}

export function userDataDirNameFor(channel: AxeCodeChannel): string {
  return channel === "nightly" ? ".axecode-nightly" : ".axecode";
}

export function updaterChannelFor(channel: AxeCodeChannel): string | undefined {
  return channel === "nightly" ? "nightly" : undefined;
}

export function artifactPrefixFor(channel: AxeCodeChannel): string {
  return channel === "nightly" ? "AxeCode-Nightly" : "AxeCode";
}
