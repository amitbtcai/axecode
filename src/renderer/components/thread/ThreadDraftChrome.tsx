import type { RefCallback } from "react";
import { TerminalSquare, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { macosTrafficLightPadClass } from "@/renderer/components/layout/sidebarChrome";
import { ProjectSwitchMenu } from "./ProjectSwitchMenu";

export type ThreadDraftDropIndicator =
  | false
  | "replace"
  | "insert-left"
  | "insert-right"
  | "insert-top"
  | "insert-bottom";

export function ThreadDraftCompactHeader({
  dragHandleRef,
  ...props
}: {
  alignClass: string;
  dragHandleRef?: RefCallback<Element> | undefined;
  headerNeedsTrafficLightPad: boolean;
  onClose?: (() => void) | undefined;
  projectId: string;
  scopeLabel?: string | undefined;
  paneId?: string | undefined;
  showCloseButton?: boolean | undefined;
}) {
  const { t } = useLingui();
  return (
    <div
      data-draft-compact-header=""
      className={`px-2 ${props.headerNeedsTrafficLightPad ? macosTrafficLightPadClass : ""}`}
    >
      <div
        ref={dragHandleRef}
        className={`${dragHandleRef ? "poracode-content-over-drag-region cursor-grab active:cursor-grabbing" : "poracode-content-over-drag-region--drag"} ${props.alignClass} flex w-full max-w-[920px] items-center gap-2 py-1`}
      >
        <TerminalSquare className="size-3.5 shrink-0 text-muted/60" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium leading-tight text-muted">
          <Trans>New thread</Trans>
        </span>
        <div className="flex shrink-0 items-center">
          {props.scopeLabel ? (
            <span className="px-1 text-sm leading-tight text-muted/60">{props.scopeLabel}</span>
          ) : (
            <ProjectSwitchMenu
              currentProjectId={props.projectId}
              variant="compact"
              {...(props.paneId ? { paneId: props.paneId } : {})}
            />
          )}
          {props.showCloseButton && props.onClose && (
            <button
              type="button"
              aria-label={t`Close pane`}
              className="poracode-overlay-header__controls shrink-0 rounded p-1 text-muted/60 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                props.onClose?.();
              }}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ThreadDraftDropIndicators(props: {
  dropIndicator?: ThreadDraftDropIndicator | undefined;
}) {
  return (
    <>
      {props.dropIndicator === "replace" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 rounded-2xl bg-accent/10 ring-1 ring-inset ring-accent/30"
        />
      )}
      {props.dropIndicator === "insert-left" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 bottom-0 left-0 z-20 w-0.5 rounded-full bg-accent"
        />
      )}
      {props.dropIndicator === "insert-right" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 bottom-0 z-20 w-0.5 rounded-full bg-accent"
        />
      )}
      {props.dropIndicator === "insert-top" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 left-0 z-20 h-0.5 rounded-full bg-accent"
        />
      )}
      {props.dropIndicator === "insert-bottom" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 bottom-0 left-0 z-20 h-0.5 rounded-full bg-accent"
        />
      )}
    </>
  );
}

export function ThreadDraftHero() {
  // Empty spacer: keeps the compact composer anchored to the bottom of the
  // draft body. `data-draft-hero` stays so the mobile collapsed-dock CSS keeps
  // matching.
  return <div data-draft-hero="" aria-hidden="true" className="flex-1" />;
}
