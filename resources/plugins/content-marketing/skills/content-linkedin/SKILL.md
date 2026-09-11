---
name: content-linkedin
description: Draft LinkedIn posts onto the Content board. Use for LinkedIn marketing content and professional-post drafts.
---

# LinkedIn Content

Draft LinkedIn posts grounded in `marketing/brand-voice.md` and `marketing/content-strategy.md`.

## Workflow

1. Read the marketing docs; call `list_content_cards` with channel `linkedin` to avoid repeats.
2. Draft posts in the brand voice — a hook first line, short paragraphs, concrete takeaway. Longer than X, tighter than an article.
3. Record each with `create_content_card` — channel `linkedin`, title = a short internal label, body = the post text.

## Rules

- No engagement bait ("comment below!") unless brand-voice.md allows it.
- Match the strategy's topics; don't invent metrics or claims not in product-info.md.
- Every draft lands on the board; summarize afterward.
