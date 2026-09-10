export const chatMessageSurfaceClass = "w-full rounded-3xl px-3 py-2";

/**
 * Surface for user-authored rows (the user message and the question/answer
 * prompt). The tertiary fill alone delineates them from transparent agent
 * rows — no border, matching the borderless composer.
 */
export const chatPromptSurfaceClass = `${chatMessageSurfaceClass} relative`;
