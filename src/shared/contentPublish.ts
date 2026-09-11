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

Title: ${card.title}

${card.body}${mediaLines}

Before posting, proofread: fix obvious typos, confirm the text fits the channel rules, and check any links. If the content has a substantive problem (off-brand claims, wrong facts, missing required media for this channel), do NOT post — report it instead.

Steps: open a browser tab, navigate to the destination, open the compose surface, enter the content, attach the media files, publish, then copy the public URL of the post. If the account is not signed in, stop and report that.

When done, call update_content_card on card ${card.id}: on success set status "published" and publishUrl to the post's URL; on failure set publishError to a short description of what went wrong (and status "draft" if it should not retry).`;
}
