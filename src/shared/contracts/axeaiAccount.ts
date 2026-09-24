import { z } from "zod";

/**
 * AxeAI account link state surfaced to the renderer settings UI.
 *
 * Wire boundary: persisted in main (encrypted) and shipped over IPC. The
 * status union is additive — new statuses extend the enum, old renderers see
 * an unknown status and should render "signed-out" behaviour.
 */
export const axeAiAccountLinkStateSchema = z.object({
  status: z.enum(["signed-out", "linking", "linked", "error"]),
  /** Shown while `status === "linking"`: the code the user approves on the web. */
  code: z.string().optional(),
  expiresAt: z.string().optional(),
  verificationUrl: z.string().optional(),
  accountLabel: z.string().optional(),
  linkedAt: z.string().optional(),
  error: z.string().optional(),
});
export type AxeAiAccountLinkState = z.infer<typeof axeAiAccountLinkStateSchema>;

export const axeAiAccountLinkStartResultSchema = z.object({
  status: z.literal("linking"),
  code: z.string(),
  expiresAt: z.string(),
  verificationUrl: z.string(),
});
export type AxeAiAccountLinkStartResult = z.infer<typeof axeAiAccountLinkStartResultSchema>;
