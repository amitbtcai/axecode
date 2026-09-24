import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Copy } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { PixelLoader } from "@/renderer/components/common";
import { useAxeAiAccountLinkState } from "@/renderer/hooks/useAxeAiAccountLinkState";
import { SettingRow, SettingsPage } from "./SettingsForm";

function friendlyError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * The account-link row. `linkedOnly` renders nothing until the account is
 * linked — used on the Remote Access page, where sign-in lives on its own
 * sidebar section but unlinking stays here.
 */
export function AxeAiAccountSection({ linkedOnly = false }: { linkedOnly?: boolean }) {
  const { t } = useLingui();
  const linkState = useAxeAiAccountLinkState();
  const [isBusy, setIsBusy] = useState(false);

  const startLink = async () => {
    setIsBusy(true);
    try {
      const result = await readBridge().startAxeAiAccountLink();
      if (result.verificationUrl) void readBridge().openExternal(result.verificationUrl);
    } catch (error) {
      toast.danger(friendlyError(error, t`Unable to start AxeAI sign-in.`));
    } finally {
      setIsBusy(false);
    }
  };

  const signOut = async () => {
    setIsBusy(true);
    try {
      await readBridge().signOutAxeAiAccount();
      toast.success(t`Signed out of AxeAI.`);
    } catch (error) {
      toast.danger(friendlyError(error, t`Unable to sign out of AxeAI.`));
    } finally {
      setIsBusy(false);
    }
  };

  const copyApprovalLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t`Approval link copied.`);
    } catch {
      toast.danger(t`Unable to copy the approval link.`);
    }
  };

  if (linkedOnly && linkState?.status !== "linked") return null;

  return (
    <div className="space-y-4 border-b border-border/60 pb-6">
      <SettingRow
        title={t`AxeAI account`}
        description={
          <Trans>
            Sign in to reach this desktop from axeai.com without pairing codes or network setup.
          </Trans>
        }
      >
        {linkState?.status === "linked" ? (
          <div className="flex items-center gap-3">
            <span className="min-w-0 truncate text-sm text-foreground">
              {linkState.accountLabel ?? t`Linked account`}
            </span>
            <Button size="sm" variant="tertiary" isDisabled={isBusy} onPress={() => void signOut()}>
              <Trans>Sign out</Trans>
            </Button>
          </div>
        ) : linkState?.status === "linking" && linkState.code ? (
          <div className="flex flex-col items-start gap-2">
            <code className="rounded-md border border-border/60 bg-surface px-3 py-1.5 font-mono text-base tracking-[0.2em] text-foreground">
              {linkState.code}
            </code>
            <p className="text-xs text-muted">
              <Trans>Approve this code on axeai.com to link this desktop.</Trans>
            </p>
            <div className="flex items-center gap-2">
              {linkState.verificationUrl ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  onPress={() => void copyApprovalLink(linkState.verificationUrl ?? "")}
                >
                  <Copy className="size-3.5" />
                  <Trans>Copy approval link</Trans>
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onPress={() => void readBridge().cancelAxeAiAccountLink()}
              >
                <Trans>Cancel</Trans>
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="primary" isDisabled={isBusy} onPress={() => void startLink()}>
            {isBusy ? <PixelLoader size="sm" /> : null}
            <Trans>Sign in with AxeAI</Trans>
          </Button>
        )}
      </SettingRow>
    </div>
  );
}

export function AxeAiAccountSettings() {
  const { t } = useLingui();
  return (
    <SettingsPage
      title={t`AxeAI Account`}
      description={
        <Trans>
          Link this desktop to your axeai.com account to reach it from the web, no pairing codes or
          network setup needed.
        </Trans>
      }
    >
      <AxeAiAccountSection />
    </SettingsPage>
  );
}
