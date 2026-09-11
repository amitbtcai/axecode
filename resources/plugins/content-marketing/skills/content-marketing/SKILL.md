---
name: content-marketing
description: Set up and run the marketing content pipeline — strategy docs, channel agents, the Content board, review, and publishing. Use when the user asks about marketing setup, content strategy, or the Content view.
---

# Content Marketing

The app's Content view (kanban board: Drafts → Scheduled → Published, plus a
calendar) is fed by content cards. Every drafted piece — article, SEO post, X
post, LinkedIn post, Facebook post, YouTube video — must be recorded with the
`create_content_card` tool so it appears on the board.

## Strategy docs

Channel agents ground their drafts in the workspace's `marketing/` docs:

- `marketing/product-info.md` — what the product is, who it's for
- `marketing/brand-voice.md` — tone, do/don't, examples
- `marketing/content-strategy.md` — pillars, cadence, target keywords
- `marketing/social-accounts.md` — channel → account/page URL map used at publish time

If the user asks to set up marketing and these don't exist, create them —
interview the user briefly first (especially for social-accounts.md handles)
rather than inventing facts.

## Drafting rules

- Every produced piece → `create_content_card` with channel, title, body. Never reply with the content in chat only — it must land on the board.
- Match the channel skill's format rules (writer → markdown article, x → post ≤280 chars or numbered thread, linkedin → professional post, facebook → conversational post, youtube → title + description + script outline).
- Posts that need visuals: attach the file with `attach_content_card_media` (absolute path, kind image|video). Media stays on the user's device and is uploaded by the browser agent at publish time.
- Set `scheduledFor` only when the user or the strategy specifies a time.
- Read `list_content_cards` first to avoid duplicating drafts already on the board.

## Review

The `content-cmo` skill is the review gate: English quality, brand voice,
platform fit, claims, links, required media. It fixes trivial issues in place
and flags what shouldn't ship.

## Publishing

Two paths, same playbook (the `content-publish` skill):

- **Manual** — "Publish with Browser" on a card launches a publish thread.
- **Scheduled** — when a card's `scheduledFor` time passes, the app
  automatically launches a publish thread; the agent posts via the signed-in
  browser and reports back.

A publish thread must call `update_content_card` with `status: "published"` +
`publishUrl`, or `publishError` on failure (with `status: "draft"` if the card
should not retry).
