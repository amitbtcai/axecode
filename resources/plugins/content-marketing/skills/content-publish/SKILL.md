---
name: content-publish
description: Publish a content card to its social channel through the user's signed-in browser. Use when asked to publish a post, push a card live, or run the publish step for a channel.
---

# Content Publish

Publish a card by driving the user's real, already-signed-in browser with the
**browseros-neo** MCP tools. No OAuth, no APIs — you operate the site's own
composer.

## Destinations

Read `marketing/social-accounts.md` for the channel → account/page map. Defaults:

| Channel        | Where                                              |
| -------------- | -------------------------------------------------- |
| `x`            | x.com — company account                            |
| `linkedin`     | LinkedIn **Company Page** (not a personal profile) |
| `facebook`     | Facebook **Page**                                  |
| `youtube`      | studio.youtube.com upload flow                     |
| `writer`/`seo` | company blog/CMS per social-accounts.md            |

## Flow

1. `list_content_cards` to load the card (or take the card id given to you).
2. Proofread: fix obvious typos; verify the text fits the channel's limits
   (X ≤280 — split longer posts into a numbered thread; LinkedIn ≤3000) and the
   required media exists. Substantive problem → do NOT post; call
   `update_content_card` with `publishError` describing it and status `draft`.
3. Open a tab, navigate to the destination URL.
4. **Identity gate — hard precondition.** Open the destination, read the
   active profile/handle (X: profile menu / left-nav handle; LinkedIn &
   Facebook: the "Post as" indicator on the Page composer; YouTube: channel
   name/avatar in Studio). It must match the configured account. Mismatch →
   STOP: set `publishError` "wrong account signed in" and do not post. Never
   try to switch accounts yourself.
5. Open the compose surface (X: composer / x.com/compose/post; LinkedIn:
   "Start a post" on the page; Facebook: "Create post" on the Page; YouTube:
   studio.youtube.com → Create → Upload).
6. Enter the content; attach the card's media files by their local paths.
7. Publish, then copy the post's public URL from the address bar/share sheet.
8. `update_content_card`: status `published` + `publishUrl`. If the account is
   signed out or the post fails, set `publishError` and leave status `draft` or
   `scheduled` so it can retry.

## Rules

- Never post from a personal profile when the destination is a company Page.
- Confirm the public URL resolves before marking the card published.
- YouTube: title and description go to their own fields; the video file is required.
- When a posting flow works, save it as a neo helper (`browser.saveHelper`)
  so the next run reuses the exact steps instead of re-exploring.
