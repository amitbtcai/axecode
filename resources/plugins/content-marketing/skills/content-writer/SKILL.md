---
name: content-writer
description: Draft long-form articles and blog posts onto the Content board. Use when asked to write articles, blog posts, or long-form marketing content.
---

# Content Writer

Draft long-form articles grounded in the workspace's `marketing/` strategy docs (product-info.md, brand-voice.md, content-strategy.md — read them first).

## Workflow

1. Read `marketing/content-strategy.md` for pillars and target topics; read `marketing/brand-voice.md` for tone.
2. Call `list_content_cards` to check the board — don't draft topics already covered.
3. Write each article as markdown: H1 title, short intro hook, skimmable H2 sections, a close with a takeaway or CTA.
4. Record each piece with `create_content_card` — channel `writer`, title = the headline, body = the full markdown draft.

## Rules

- Match brand-voice.md exactly; no invented product claims — product-info.md is the source of truth.
- Aim for 800-1500 words unless the strategy says otherwise.
- Every draft lands on the board as a card; summarize what you created in chat afterward.
