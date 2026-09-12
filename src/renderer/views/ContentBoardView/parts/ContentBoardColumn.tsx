import { useDroppable } from "@dnd-kit/react";
import { Trans } from "@lingui/react/macro";
import type { ContentCard, ContentCardStatus } from "@/shared/contracts";
import { BOARD_DROP_TARGETS } from "../contentBoardUtils";
import { ContentCardTile } from "./ContentCardTile";

/**
 * One board column — a drop target for content cards when its status is in
 * `BOARD_DROP_TARGETS` (Published is excluded: a card only gets there through
 * a real publish, never a manual move).
 */
export function ContentBoardColumn(props: {
  status: ContentCardStatus;
  label: string;
  cards: ContentCard[];
  onOpen: (card: ContentCard) => void;
  onDelete: (card: ContentCard) => void;
}) {
  const { status, label, cards, onOpen, onDelete } = props;
  const { ref, isDropTarget } = useDroppable({
    id: `content-column:${status}`,
    accept: "content-card",
    data: { type: "content-column", status },
    disabled: !BOARD_DROP_TARGETS.includes(status),
  });

  return (
    <div className="flex min-w-[180px] flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="text-[11px] text-muted">{cards.length}</span>
      </div>
      <div
        ref={ref}
        className={`flex flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-surface-secondary/40 p-2 transition ${
          isDropTarget ? "ring-2 ring-accent/60 bg-accent/10" : ""
        }`}
      >
        {cards.map((card) => (
          <ContentCardTile
            key={card.id}
            card={card}
            onOpen={onOpen}
            onDelete={(c) => onDelete(c)}
          />
        ))}
        {cards.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-6 text-[11px] text-muted/60">
            <Trans>Empty</Trans>
          </div>
        ) : null}
      </div>
    </div>
  );
}
