import type { ContentCard, ContentCardChannel } from "./contracts";

/**
 * Fork-owned (Axe Code): the publish playbook shared by the manual
 * "Publish with Browser" action (renderer) and the due-card watcher (main).
 * Both launch a thread with this prompt — the agent reviews, drives the
 * signed-in browser via the browseros-neo MCP tools, posts, and reports the
 * result back onto the card.
 */

const CHANNEL_DESTINATION: Record<ContentCardChannel, string> = {
  writer: "the Axe AI blog / company site (see marketing/social-accounts.md for the CMS path)",
  seo: "the Axe AI blog / company site (see marketing/social-accounts.md)",
  x: "x.com — the company account (see marketing/social-accounts.md for the handle)",
  linkedin:
    "linkedin.com — the Axe AI Company Page, not a personal profile (URL in marketing/social-accounts.md)",
  facebook: "facebook.com — the Axe AI Facebook Page (URL in marketing/social-accounts.md)",
  youtube: "studio.youtube.com — upload flow for the Axe AI channel",
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

export function buildContentPublishPrompt(card: ContentCard): string {
  const mediaLines = card.media.length
    ? `\n\nMedia files to attach (local paths — upload these in the site's composer):\n${card.media
        .map((item) => `- ${item.path}`)
        .join("\n")}`
    : "";
  return `Publish this ${card.channel} post using my signed-in browser via the browseros-neo MCP tools.

Destination: ${CHANNEL_DESTINATION[card.channel]}
Channel rules: ${CHANNEL_RULES[card.channel]}

Title: ${card.title}

${card.body}${mediaLines}

Before posting, proofread: fix obvious typos, confirm the text fits the channel rules, and check any links. If the content has a substantive problem (off-brand claims, wrong facts, missing required media for this channel), do NOT post — report it instead.

Steps: open a browser tab, navigate to the destination, open the compose surface, enter the content, attach the media files, publish, then copy the public URL of the post. If the account is not signed in, stop and report that.

When done, call update_content_card on card ${card.id}: on success set status "published" and publishUrl to the post's URL; on failure set publishError to a short description of what went wrong (and status "draft" if it should not retry).`;
}
