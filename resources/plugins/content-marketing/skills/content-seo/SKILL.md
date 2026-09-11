---
name: content-seo
description: Draft keyword-targeted SEO posts and briefs onto the Content board. Use for SEO content, keyword gaps, or search-optimized drafts.
---

# SEO Content

Draft search-targeted posts grounded in `marketing/content-strategy.md` (target keywords, audience) and `marketing/product-info.md`.

## Workflow

1. Read `marketing/content-strategy.md` for the keyword list and priorities.
2. Call `list_content_cards` with channel `seo` to avoid repeating covered keywords.
3. For each keyword/topic: write a post draft — keyword in the title and first paragraph, descriptive H2s, FAQ-style sections where they fit.
4. Record each draft with `create_content_card` — channel `seo`, title = the SEO headline, body = the markdown draft.

## Rules

- One primary keyword per card; don't keyword-stuff.
- Titles stay under ~60 chars where possible.
- If the strategy doc has no keyword list, ask the user or derive 3-5 obvious ones from product-info.md and say that's what you did.
