export type PoracodeChannel = "stable" | "nightly";

export const PORACODE_CHANNELS: readonly PoracodeChannel[] = ["stable", "nightly"];

declare const __PORACODE_CHANNEL__: string | undefined;

export function normalizeChannel(value: unknown): PoracodeChannel {
  return value === "nightly" ? "nightly" : "stable";
}

export function resolvePoracodeChannel(): PoracodeChannel {
  return normalizeChannel(typeof __PORACODE_CHANNEL__ === "string" ? __PORACODE_CHANNEL__ : "");
}

export function productNameFor(channel: PoracodeChannel): string {
  return channel === "nightly" ? "Axe Code Nightly" : "Axe Code";
}

export function appIdFor(channel: PoracodeChannel): string {
  return channel === "nightly" ? "com.axecode.app.nightly" : "com.axecode.app";
}

export function userDataDirNameFor(channel: PoracodeChannel): string {
  return channel === "nightly" ? ".axecode-nightly" : ".axecode";
}

export function updaterChannelFor(channel: PoracodeChannel): string | undefined {
  return channel === "nightly" ? "nightly" : undefined;
}

export function artifactPrefixFor(channel: PoracodeChannel): string {
  return channel === "nightly" ? "AxeCode-Nightly" : "AxeCode";
}
