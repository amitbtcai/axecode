import {
  contentPublishAttemptSchema,
  type ContentCard,
  type ContentCardChannel,
  type ContentPublishAttempt,
  type ContentPublishAttemptStatus,
} from "@/shared/contracts";
import { getSqlite } from "./connection";

/**
 * Fork-owned (Axe Code): append-oriented history of every publish run —
 * scheduled or manual. Unlike the mutable publish fields on a card, attempt
 * rows survive card edits, archival, and deletion so the user can audit what
 * the scheduler actually posted, including failures and wrong-account
 * incidents.
 */

interface ContentPublishAttemptRow {
  id: string;
  card_id: string;
  channel: string;
  title: string;
  destination_url: string | null;
  trigger_kind: string;
  status: string;
  thread_id: string | null;
  publish_url: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

function fromRow(row: ContentPublishAttemptRow): ContentPublishAttempt {
  return contentPublishAttemptSchema.parse({
    id: row.id,
    cardId: row.card_id,
    channel: row.channel,
    title: row.title,
    destinationUrl: row.destination_url,
    trigger: row.trigger_kind,
    status: row.status,
    threadId: row.thread_id,
    publishUrl: row.publish_url,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  });
}

export function dbGetPublishAttempts(cardId?: string): ContentPublishAttempt[] {
  const rows = (
    cardId
      ? getSqlite()
          .prepare(
            "SELECT * FROM content_publish_attempts WHERE card_id = ? ORDER BY started_at DESC",
          )
          .all(cardId)
      : getSqlite().prepare("SELECT * FROM content_publish_attempts ORDER BY started_at DESC").all()
  ) as ContentPublishAttemptRow[];
  return rows.map(fromRow);
}

/**
 * Open a `running` attempt when a publish thread launches. Called by the
 * publish watcher so the trigger kind and launch time are recorded even if
 * the run never reports back.
 */
export function dbStartPublishAttempt(input: {
  card: ContentCard;
  trigger: "scheduled" | "manual";
  threadId: string;
  destinationUrl: string | null;
}): ContentPublishAttempt {
  const now = new Date().toISOString();
  const attempt = contentPublishAttemptSchema.parse({
    id: crypto.randomUUID(),
    cardId: input.card.id,
    channel: input.card.channel,
    title: input.card.title,
    destinationUrl: input.destinationUrl,
    trigger: input.trigger,
    status: "running",
    threadId: input.threadId,
    publishUrl: null,
    error: null,
    startedAt: now,
    finishedAt: null,
  });
  getSqlite()
    .prepare(
      `INSERT INTO content_publish_attempts (
        id, card_id, channel, title, destination_url, trigger_kind, status,
        thread_id, publish_url, error, started_at, finished_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      attempt.id,
      attempt.cardId,
      attempt.channel,
      attempt.title,
      attempt.destinationUrl,
      attempt.trigger,
      attempt.status,
      attempt.threadId,
      attempt.publishUrl,
      attempt.error,
      attempt.startedAt,
      attempt.finishedAt,
      now,
    );
  return attempt;
}

/**
 * Close out the latest `running` attempt for a card when the publish agent
 * reports back through update_content_card. When no running attempt exists —
 * e.g. the card was marked published by hand or by a regular chat thread —
 * a finished row is inserted instead so every published link is retained.
 */
export function dbCompletePublishAttempt(input: {
  card: ContentCard;
  status: Exclude<ContentPublishAttemptStatus, "running">;
  threadId?: string | null;
  publishUrl?: string | null;
  error?: string | null;
  destinationUrl?: string | null;
  channel?: ContentCardChannel;
}): void {
  const now = new Date().toISOString();
  const running = getSqlite()
    .prepare(
      `SELECT id FROM content_publish_attempts
       WHERE card_id = ? AND status = 'running'
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(input.card.id) as { id: string } | undefined;
  if (running) {
    getSqlite()
      .prepare(
        `UPDATE content_publish_attempts
         SET status = ?, publish_url = ?, error = ?, finished_at = ?
         WHERE id = ?`,
      )
      .run(input.status, input.publishUrl ?? null, input.error ?? null, now, running.id);
    return;
  }
  getSqlite()
    .prepare(
      `INSERT INTO content_publish_attempts (
        id, card_id, channel, title, destination_url, trigger_kind, status,
        thread_id, publish_url, error, started_at, finished_at, created_at
      ) VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      input.card.id,
      input.channel ?? input.card.channel,
      input.card.title,
      input.destinationUrl ?? null,
      input.status,
      input.threadId ?? input.card.sourceThreadId,
      input.publishUrl ?? null,
      input.error ?? null,
      now,
      now,
      now,
    );
}
