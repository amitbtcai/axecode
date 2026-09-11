---
name: content-youtube
description: Draft YouTube video concepts, titles, descriptions, and scripts onto the Content board. Use for YouTube content planning and upload drafts.
---

# YouTube Content

Draft YouTube content grounded in `marketing/content-strategy.md` and `marketing/product-info.md`.

## Workflow

1. Read the marketing docs; call `list_content_cards` with channel `youtube` to avoid repeats.
2. Each card is a video concept: title = the video title, body = description + short script outline (hook, sections, CTA).
3. If a thumbnail or clip file exists, attach it with `attach_content_card_media` — files stay on the user's device.
4. Record each with `create_content_card` — channel `youtube`.

## Rules

- Titles under ~70 chars; front-load the searchable phrase.
- Description: first two lines carry the hook (shown in search), then summary + links.
- Every draft lands on the board; summarize afterward.
