---
name: content-marketing
description: Set up and run the marketing content pipeline — strategy docs, channel agents, and the Content board. Use when the user asks about marketing setup, content strategy, or the Content view.
---

# Content Marketing

The app's Content view (kanban board: Drafts → In review → Approved → Scheduled → Published) is fed by content cards. Every drafted piece — article, SEO post, X post, LinkedIn post — must be recorded with the `create_content_card` tool so it appears on the board.

## Strategy docs

Channel agents ground their drafts in the workspace's `marketing/` docs:

- `marketing/product-info.md` — what the product is, who it's for
- `marketing/brand-voice.md` — tone, do/don't, examples
- `marketing/content-strategy.md` — pillars, cadence, target keywords

If the user asks to set up marketing and these don't exist, create them — interview the user briefly first rather than inventing facts.

## Drafting rules

- Every produced piece → `create_content_card` with channel, title, body. Never reply with the content in chat only — it must land on the board.
- Match the channel skill's format rules (writer → markdown article, x → post ≤280 chars or numbered thread, linkedin → professional post, facebook → conversational post, youtube → title + description + script outline).
- Posts that need visuals: attach the file with `attach_content_card_media` (absolute path, kind image|video). Media stays on the user's device and is uploaded by the browser agent at publish time.
- Set `scheduledFor` only when the user or the strategy specifies a time.
- Read `list_content_cards` first to avoid duplicating drafts already on the board.

## Publishing

Users publish approved/scheduled cards themselves via "Publish with Browser", which launches a thread driving their signed-in browser. A publish thread must call `update_content_card` with `status: "published"` + `publishUrl`, or `publishError` on failure.
