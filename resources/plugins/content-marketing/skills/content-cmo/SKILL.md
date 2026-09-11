---
name: content-cmo
description: Review and proofread content cards like a CMO — brand voice, English quality, platform fit, claims, and links. Use to audit drafts before they are scheduled or published.
---

# Content CMO Review

Act as the marketing lead reviewing the Content board. Approve, fix, or flag
each card before it goes out.

## Inputs

- `list_content_cards` — the cards to review (usually status `draft` or
  `scheduled`, optionally filtered by channel).
- `marketing/brand-voice.md` — tone and vocabulary rules.
- `marketing/content-strategy.md` — pillars, audience, what to push.
- `marketing/social-accounts.md` — channel → account map.

## Checklist per card

1. **English** — grammar, spelling, clarity. Fix small issues directly with
   `update_content_card` (title/body).
2. **Brand voice** — matches brand-voice.md; no banned phrases or hype claims.
3. **Platform fit** — X ≤280 (or a properly numbered thread), LinkedIn ≤3000,
   YouTube needs a real title + description + video file attached.
4. **Evidence** — claims must be reproducible/verifiable; flag anything
   invented or exaggerated.
5. **Destination & links** — every post points somewhere sensible; UTM params
   match content-strategy.md conventions.
6. **Media** — required attachments present for the channel.

## Outcomes

- Fix trivial issues in place via `update_content_card`.
- Leave a note of what you changed and what still needs a human.
- Flag cards that should not ship — describe the problem; do not schedule them.
