import type { ContentCard, ContentCardChannel, ContentSocialAccount } from "./contracts";

/**
 * Fork-owned (Axe Code): the publish playbook shared by the manual
 * "Publish with Browser" action (renderer) and the due-card watcher (main).
 * Both launch a thread with this prompt — the agent reviews, drives the
 * signed-in browser via the browseros-neo MCP tools, posts, and reports the
 * result back onto the card.
 *
 * Destinations come from the configured social accounts (Content view →
 * Social accounts); when a channel has no configured URL the prompt falls
 * back to the channel's default surface.
 */

const DEFAULT_DESTINATION: Record<ContentCardChannel, string> = {
  writer: "the company blog / site CMS",
  seo: "the company blog / site CMS",
  x: "x.com — the company account",
  linkedin: "linkedin.com — the Company Page, not a personal profile",
  facebook: "facebook.com — the Facebook Page",
  youtube: "studio.youtube.com — upload flow",
};

/** Per-channel compose notes the agent must respect while posting. */
const CHANNEL_RULES: Record<ContentCardChannel, string> = {
  writer: "Long-form article. Publish the full formatted body; keep headings and links intact.",
  seo: "Keyword-led article. Keep the primary keyword in the title and first paragraph.",
  x: "Max 280 characters — if the post is longer, split it into a numbered thread (1/, 2/, …).",
  linkedin:
    "Company Page post — plain text, up to 3000 chars. Attach the media files. No hashtag stuffing.",
  facebook: "Page post — plain text with the media files attached.",
  youtube:
    "Title + description + video file upload. The description goes in the YouTube description field, not the title.",
};

/**
 * Concrete compose-surface hints per channel — live-site selectors drift, so
 * these describe the flow, not exact DOM. They also push the agent to confirm
 * the posting identity before touching the composer.
 */
const CHANNEL_STEPS: Record<ContentCardChannel, string> = {
  writer:
    "Navigate to the blog/CMS new-post URL, create a post, paste the markdown body, save/publish.",
  seo: "Navigate to the blog/CMS new-post URL, create a post, paste the content, publish.",
  x: "Navigate to x.com (or the account URL), confirm the signed-in handle in the left nav matches the configured account, open the composer (or x.com/compose/post), type the post, attach media via the media button, post.",
  linkedin:
    "Navigate to the company page URL — posting as the page happens from the page itself; the 'Post as' selector near the composer should already show the company name. Click 'Start a post', enter the text, attach media via the image/video icon, post.",
  facebook:
    "Navigate to the Page URL — on the Page, use the 'Create post' / composer box at the top of the feed (posting there is already as the Page). Enter text, attach media via Photo/Video, post.",
  youtube:
    "Navigate to studio.youtube.com, click Create (camera icon) → Upload videos, select the video file, fill title and description in the Details step, proceed to Visibility → Public → Publish. Copy the video URL.",
};

function destinationFor(card: ContentCard, accounts: readonly ContentSocialAccount[]): string {
  const account = accounts.find((a) => a.channel === card.channel);
  if (account?.url) {
    const label = account.label ? ` ("${account.label}")` : "";
    return `${account.url}${label} — this exact account/page is already signed in in the browser`;
  }
  return `${DEFAULT_DESTINATION[card.channel]} — no URL is configured for this channel; ask which account to use before posting`;
}

export function buildContentPublishPrompt(
  card: ContentCard,
  accounts: readonly ContentSocialAccount[] = [],
): string {
  const mediaLines = card.media.length
    ? `\n\nMedia files to attach (local paths — upload these in the site's composer):\n${card.media
        .map((item) => `- ${item.path}`)
        .join("\n")}`
    : "";
  return `Publish this ${card.channel} post using my signed-in browser via the browseros-neo MCP tools.

Destination: ${destinationFor(card, accounts)}
Channel rules: ${CHANNEL_RULES[card.channel]}
Compose flow: ${CHANNEL_STEPS[card.channel]}

Title: ${card.title}

${card.body}${mediaLines}

Before posting, proofread: fix obvious typos, confirm the text fits the channel rules, and check any links. If the content has a substantive problem (off-brand claims, wrong facts, missing required media for this channel), do NOT post — report it instead.

IDENTITY GATE — do this before touching the composer:
1. Open the destination URL.
2. Read the currently active profile/handle — on X open the profile menu or left-nav handle, on LinkedIn/Facebook check the "Post as"/profile indicator, on YouTube check the channel avatar/name in Studio.
3. Compare it with the configured destination. If it does not match (wrong account signed in, or a personal profile where a company page is expected), STOP — call update_content_card with publishError "wrong account signed in: <what you saw>" and publishIncident "wrong_account", and do not post. Do not try to switch accounts yourself.

Then: open the compose surface, enter the content, attach the media files, publish, then copy the public URL of the post. If the account is not signed in, stop and report that.

If you discover AFTER posting that it went to the wrong account/page, call update_content_card with publishIncident "wrong_account", publishError describing it, and still include publishUrl — the link is kept in the publish history so the user can delete the stray post and retry.

When done, call update_content_card on card ${card.id}: on success set status "published" and publishUrl to the post's URL; on failure set publishError to a short description of what went wrong (and status "draft" if it should not retry).`;
}
