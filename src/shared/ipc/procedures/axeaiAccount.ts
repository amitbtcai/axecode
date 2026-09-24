import type { AxeAiAccountLinkStartResult, AxeAiAccountLinkState } from "../../contracts";
import { defineNoArgProcedure } from "../core";

/**
 * AxeAI account link for remote access — device-code sign-in state owned by
 * the main process (the credential never crosses into the renderer).
 */
export const axeAiAccountProcedures = {
  startAxeAiAccountLink: defineNoArgProcedure<AxeAiAccountLinkStartResult, "main-local">(
    "startAxeAiAccountLink",
    "main-local",
  ),
  cancelAxeAiAccountLink: defineNoArgProcedure<void, "main-local">(
    "cancelAxeAiAccountLink",
    "main-local",
  ),
  getAxeAiAccountLinkState: defineNoArgProcedure<AxeAiAccountLinkState, "main-local">(
    "getAxeAiAccountLinkState",
    "main-local",
  ),
  signOutAxeAiAccount: defineNoArgProcedure<void, "main-local">(
    "signOutAxeAiAccount",
    "main-local",
  ),
} as const;
