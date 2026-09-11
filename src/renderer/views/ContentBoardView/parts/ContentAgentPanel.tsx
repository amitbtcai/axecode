import { Trans, useLingui } from "@lingui/react/macro";
import { Sparkles, X } from "lucide-react";
import { ThreadDraftView } from "@/renderer/components/thread/ThreadDraftView";
import { startThreadFromDraft } from "@/renderer/actions/threadLaunchActions";
import { useDraftEnvironment } from "@/renderer/hooks/uiSelectors";
import { useProjectWithoutDraftConfig } from "@/renderer/state/useThread";

/**
 * Fork-owned (Axe Code): docked agent launcher for the Content board. Embeds
 * the same compact draft composer the app uses for thread panes — submitting
 * starts a real agent thread (the app navigates to it), and the agent emits
 * posts onto this board via the content-card app-controls tools.
 */
export function ContentAgentPanel(props: { projectId: string; onClose: () => void }) {
  const { t } = useLingui();
  const project = useProjectWithoutDraftConfig(props.projectId);
  const env = useDraftEnvironment(project);
  if (!project) return null;
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-[var(--hairline)] bg-surface">
      <div className="flex items-center justify-between border-b border-[var(--hairline)] px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Sparkles className="size-3.5 text-accent" />
          <Trans>Content agent</Trans>
        </span>
        <button
          type="button"
          aria-label={t`Close agent panel`}
          title={t`Close agent panel`}
          onClick={props.onClose}
          className="rounded-md p-1 text-muted hover:bg-foreground/5 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="px-3 pb-1 pt-2.5 text-[11px] leading-relaxed text-muted">
        <Trans>
          Describe what to post — the agent drafts cards onto this board. The thread opens so you
          can steer it; cards appear in Drafts as it works.
        </Trans>
      </p>
      <div className="min-h-0 flex-1">
        <ThreadDraftView
          project={project}
          agentStatuses={env.agentStatuses}
          isDetectingAgents={env.isDetectingAgents}
          {...(env.pickFiles ? { pickFiles: env.pickFiles } : {})}
          {...(env.saveClipboardImage ? { saveClipboardImage: env.saveClipboardImage } : {})}
          compact
          paneAlign="left"
          composerPlaceholder={t`Tell the agent what to post…`}
          onStart={(input) => startThreadFromDraft(project, input)}
        />
      </div>
    </aside>
  );
}
