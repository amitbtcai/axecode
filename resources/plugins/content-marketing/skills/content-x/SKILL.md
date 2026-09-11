---
name: content-x
description: Draft X (Twitter) posts and threads onto the Content board. Use for tweets, threads, and X marketing drafts.
---

# X Content

Draft X posts grounded in `marketing/brand-voice.md` and `marketing/content-strategy.md`.

## Workflow

1. Read the marketing docs; call `list_content_cards` with channel `x` to avoid repeats.
2. Draft posts in the brand voice — single posts under 280 chars, or threads as numbered lines.
3. Record each with `create_content_card` — channel `x`, title = a short internal label, body = the post text (or numbered thread).

## Rules

- No hashtags unless brand-voice.md calls for them.
- Threads: one card per thread, posts numbered in the body.
- Every draft lands on the board; summarize what you created afterward.
