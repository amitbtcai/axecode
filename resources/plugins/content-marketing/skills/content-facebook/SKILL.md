---
name: content-facebook
description: Draft Facebook posts onto the Content board. Use for Facebook page content and post drafts.
---

# Facebook Content

Draft Facebook posts grounded in `marketing/brand-voice.md` and `marketing/content-strategy.md`.

## Workflow

1. Read the marketing docs; call `list_content_cards` with channel `facebook` to avoid repeats.
2. Draft posts in the brand voice — conversational, short paragraphs, one clear point per post.
3. If a post needs an image or graphic, create it (or note what's needed in the body) and attach it with `attach_content_card_media` — files stay on the user's device.
4. Record each with `create_content_card` — channel `facebook`, title = a short internal label, body = the post text.

## Rules

- Match the strategy's topics; no invented claims beyond product-info.md.
- Every draft lands on the board; summarize afterward.
