import { z } from "zod";

/**
 * Fork-owned (Axe Code): marketing content pipeline. Channel agents running as
 * scheduled threads emit these via the app-controls MCP `create_content_card`
 * tool; the renderer's Content view presents them as a kanban board and
 * calendar.
 */

export const contentCardChannelSchema = z.enum([
  "writer",
  "seo",
  "x",
  "linkedin",
  "facebook",
  "youtube",
]);
export type ContentCardChannel = z.infer<typeof contentCardChannelSchema>;

/**
 * One attached media file. `path` is an absolute on-device path under the data
 * root's attachments dir (media stays local); render via `toLocalFileUrl`.
 */
export const contentCardMediaItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["image", "video"]),
  name: z.string().min(1).max(300),
  path: z.string().min(1),
});
export type ContentCardMediaItem = z.infer<typeof contentCardMediaItemSchema>;

/**
 * Kanban column. `scheduled` carries {@link contentCardSchema.scheduled_for};
 * `published` carries `publishUrl`. `archived` hides the card from the board.
 */
export const contentCardStatusSchema = z.enum([
  "draft",
  "review",
  "approved",
  "scheduled",
  "published",
  "archived",
]);
export type ContentCardStatus = z.infer<typeof contentCardStatusSchema>;

export const contentCardSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().nullable(),
  channel: contentCardChannelSchema,
  title: z.string().trim().min(1).max(300),
  body: z.string().max(100_000),
  /** Tiptap JSON document for the WYSIWYG editor; `body` holds the plain-text publish payload. */
  bodyDoc: z.unknown().nullable(),
  media: z.array(contentCardMediaItemSchema),
  status: contentCardStatusSchema,
  scheduledFor: z.iso.datetime().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  publishUrl: z.string().nullable(),
  publishError: z.string().nullable(),
  /** GUI thread that produced the card (channel-agent run or manual edit). */
  sourceThreadId: z.string().nullable(),
  /** scheduled_task_runs.id when the card came out of a scheduled run. */
  sourceRunId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ContentCard = z.infer<typeof contentCardSchema>;

export const createContentCardPayloadSchema = z.object({
  channel: contentCardChannelSchema,
  title: z.string().trim().min(1).max(300),
  body: z.string().max(100_000).default(""),
  projectId: z.string().nullable().optional(),
  sourceThreadId: z.string().nullable().optional(),
  sourceRunId: z.string().nullable().optional(),
});
export type CreateContentCardPayload = z.infer<typeof createContentCardPayloadSchema>;

export const updateContentCardPayloadSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    channel: contentCardChannelSchema.optional(),
    title: z.string().trim().min(1).max(300).optional(),
    body: z.string().max(100_000).optional(),
    bodyDoc: z.unknown().nullable().optional(),
    media: z.array(contentCardMediaItemSchema).optional(),
    status: contentCardStatusSchema.optional(),
    scheduledFor: z.iso.datetime().nullable().optional(),
    publishUrl: z.string().nullable().optional(),
    publishError: z.string().nullable().optional(),
  }),
});
export type UpdateContentCardPayload = z.infer<typeof updateContentCardPayloadSchema>;

export const contentCardIdPayloadSchema = z.object({ id: z.string().uuid() });
export type ContentCardIdPayload = z.infer<typeof contentCardIdPayloadSchema>;

export const getContentCardsPayloadSchema = z.object({
  status: contentCardStatusSchema.optional(),
  channel: contentCardChannelSchema.optional(),
  projectId: z.string().nullable().optional(),
});
export type GetContentCardsPayload = z.infer<typeof getContentCardsPayloadSchema>;

/** Attach a media file to a card — bytes stored on-device under attachments. */
export const saveContentCardMediaPayloadSchema = z.object({
  cardId: z.string().uuid(),
  fileName: z.string().min(1).max(300),
  kind: z.enum(["image", "video"]),
  dataBase64: z.string().min(1),
});
export type SaveContentCardMediaPayload = z.infer<typeof saveContentCardMediaPayloadSchema>;

/**
 * Where a channel publishes — the account/page the browser agent should post
 * from. `label` is a display name (handle or page name); `url` is the
 * destination the agent navigates to.
 */
export const contentSocialAccountSchema = z.object({
  channel: contentCardChannelSchema,
  label: z.string().max(200),
  url: z.string().max(2000),
});
export type ContentSocialAccount = z.infer<typeof contentSocialAccountSchema>;

export const setContentSocialAccountPayloadSchema = z.object({
  channel: contentCardChannelSchema,
  label: z.string().max(200).default(""),
  url: z.string().max(2000).default(""),
});
export type SetContentSocialAccountPayload = z.infer<typeof setContentSocialAccountPayloadSchema>;
