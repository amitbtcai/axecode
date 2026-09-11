import { existsSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import {
  contentCardChannelSchema,
  contentCardStatusSchema,
  type ContentCardMediaItem,
} from "@/shared/contracts";
import {
  dbCreateContentCard,
  dbDeleteContentCard,
  dbGetContentCard,
  dbGetContentCards,
  dbUpdateContentCard,
  type ContentCardPatch,
} from "../../../db";
import { isHomeProjectId } from "@/shared/homeScope";
import type { ToolDomain } from "./types";

/**
 * Fork-owned (Axe Code): the marketing content pipeline. Channel-agent threads
 * call create_content_card to drop drafted posts/articles onto the Content
 * board; users then review, schedule, and publish them from the UI.
 */

const createArgsSchema = z.object({
  channel: contentCardChannelSchema,
  title: z.string().trim().min(1).max(300),
  body: z.string().max(100_000),
  scheduledFor: z.iso.datetime().optional(),
});

const updateArgsSchema = z.object({
  id: z.string().uuid(),
  channel: contentCardChannelSchema.optional(),
  title: z.string().trim().min(1).max(300).optional(),
  body: z.string().max(100_000).optional(),
  status: contentCardStatusSchema.optional(),
  scheduledFor: z.iso.datetime().nullable().optional(),
  publishUrl: z.string().nullable().optional(),
  publishError: z.string().nullable().optional(),
});

const listArgsSchema = z.object({
  status: contentCardStatusSchema.optional(),
  channel: contentCardChannelSchema.optional(),
});

const idArgsSchema = z.object({ id: z.string().uuid() });

const attachMediaArgsSchema = z.object({
  id: z.string().uuid(),
  path: z.string().min(1),
  kind: z.enum(["image", "video"]),
  name: z.string().min(1).max(300).optional(),
});

function requireCard(id: string) {
  const card = dbGetContentCard(id);
  if (!card) {
    throw new Error(`Content card not found: ${id}. Call list_content_cards to see valid ids.`);
  }
  return card;
}

export const contentCardTools: ToolDomain = {
  specs: [
    {
      name: "create_content_card",
      description:
        "Add a drafted piece of marketing content to the app's Content board (Drafts column). " +
        "Use this for every piece a content/marketing task produces: articles, SEO posts, " +
        "X posts/threads, LinkedIn posts. The user reviews and schedules them from the board.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["channel", "title"],
        properties: {
          channel: {
            type: "string",
            enum: ["writer", "seo", "x", "linkedin", "facebook", "youtube"],
            description:
              "writer = long-form article, seo = SEO-targeted post/brief, x = X (Twitter) post, linkedin = LinkedIn post, facebook = Facebook post, youtube = YouTube video/upload",
          },
          title: { type: "string", minLength: 1, maxLength: 300 },
          body: { type: "string", maxLength: 100000 },
          scheduledFor: {
            type: "string",
            format: "date-time",
            description: "Optional ISO timestamp proposing when this should be published.",
          },
        },
      },
    },
    {
      name: "update_content_card",
      description:
        "Revise an existing content card — title/body edits, status moves, schedule changes.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: {
          id: { type: "string", format: "uuid" },
          channel: {
            type: "string",
            enum: ["writer", "seo", "x", "linkedin", "facebook", "youtube"],
          },
          title: { type: "string", minLength: 1, maxLength: 300 },
          body: { type: "string", maxLength: 100000 },
          status: {
            type: "string",
            enum: ["draft", "review", "approved", "scheduled", "published", "archived"],
          },
          scheduledFor: { type: ["string", "null"], format: "date-time" },
          publishUrl: { type: ["string", "null"] },
          publishError: { type: ["string", "null"] },
        },
      },
    },
    {
      name: "list_content_cards",
      description: "List content board cards, optionally filtered by status or channel.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: {
            type: "string",
            enum: ["draft", "review", "approved", "scheduled", "published", "archived"],
          },
          channel: {
            type: "string",
            enum: ["writer", "seo", "x", "linkedin", "facebook", "youtube"],
          },
        },
      },
    },
    {
      name: "attach_content_card_media",
      description:
        "Attach an on-device image or video file to a content card (e.g. a generated " +
        "thumbnail or post image). Pass an absolute path; the file is referenced by the " +
        "card and shown on the Content board for publishing.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["id", "path", "kind"],
        properties: {
          id: { type: "string", format: "uuid" },
          path: { type: "string", description: "Absolute path to an image or video file." },
          kind: { type: "string", enum: ["image", "video"] },
          name: { type: "string", maxLength: 300 },
        },
      },
    },
    {
      name: "delete_content_card",
      description: "Permanently delete a content card.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: { id: { type: "string", format: "uuid" } },
      },
    },
  ],
  handlers: {
    create_content_card: (args, ctx) => {
      const parsed = createArgsSchema.parse(args);
      const sourceThread = ctx.identity.threadId ? ctx.getThread(ctx.identity.threadId) : null;
      const projectId =
        sourceThread && !isHomeProjectId(sourceThread.projectId) ? sourceThread.projectId : null;
      const card = dbCreateContentCard({
        channel: parsed.channel,
        title: parsed.title,
        body: parsed.body,
        sourceThreadId: ctx.identity.threadId ?? null,
        ...(projectId ? { projectId } : {}),
      });
      if (parsed.scheduledFor) {
        return (
          dbUpdateContentCard(card.id, {
            status: "scheduled",
            scheduledFor: parsed.scheduledFor,
          }) ?? card
        );
      }
      return card;
    },
    update_content_card: (args, _ctx) => {
      const parsed = updateArgsSchema.parse(args);
      requireCard(parsed.id);
      const patch: ContentCardPatch = {};
      if (parsed.channel !== undefined) patch.channel = parsed.channel;
      if (parsed.title !== undefined) patch.title = parsed.title;
      if (parsed.body !== undefined) patch.body = parsed.body;
      if (parsed.status !== undefined) patch.status = parsed.status;
      if (parsed.scheduledFor !== undefined) patch.scheduledFor = parsed.scheduledFor;
      if (parsed.publishUrl !== undefined) patch.publishUrl = parsed.publishUrl;
      if (parsed.publishError !== undefined) patch.publishError = parsed.publishError;
      return dbUpdateContentCard(parsed.id, patch);
    },
    list_content_cards: (args, _ctx) => {
      const parsed = listArgsSchema.parse(args);
      return dbGetContentCards({
        ...(parsed.status !== undefined ? { status: parsed.status } : {}),
        ...(parsed.channel !== undefined ? { channel: parsed.channel } : {}),
      });
    },
    attach_content_card_media: (args, _ctx) => {
      const parsed = attachMediaArgsSchema.parse(args);
      const card = requireCard(parsed.id);
      if (!existsSync(parsed.path)) {
        throw new Error(`Media file not found: ${parsed.path}`);
      }
      const item: ContentCardMediaItem = {
        id: crypto.randomUUID(),
        kind: parsed.kind,
        name: parsed.name ?? basename(parsed.path),
        path: parsed.path,
      };
      return dbUpdateContentCard(card.id, { media: [...card.media, item] });
    },
    delete_content_card: (args, _ctx) => {
      const parsed = idArgsSchema.parse(args);
      requireCard(parsed.id);
      dbDeleteContentCard(parsed.id);
      return { deleted: parsed.id };
    },
  },
};
