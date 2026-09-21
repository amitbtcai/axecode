/// <reference types="vite/client" />

import type { AxeCodeBridge } from "@/shared/ipc";

declare global {
  interface Window {
    axecode: AxeCodeBridge;
  }
}
