import {
  contentCardSchema,
  contentSocialAccountSchema,
  type ContentCard,
  type ContentCardChannel,
  type ContentCardStatus,
  type ContentSocialAccount,
  type CreateContentCardPayload,
} from "@/shared/contracts";
import { getSqlite } from "./connection";

/**
 * Fork-owned (Axe Code): persistence for the marketing content pipeline. Cards
 * are created by channel-agent threads through the app-controls MCP tools or
 * manually from the Content board, and moved between statuses there.
 */

interface ContentCardRow {
  id: string;
  project_id: string | null;
  channel: string;
  title: string;
  body: string;
  body_doc: string | null;
  media: string;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  publish_url: string | null;
  publish_error: string | null;
  source_thread_id: string | null;
  source_run_id: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: ContentCardRow): ContentCard {
  let bodyDoc: unknown = null;
  if (row.body_doc) {
    try {
      bodyDoc = JSON.parse(row.body_doc);
    } catch {
      bodyDoc = null;
    }
  }
  let media: unknown = [];
  try {
    media = JSON.parse(row.media || "[]");
  } catch {
    media = [];
  }
  return contentCardSchema.parse({
    id: row.id,
    projectId: row.project_id,
    channel: row.channel,
    title: row.title,
    body: row.body,
    bodyDoc,
    media,
    status: row.status,
    scheduledFor: row.scheduled_for,
    publishedAt: row.published_at,
    publishUrl: row.publish_url,
    publishError: row.publish_error,
    sourceThreadId: row.source_thread_id,
    sourceRunId: row.source_run_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function dbGetContentCards(filter?: {
  status?: ContentCardStatus;
  channel?: ContentCardChannel;
  projectId?: string | null;
}): ContentCard[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter?.status) {
    clauses.push("status = ?");
    params.push(filter.status);
  }
  if (filter?.channel) {
    clauses.push("channel = ?");
    params.push(filter.channel);
  }
  if (filter?.projectId !== undefined) {
    if (filter.projectId === null) clauses.push("project_id IS NULL");
    else {
      clauses.push("project_id = ?");
      params.push(filter.projectId);
    }
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getSqlite()
    .prepare(`SELECT * FROM content_cards ${where} ORDER BY updated_at DESC`)
    .all(...params) as ContentCardRow[];
  return rows.map(fromRow);
}

export function dbGetContentCard(id: string): ContentCard | null {
  const row = getSqlite().prepare("SELECT * FROM content_cards WHERE id = ?").get(id) as
    | ContentCardRow
    | undefined;
  return row ? fromRow(row) : null;
}

export function dbCreateContentCard(payload: CreateContentCardPayload): ContentCard {
  const now = new Date().toISOString();
  const card = contentCardSchema.parse({
    id: crypto.randomUUID(),
    projectId: payload.projectId ?? null,
    channel: payload.channel,
    title: payload.title,
    body: payload.body,
    bodyDoc: null,
    media: [],
    status: "draft",
    scheduledFor: null,
    publishedAt: null,
    publishUrl: null,
    publishError: null,
    sourceThreadId: payload.sourceThreadId ?? null,
    sourceRunId: payload.sourceRunId ?? null,
    createdAt: now,
    updatedAt: now,
  });
  getSqlite()
    .prepare(
      `INSERT INTO content_cards (
        id, project_id, channel, title, body, body_doc, media, status, scheduled_for,
        published_at, publish_url, publish_error, source_thread_id, source_run_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      card.id,
      card.projectId,
      card.channel,
      card.title,
      card.body,
      null,
      "[]",
      card.status,
      card.scheduledFor,
      null,
      card.publishUrl,
      card.publishError,
      card.sourceThreadId,
      card.sourceRunId,
      card.createdAt,
      card.updatedAt,
    );
  return card;
}

export interface ContentCardPatch {
  channel?: ContentCardChannel;
  title?: string;
  body?: string;
  bodyDoc?: unknown;
  media?: ContentCard["media"];
  status?: ContentCardStatus;
  scheduledFor?: string | null;
  publishUrl?: string | null;
  publishError?: string | null;
  sourceThreadId?: string | null;
}

export function dbUpdateContentCard(id: string, patch: ContentCardPatch): ContentCard | null {
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];
  if (patch.channel !== undefined) {
    sets.push("channel = ?");
    params.push(patch.channel);
  }
  if (patch.title !== undefined) {
    sets.push("title = ?");
    params.push(patch.title);
  }
  if (patch.body !== undefined) {
    sets.push("body = ?");
    params.push(patch.body);
  }
  if (patch.bodyDoc !== undefined) {
    sets.push("body_doc = ?");
    params.push(patch.bodyDoc === null ? null : JSON.stringify(patch.bodyDoc));
  }
  if (patch.media !== undefined) {
    sets.push("media = ?");
    params.push(JSON.stringify(patch.media));
  }
  if (patch.status !== undefined) {
    sets.push("status = ?");
    params.push(patch.status);
    // Stamp the publish moment once — the calendar keys published cards by it.
    if (patch.status === "published") {
      sets.push("published_at = COALESCE(published_at, ?)");
      params.push(now);
    }
  }
  if (patch.scheduledFor !== undefined) {
    sets.push("scheduled_for = ?");
    params.push(patch.scheduledFor);
  }
  if (patch.publishUrl !== undefined) {
    sets.push("publish_url = ?");
    params.push(patch.publishUrl);
  }
  if (patch.publishError !== undefined) {
    sets.push("publish_error = ?");
    params.push(patch.publishError);
  }
  if (patch.sourceThreadId !== undefined) {
    sets.push("source_thread_id = ?");
    params.push(patch.sourceThreadId);
  }
  params.push(id);
  getSqlite()
    .prepare(`UPDATE content_cards SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params);
  return dbGetContentCard(id);
}

export function dbDeleteContentCard(id: string): void {
  getSqlite().prepare("DELETE FROM content_cards WHERE id = ?").run(id);
}

// --- Social accounts: channel → publish destination ---

export function dbGetContentSocialAccounts(): ContentSocialAccount[] {
  const rows = getSqlite()
    .prepare("SELECT channel, label, url FROM content_social_accounts ORDER BY channel")
    .all() as { channel: string; label: string; url: string }[];
  return rows.map((row) => contentSocialAccountSchema.parse(row));
}

export function dbSetContentSocialAccount(
  channel: ContentCardChannel,
  label: string,
  url: string,
): void {
  getSqlite()
    .prepare(
      `INSERT INTO content_social_accounts (channel, label, url, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(channel) DO UPDATE SET label = excluded.label, url = excluded.url, updated_at = excluded.updated_at`,
    )
    .run(channel, label, url, new Date().toISOString());
}
