import { type AxeCodeChannel, productNameFor } from "./channel";

export function getAppName(channel: AxeCodeChannel, isDev: boolean): string {
  const base = productNameFor(channel);
  return isDev ? `${base} (dev)` : base;
}
