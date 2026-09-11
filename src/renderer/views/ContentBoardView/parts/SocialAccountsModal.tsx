import { useState } from "react";
import { Button, Input, Label, Modal, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ContentCardChannel, ContentSocialAccount } from "@/shared/contracts";
import { CHANNELS, CHANNEL_LABELS } from "../contentBoardUtils";

/**
 * Fork-owned (Axe Code): the channel → account/page map used by the publish
 * playbook. Stored in app settings (content_social_accounts) so publish
 * prompts embed the real destination instead of hunting for a doc file.
 */

/** Pull a display handle out of a pasted URL — last meaningful path segment. */
export function deriveHandle(url: string): string {
  try {
    const { hostname, pathname } = new URL(url.startsWith("http") ? url : `https://${url}`);
    const parts = pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return `@${last}`;
    return hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function SocialAccountsModal(props: {
  open: boolean;
  accounts: ContentSocialAccount[];
  onClose: () => void;
  onSave: (channel: ContentCardChannel, label: string, url: string) => Promise<void>;
}) {
  const { open, accounts, onClose, onSave } = props;
  const { t } = useLingui();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loadedOpen, setLoadedOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (open && !loadedOpen) {
    setLoadedOpen(true);
    const next: Record<string, string> = {};
    for (const channel of CHANNELS) {
      next[channel] = accounts.find((a) => a.channel === channel)?.url ?? "";
    }
    setDrafts(next);
  }
  if (!open && loadedOpen) setLoadedOpen(false);

  async function saveAll() {
    setBusy(true);
    try {
      for (const channel of CHANNELS) {
        const url = (drafts[channel] ?? "").trim();
        const existing = accounts.find((a) => a.channel === channel);
        if (url === (existing?.url ?? "")) continue;
        await onSave(channel, url ? deriveHandle(url) : "", url);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={(next) => !next && onClose()}>
      <Modal.Container size="lg" placement="center" scroll="inside">
        <Modal.Dialog className="sm:max-w-[880px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>
              <Trans>Social accounts</Trans>
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p className="text-sm text-muted">
              <Trans>
                Paste the account or page URL each channel publishes to — the publish agent
                navigates here in your signed-in browser.
              </Trans>
            </p>
            <div className="mt-5 flex flex-col gap-4">
              {CHANNELS.map((channel) => (
                <div key={channel} className="grid grid-cols-[7rem_1fr] items-center gap-4">
                  <Label className="text-sm font-medium">{CHANNEL_LABELS[channel]}</Label>
                  <TextField
                    aria-label={t`${CHANNEL_LABELS[channel]} URL`}
                    value={drafts[channel] ?? ""}
                    onChange={(value) => setDrafts((prev) => ({ ...prev, [channel]: value }))}
                  >
                    <Input
                      placeholder={
                        channel === "linkedin"
                          ? "linkedin.com/company/…"
                          : channel === "youtube"
                            ? "studio.youtube.com"
                            : channel === "x"
                              ? "x.com/yourhandle"
                              : "https://…"
                      }
                      variant="secondary"
                    />
                  </TextField>
                </div>
              ))}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="tertiary" onPress={onClose}>
              <Trans>Cancel</Trans>
            </Button>
            <Button onPress={() => void saveAll()} isDisabled={busy}>
              <Trans>Save</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
