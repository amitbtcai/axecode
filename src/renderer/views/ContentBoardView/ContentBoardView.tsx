import { useEffect, useState } from "react";
import { Button, Dropdown, Input, Label, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  CalendarDays,
  ChevronDown,
  Globe,
  Loader2,
  PanelRight,
  Sparkles,
  SquarePen,
} from "lucide-react";
import type {
  ContentCard,
  ContentCardChannel,
  ContentCardMediaItem,
  ContentCardStatus,
  ContentPublishAttempt,
  ContentSocialAccount,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { LightballTabs } from "@/renderer/components/common/LightballTabs";
import { ensureHomeScopeProject } from "@/renderer/actions/projectActions";
import { openThread } from "@/renderer/actions/threadActions";
import { useAppStore } from "@/renderer/state/appStore";
import {
  CHANNELS,
  CHANNEL_LABELS,
  calendarCards,
  cardsForDay,
  groupByStatus,
  monthDays,
  weekDays,
} from "./contentBoardUtils";
import { ChannelBadge, ContentCardTile } from "./parts/ContentCardTile";
import { ContentCardModal } from "./parts/ContentCardModal";
import { ContentAgentPanel } from "./parts/ContentAgentPanel";
import { SocialAccountsModal } from "./parts/SocialAccountsModal";

type TabId = "board" | "calendar" | "history";
type CalendarRange = "week" | "month";

const COLUMN_KEYS = [
  "draft",
  "scheduled",
  "published",
] as const satisfies readonly ContentCardStatus[];

function replaceCard(cards: ContentCard[], next: ContentCard): ContentCard[] {
  const idx = cards.findIndex((c) => c.id === next.id);
  if (idx === -1) return [next, ...cards];
  const copy = [...cards];
  copy[idx] = next;
  return copy;
}

export function ContentBoardView() {
  const { t } = useLingui();
  const columnLabels: Record<(typeof COLUMN_KEYS)[number], string> = {
    draft: t`Drafts`,
    scheduled: t`Scheduled`,
    published: t`Published`,
  };
  const [cards, setCards] = useState<ContentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("board");
  const [channelFilter, setChannelFilter] = useState<ContentCardChannel | "all">("all");
  const [query, setQuery] = useState("");
  const [openCard, setOpenCard] = useState<ContentCard | null>(null);
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [calendarRange, setCalendarRange] = useState<CalendarRange>("week");
  /** Day key ("yyyy-mm-dd") whose calendar cell is expanded to show all cards. */
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentProjectId, setAgentProjectId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<ContentSocialAccount[]>([]);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [attempts, setAttempts] = useState<ContentPublishAttempt[]>([]);

  useEffect(() => {
    let cancelled = false;
    void readBridge()
      .getContentCards({})
      .then((next) => {
        if (!cancelled) setCards(next);
      })
      .catch((loadError: unknown) => {
        if (!cancelled)
          setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    void readBridge()
      .getContentSocialAccounts()
      .then((next) => {
        if (!cancelled) setAccounts(next);
      })
      .catch(() => {});
    void readBridge()
      .getContentPublishAttempts()
      .then((next) => {
        if (!cancelled) setAttempts(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleCards = cards.filter((card) => {
    if (channelFilter !== "all" && card.channel !== channelFilter) return false;
    if (normalizedQuery && !`${card.title}\n${card.body}`.toLowerCase().includes(normalizedQuery)) {
      return false;
    }
    return true;
  });

  const grouped = groupByStatus(visibleCards);
  const onCalendar = calendarCards(visibleCards);
  const days = calendarRange === "week" ? weekDays(weekAnchor) : monthDays(weekAnchor);

  async function saveCard(
    id: string,
    patch: {
      channel?: ContentCardChannel;
      title?: string;
      body?: string;
      bodyDoc?: unknown;
      media?: ContentCardMediaItem[];
      status?: ContentCardStatus;
      scheduledFor?: string | null;
      publishUrl?: string | null;
      publishError?: string | null;
    },
  ) {
    const next = await readBridge().updateContentCard({ id, patch });
    if (next) {
      setCards((prev) => replaceCard(prev, next));
      setOpenCard((prev) => (prev?.id === next.id ? next : prev));
    }
  }

  async function deleteCard(id: string) {
    await readBridge().deleteContentCard({ id });
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  async function newCard() {
    const created = await readBridge().createContentCard({
      channel: channelFilter === "all" ? "writer" : channelFilter,
      title: t`Untitled`,
      body: "",
    });
    setCards((prev) => [created, ...prev]);
    setOpenCard(created);
  }

  function publish(card: ContentCard) {
    // Launch a background publish thread in main — the agent posts via the
    // signed-in browser without leaving the Content view.
    void readBridge()
      .publishContentCard({ id: card.id })
      .then(() => {
        // The claim (scheduledFor cleared, sourceThreadId set) lands after the
        // agent pick resolves — refetch on a short delay to catch it.
        setTimeout(() => {
          void readBridge()
            .getContentCards({})
            .then((next) => setCards(next));
          void readBridge()
            .getContentPublishAttempts()
            .then((next) => setAttempts(next));
        }, 1500);
      })
      .catch((publishError: unknown) => {
        setError(publishError instanceof Error ? publishError.message : String(publishError));
      });
  }

  async function saveAccount(channel: ContentCardChannel, label: string, url: string) {
    await readBridge().setContentSocialAccount({ channel, label, url });
    setAccounts(await readBridge().getContentSocialAccounts());
  }

  function toggleAgentPanel() {
    if (agentOpen) {
      setAgentOpen(false);
      return;
    }
    setAgentOpen(true);
    if (!agentProjectId) {
      void ensureHomeScopeProject().then((project) => setAgentProjectId(project.id));
    }
  }

  function setupMarketing() {
    void ensureHomeScopeProject().then((project) => {
      const store = useAppStore.getState();
      store.setComposerSeed(
        project.id,
        t`Set up my marketing workspace: create a marketing/ folder in this project with product-info.md, brand-voice.md, content-strategy.md, and social-accounts.md (the channel → account/page URL map; ask me for the handles first), then create four daily schedules — one for each channel agent (writer, seo, x, linkedin) — that read those docs and use create_content_card to draft posts onto my Content board.`,
      );
      store.openDraft(project.id);
    });
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col px-6 pb-6 pt-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-foreground">
            <Trans>Content</Trans>
          </h1>
          <div className="flex items-center gap-2">
            <LightballTabs<TabId>
              tabs={[
                { id: "board", label: t`Board` },
                { id: "calendar", label: t`Calendar` },
                { id: "history", label: t`History` },
              ]}
              active={tab}
              onChange={setTab}
              ariaLabel={t`Content view`}
            />
            <Button
              variant="tertiary"
              size="sm"
              onPress={() => setAccountsOpen(true)}
              aria-label={t`Social accounts`}
            >
              <Globe className="size-4" />
              <Trans>Social accounts</Trans>
            </Button>
            <Button variant="tertiary" size="sm" onPress={() => void newCard()}>
              <SquarePen className="size-4" />
              <Trans>New post</Trans>
            </Button>
            <Button
              variant={agentOpen ? "secondary" : "tertiary"}
              size="sm"
              onPress={toggleAgentPanel}
              aria-label={t`Content agent`}
            >
              <PanelRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <TextField
            aria-label={t`Search content`}
            className="min-w-56 flex-1"
            value={query}
            onChange={setQuery}
          >
            <Input placeholder={t`Search content`} />
          </TextField>
          <Dropdown>
            <Button variant="tertiary" size="sm">
              {channelFilter === "all" ? t`All channels` : CHANNEL_LABELS[channelFilter]}
              <ChevronDown className="size-3.5" />
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                aria-label={t`Channel filter`}
                onAction={(key) => setChannelFilter(key as ContentCardChannel | "all")}
              >
                <Dropdown.Item id="all" textValue={t`All channels`}>
                  <Label>
                    <Trans>All channels</Trans>
                  </Label>
                </Dropdown.Item>
                {CHANNELS.map((c) => (
                  <Dropdown.Item key={c} id={c} textValue={CHANNEL_LABELS[c]}>
                    <Label>{CHANNEL_LABELS[c]}</Label>
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>

        {error ? <p className="mb-3 text-sm whitespace-pre-wrap text-danger">{error}</p> : null}

        {loading ? (
          <div className="flex justify-center py-12 text-muted">
            <Loader2 className="size-5 animate-spin" aria-label={t`Loading content`} />
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Sparkles className="size-9 text-muted" />
            <p className="text-sm font-medium text-foreground">
              <Trans>Set up your marketing workspace</Trans>
            </p>
            <p className="max-w-md text-xs text-muted">
              <Trans>
                Channel agents draft posts onto this board on a daily schedule — you schedule and
                publish them from here.
              </Trans>
            </p>
            <div className="mt-1 flex gap-2">
              <Button size="sm" onPress={setupMarketing}>
                <Sparkles className="size-4" />
                <Trans>Set up with agent</Trans>
              </Button>
              <Button variant="tertiary" size="sm" onPress={() => void newCard()}>
                <SquarePen className="size-4" />
                <Trans>New post</Trans>
              </Button>
            </div>
          </div>
        ) : tab === "board" ? (
          <div className="grid flex-1 grid-cols-3 gap-3 overflow-x-auto">
            {COLUMN_KEYS.map((status) => {
              const columnCards = grouped.get(status) ?? [];
              return (
                <div key={status} className="flex min-w-[180px] flex-col">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-xs font-medium text-muted">{columnLabels[status]}</span>
                    <span className="text-[11px] text-muted">{columnCards.length}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-surface-secondary/40 p-2">
                    {columnCards.map((card) => (
                      <ContentCardTile
                        key={card.id}
                        card={card}
                        onOpen={setOpenCard}
                        onDelete={(c) => void deleteCard(c.id)}
                      />
                    ))}
                    {columnCards.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center py-6 text-[11px] text-muted/60">
                        <Trans>Empty</Trans>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : tab === "calendar" ? (
          <div className="flex flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between">
              <Button
                variant="tertiary"
                size="sm"
                onPress={() =>
                  setWeekAnchor((d) => {
                    const prev = new Date(d);
                    if (calendarRange === "week") prev.setDate(prev.getDate() - 7);
                    else prev.setMonth(prev.getMonth() - 1);
                    return prev;
                  })
                }
              >
                <Trans>Previous</Trans>
              </Button>
              <div className="flex items-center gap-2">
                <LightballTabs<CalendarRange>
                  tabs={[
                    { id: "week", label: t`Week` },
                    { id: "month", label: t`Month` },
                  ]}
                  active={calendarRange}
                  onChange={setCalendarRange}
                  ariaLabel={t`Calendar range`}
                />
                <Button variant="tertiary" size="sm" onPress={() => setWeekAnchor(new Date())}>
                  <CalendarDays className="size-4" />
                  <Trans>Today</Trans>
                </Button>
              </div>
              <Button
                variant="tertiary"
                size="sm"
                onPress={() =>
                  setWeekAnchor((d) => {
                    const next = new Date(d);
                    if (calendarRange === "week") next.setDate(next.getDate() + 7);
                    else next.setMonth(next.getMonth() + 1);
                    return next;
                  })
                }
              >
                <Trans>Next</Trans>
              </Button>
            </div>
            <div
              className={`grid flex-1 grid-cols-7 gap-2 ${calendarRange === "month" ? "auto-rows-fr" : ""}`}
            >
              {days.map((day) => {
                const dayCards = cardsForDay(onCalendar, day);
                const isToday = day.toDateString() === new Date().toDateString();
                const inMonth =
                  calendarRange === "week" || day.getMonth() === weekAnchor.getMonth();
                return (
                  <div
                    key={day.toISOString()}
                    className={`flex flex-col rounded-xl border border-[var(--hairline)] p-2 ${
                      isToday ? "bg-surface-secondary/50" : ""
                    } ${inMonth ? "" : "opacity-40"} ${
                      calendarRange === "month" ? "min-h-[90px]" : ""
                    }`}
                  >
                    <div className="mb-2 px-1 text-[11px] font-medium text-muted">
                      {day.toLocaleDateString(
                        undefined,
                        calendarRange === "week"
                          ? { weekday: "short", day: "numeric" }
                          : { day: "numeric" },
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 overflow-y-auto">
                      {(expandedDay === day.toDateString() ? dayCards : dayCards.slice(0, 3)).map(
                        (card) => (
                          <button
                            key={card.id}
                            type="button"
                            onClick={() => setOpenCard(card)}
                            className="rounded-lg border border-[var(--hairline)] bg-surface px-2 py-1.5 text-left text-xs text-foreground transition hover:bg-surface-secondary"
                          >
                            <span className="mb-0.5 block text-[10px] text-muted">
                              {card.status === "published" ? <Trans>live</Trans> : null}
                              {card.status === "published" ? " · " : ""}
                              {CHANNEL_LABELS[card.channel]} ·{" "}
                              {new Date(
                                card.scheduledFor ?? card.publishedAt ?? card.updatedAt,
                              ).toLocaleTimeString(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                            <span className="line-clamp-2">{card.title}</span>
                          </button>
                        ),
                      )}
                      {dayCards.length > 3 && expandedDay !== day.toDateString() ? (
                        <button
                          type="button"
                          onClick={() => setExpandedDay(day.toDateString())}
                          className="rounded-lg px-2 py-1 text-left text-[11px] font-medium text-accent hover:bg-surface-secondary"
                        >
                          <Trans>+{dayCards.length - 3} more</Trans>
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
            {attempts.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">
                <Trans>Nothing published yet</Trans>
              </p>
            ) : (
              attempts.map((attempt) => {
                const card = cards.find((c) => c.id === attempt.cardId) ?? null;
                const attemptStatus =
                  attempt.status === "published"
                    ? { label: t`Published`, cls: "bg-success/10 text-success" }
                    : attempt.status === "wrong_account"
                      ? { label: t`Wrong account`, cls: "bg-danger/10 text-danger" }
                      : attempt.status === "failed"
                        ? { label: t`Failed`, cls: "bg-danger/10 text-danger" }
                        : { label: t`Running`, cls: "bg-accent/10 text-accent" };
                return (
                  <div
                    key={attempt.id}
                    className="flex items-center gap-3 rounded-xl border border-separator bg-surface px-4 py-3"
                  >
                    <ChannelBadge channel={attempt.channel} />
                    <div className="min-w-0 flex-1">
                      {card ? (
                        <button
                          type="button"
                          onClick={() => setOpenCard(card)}
                          className="block max-w-full truncate text-left text-sm font-medium hover:underline"
                        >
                          {attempt.title}
                        </button>
                      ) : (
                        <span className="block max-w-full truncate text-sm font-medium">
                          {attempt.title}
                        </span>
                      )}
                      <div className="truncate text-xs text-muted">
                        {attempt.error
                          ? attempt.error
                          : (attempt.destinationUrl ??
                            new Date(attempt.startedAt).toLocaleString())}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${attemptStatus.cls}`}
                    >
                      {attemptStatus.label}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {new Date(attempt.finishedAt ?? attempt.startedAt).toLocaleString()}
                    </span>
                    {attempt.publishUrl ? (
                      <a
                        href={attempt.publishUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="max-w-56 truncate text-xs text-accent hover:underline"
                      >
                        {attempt.publishUrl}
                      </a>
                    ) : null}
                    {attempt.threadId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => openThread(attempt.threadId!)}
                      >
                        <Trans>Run</Trans>
                      </Button>
                    ) : null}
                    {card && attempt.status !== "running" ? (
                      <Button size="sm" variant="tertiary" onPress={() => publish(card)}>
                        <Trans>Retry</Trans>
                      </Button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
      {agentOpen && agentProjectId ? (
        <ContentAgentPanel projectId={agentProjectId} onClose={() => setAgentOpen(false)} />
      ) : null}
      <ContentCardModal
        card={openCard}
        onClose={() => setOpenCard(null)}
        onSave={saveCard}
        onDelete={deleteCard}
        onPublish={publish}
      />
      <SocialAccountsModal
        open={accountsOpen}
        accounts={accounts}
        onClose={() => setAccountsOpen(false)}
        onSave={saveAccount}
      />
    </div>
  );
}
