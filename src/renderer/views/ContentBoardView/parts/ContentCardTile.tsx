import { Trans, useLingui } from "@lingui/react/macro";
import {
  AtSign,
  Briefcase,
  CalendarClock,
  Check,
  ExternalLink,
  Paperclip,
  PenLine,
  Play,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import type { ContentCard, ContentCardChannel } from "@/shared/contracts";
import { CHANNEL_LABELS } from "../contentBoardUtils";

const CHANNEL_ICONS: Record<ContentCardChannel, typeof PenLine> = {
  writer: PenLine,
  seo: Search,
  x: AtSign,
  linkedin: Briefcase,
  facebook: Users,
  youtube: Play,
};

export function ChannelBadge({ channel }: { channel: ContentCardChannel }) {
  const Icon = CHANNEL_ICONS[channel];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] font-medium text-muted">
      <Icon className="size-3" />
      {CHANNEL_LABELS[channel]}
    </span>
  );
}

export function ContentCardTile(props: {
  card: ContentCard;
  onOpen: (card: ContentCard) => void;
  onDelete?: (card: ContentCard) => void;
}) {
  const { t } = useLingui();
  const { card, onOpen, onDelete } = props;
  const Icon = CHANNEL_ICONS[card.channel];
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onOpen(card)}
        className="w-full rounded-xl border border-[var(--hairline)] bg-surface p-3 text-left transition hover:bg-surface-secondary"
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted">
            <Icon className="size-3" />
            {CHANNEL_LABELS[card.channel]}
          </span>
          {card.publishUrl ? (
            <a
              href={card.publishUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 text-[11px] text-accent hover:underline"
            >
              <Check className="size-3" />
              <Trans>live</Trans>
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>
        <p className="line-clamp-2 text-sm font-medium text-foreground">{card.title}</p>
        {card.body ? <p className="mt-1 line-clamp-2 text-xs text-muted">{card.body}</p> : null}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
          {card.media.length > 0 ? (
            <span className="inline-flex items-center gap-0.5" title={t`Attached media`}>
              <Paperclip className="size-3" />
              {card.media.length}
            </span>
          ) : null}
          {card.status === "scheduled" && card.scheduledFor ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" />
              {new Date(card.scheduledFor).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          ) : null}
        </div>
      </button>
      {onDelete ? (
        <button
          type="button"
          aria-label={t`Delete post`}
          title={t`Delete post`}
          onClick={() => onDelete(card)}
          className="absolute right-2 top-2 hidden rounded-md bg-surface/90 p-1 text-muted shadow-sm hover:text-danger group-hover:block"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
