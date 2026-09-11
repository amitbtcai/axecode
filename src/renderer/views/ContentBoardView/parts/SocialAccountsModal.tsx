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
export function SocialAccountsModal(props: {
  open: boolean;
  accounts: ContentSocialAccount[];
  onClose: () => void;
  onSave: (channel: ContentCardChannel, label: string, url: string) => Promise<void>;
}) {
  const { open, accounts, onClose, onSave } = props;
  const { t } = useLingui();
  const [drafts, setDrafts] = useState<Record<string, { label: string; url: string }>>({});
  const [loadedOpen, setLoadedOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (open && !loadedOpen) {
    setLoadedOpen(true);
    const next: Record<string, { label: string; url: string }> = {};
    for (const channel of CHANNELS) {
      const existing = accounts.find((a) => a.channel === channel);
      next[channel] = { label: existing?.label ?? "", url: existing?.url ?? "" };
    }
    setDrafts(next);
  }
  if (!open && loadedOpen) setLoadedOpen(false);

  async function saveAll() {
    setBusy(true);
    try {
      for (const channel of CHANNELS) {
        const draft = drafts[channel];
        if (!draft) continue;
        await onSave(channel, draft.label.trim(), draft.url.trim());
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={(next) => !next && onClose()}>
      <Modal.Container size="lg" placement="center" scroll="inside">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>
              <Trans>Social accounts</Trans>
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p className="text-sm text-muted">
              <Trans>
                The account or page each channel publishes to — the publish agent navigates here in
                your signed-in browser.
              </Trans>
            </p>
            <div className="mt-4 flex flex-col gap-4">
              {CHANNELS.map((channel) => {
                const draft = drafts[channel] ?? { label: "", url: "" };
                return (
                  <div key={channel} className="grid grid-cols-[7rem_1fr_1.6fr] items-center gap-3">
                    <Label className="text-sm font-medium">{CHANNEL_LABELS[channel]}</Label>
                    <TextField
                      aria-label={t`${CHANNEL_LABELS[channel]} handle`}
                      value={draft.label}
                      onChange={(value) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [channel]: { ...draft, label: value },
                        }))
                      }
                    >
                      <Input placeholder={t`Handle / page name`} variant="secondary" />
                    </TextField>
                    <TextField
                      aria-label={t`${CHANNEL_LABELS[channel]} URL`}
                      value={draft.url}
                      onChange={(value) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [channel]: { ...draft, url: value },
                        }))
                      }
                    >
                      <Input placeholder={t`Page URL`} variant="secondary" />
                    </TextField>
                  </div>
                );
              })}
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
