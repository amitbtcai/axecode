import { useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Button, Dropdown, Input, Label, Modal, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Archive,
  CalendarClock,
  Check,
  ChevronDown,
  Globe,
  ImagePlus,
  Trash2,
  X,
} from "lucide-react";
import type { ContentCard, ContentCardChannel, ContentCardMediaItem } from "@/shared/contracts";
import { openThread } from "@/renderer/actions/threadActions";
import { readBridge } from "@/renderer/bridge";
import { toLocalFileUrl } from "@/shared/promptContent";
import { resolveLocalImageDisplayUrl } from "@/shared/localImageDisplay";
import { TextArea } from "@/renderer/components/common/TextArea";
import { CHANNELS, CHANNEL_COMPOSE, CHANNEL_LABELS } from "../contentBoardUtils";
import { ChannelBadge } from "./ContentCardTile";
import { ContentCardEditor } from "./ContentCardEditor";
import { SchedulePicker } from "./SchedulePicker";

export function ContentCardModal(props: {
  card: ContentCard | null;
  onClose: () => void;
  onSave: (
    id: string,
    patch: {
      channel?: ContentCardChannel;
      title?: string;
      body?: string;
      bodyDoc?: unknown;
      media?: ContentCardMediaItem[];
      status?: "draft" | "scheduled" | "published" | "archived";
      scheduledFor?: string | null;
    },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Launch a publish task for this card (opens a seeded draft thread). */
  onPublish: (card: ContentCard) => void;
}) {
  const { card, onClose, onSave, onDelete, onPublish } = props;
  const { t } = useLingui();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<ContentCardChannel>("writer");
  const [media, setMedia] = useState<ContentCardMediaItem[]>([]);
  const [scheduling, setScheduling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load the card into the composer when a different card opens.
  if (card && card.id !== loadedId) {
    setLoadedId(card.id);
    setTitle(card.title);
    setBody(card.body);
    setChannel(card.channel);
    setMedia(card.media);
    setScheduling(false);
  }

  const compose = card ? CHANNEL_COMPOSE[channel] : null;

  async function save(patch: Parameters<typeof onSave>[1]) {
    if (!card) return;
    setBusy(true);
    try {
      await onSave(card.id, patch);
    } finally {
      setBusy(false);
    }
  }

  /** Pull current editor text into `body` for plain channels. */
  function currentBody(): string {
    if (compose?.rich) {
      return editorRef.current?.getText() ?? body;
    }
    return body;
  }

  async function saveContent(extra: Parameters<typeof onSave>[1] = {}) {
    const text = currentBody();
    await save({
      title,
      body: text,
      channel,
      media,
      ...(compose?.rich ? { bodyDoc: editorRef.current?.getJSON() ?? null } : {}),
      ...extra,
    });
  }

  /** Persist one picked file under the card's local media dir. */
  async function saveMediaFile(file: File): Promise<ContentCardMediaItem> {
    const kind = file.type.startsWith("video/") ? "video" : "image";
    const dataBase64 = await new Promise<string>((resolvePromise, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolvePromise(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    return readBridge().saveContentCardMedia({
      cardId: card!.id,
      fileName: file.name,
      kind,
      dataBase64,
    });
  }

  async function attachMedia(files: FileList | null) {
    if (!card || !files?.length) return;
    setBusy(true);
    try {
      const added: ContentCardMediaItem[] = [];
      for (const file of Array.from(files)) {
        added.push(await saveMediaFile(file));
      }
      const next = [...media, ...added];
      setMedia(next);
      await save({ media: next });
    } finally {
      setBusy(false);
    }
  }

  /** Editor inline insert: save the file, track it in media, return its local URL. */
  async function insertMedia(file: File): Promise<{ url: string; name: string } | null> {
    if (!card) return null;
    const item = await saveMediaFile(file);
    const next = [...media, item];
    setMedia(next);
    void save({ media: next });
    return { url: toLocalFileUrl(item.path), name: item.name };
  }

  async function removeMedia(item: ContentCardMediaItem) {
    const next = media.filter((m) => m.id !== item.id);
    setMedia(next);
    await save({ media: next });
  }

  // Only plain channels show a counter — they edit `body` state directly.
  const charCount = body.length;
  const overLimit = compose?.charLimit != null && charCount > compose.charLimit;

  const placeholders: Record<string, string> = {
    post: t`What do you want to post?`,
    article: t`Write the article…`,
    video: t`Video title and description…`,
  };

  return (
    <Modal.Backdrop isOpen={card !== null} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container size="lg" placement="center" scroll="inside">
        <Modal.Dialog className="sm:max-w-[920px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <div className="flex items-center gap-2 pr-8">
              <Modal.Heading>{card?.title || <Trans>New post</Trans>}</Modal.Heading>
              {card ? <ChannelBadge channel={card.channel} /> : null}
            </div>
          </Modal.Header>
          <Modal.Body className="space-y-4">
            {card ? (
              <>
                <TextField value={title} onChange={setTitle} aria-label={t`Title`}>
                  <Input placeholder={channel === "youtube" ? t`Video title` : t`Title`} />
                </TextField>

                {compose?.rich ? (
                  <ContentCardEditor
                    key={card.id}
                    initialDoc={card.bodyDoc ?? card.body}
                    placeholder={placeholders[compose.placeholderKey]!}
                    onReady={(editor) => {
                      editorRef.current = editor;
                    }}
                    onInsertMedia={insertMedia}
                  />
                ) : (
                  <TextArea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    autoSize
                    maxRows={18}
                    placeholder={placeholders[compose?.placeholderKey ?? "post"]!}
                    aria-label={t`Content body`}
                  />
                )}

                {compose?.charLimit != null ? (
                  <p
                    className={`text-right text-[11px] ${overLimit ? "text-danger" : "text-muted"}`}
                  >
                    {charCount} / {compose.charLimit}
                    {channel === "x" ? (
                      <span className="text-muted">
                        {" "}
                        · <Trans>threads for longer</Trans>
                      </span>
                    ) : null}
                  </p>
                ) : null}

                {media.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {media.map((item) => (
                      <div
                        key={item.id}
                        className="group relative size-16 overflow-hidden rounded-md border border-[var(--hairline)] bg-surface-secondary"
                        title={item.name}
                      >
                        {item.kind === "video" ? (
                          <video
                            src={toLocalFileUrl(item.path)}
                            className="size-full object-cover"
                            muted
                          />
                        ) : (
                          <img
                            src={resolveLocalImageDisplayUrl(toLocalFileUrl(item.path))}
                            alt={item.name}
                            className="size-full object-cover"
                          />
                        )}
                        <button
                          type="button"
                          aria-label={t`Remove media`}
                          className="absolute right-0.5 top-0.5 hidden rounded-full bg-surface/90 p-0.5 text-muted hover:text-foreground group-hover:block"
                          onClick={() => void removeMedia(item)}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <Dropdown>
                    <Button variant="tertiary" size="sm">
                      {CHANNEL_LABELS[channel]}
                      <ChevronDown className="size-3.5" />
                    </Button>
                    <Dropdown.Popover>
                      <Dropdown.Menu
                        aria-label={t`Channel`}
                        onAction={(key) => setChannel(key as ContentCardChannel)}
                      >
                        {CHANNELS.map((c) => (
                          <Dropdown.Item key={c} id={c} textValue={CHANNEL_LABELS[c]}>
                            <Label>{CHANNEL_LABELS[c]}</Label>
                          </Dropdown.Item>
                        ))}
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                  <Button
                    variant="tertiary"
                    size="sm"
                    isDisabled={busy}
                    onPress={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="size-3.5" />
                    <Trans>Attach media</Trans>
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    aria-label={t`Attach media`}
                    onChange={(e) => {
                      void attachMedia(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  {card.scheduledFor ? (
                    <span className="text-xs text-muted">
                      <Trans>Scheduled: {new Date(card.scheduledFor).toLocaleString()}</Trans>
                    </span>
                  ) : null}
                  {card.publishUrl ? (
                    <a
                      href={card.publishUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-accent hover:underline"
                    >
                      {card.publishUrl}
                    </a>
                  ) : null}
                  {card.publishError ? (
                    <span className="text-xs text-danger">{card.publishError}</span>
                  ) : null}
                  {card.sourceThreadId ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => openThread(card.sourceThreadId!)}
                    >
                      <Trans>Open source thread</Trans>
                    </Button>
                  ) : null}
                </div>

                {scheduling ? (
                  <SchedulePicker
                    onSchedule={(iso) => {
                      setScheduling(false);
                      void saveContent({ status: "scheduled", scheduledFor: iso });
                    }}
                    onCancel={() => setScheduling(false)}
                  />
                ) : null}
              </>
            ) : null}
          </Modal.Body>
          {card ? (
            <Modal.Footer className="justify-between">
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  isDisabled={busy}
                  onPress={() => void save({ status: "archived" }).then(onClose)}
                >
                  <Archive className="size-3.5" />
                  <Trans>Archive</Trans>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  isDisabled={busy}
                  onPress={() => void onDelete(card.id).then(onClose)}
                >
                  <Trash2 className="size-3.5" />
                  <Trans>Delete</Trans>
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="tertiary"
                  size="sm"
                  isDisabled={busy}
                  onPress={() => void saveContent()}
                >
                  <Check className="size-3.5" />
                  <Trans>Save</Trans>
                </Button>
                {card.status !== "published" ? (
                  <Button
                    variant="tertiary"
                    size="sm"
                    isDisabled={busy}
                    onPress={() => setScheduling((v) => !v)}
                  >
                    <CalendarClock className="size-3.5" />
                    <Trans>Schedule…</Trans>
                  </Button>
                ) : null}
                {card.status !== "published" ? (
                  <Button
                    size="sm"
                    isDisabled={busy}
                    onPress={() => {
                      void saveContent().then(() => {
                        onPublish(card);
                        onClose();
                      });
                    }}
                  >
                    <Globe className="size-3.5" />
                    <Trans>Publish with Browser</Trans>
                  </Button>
                ) : null}
              </div>
            </Modal.Footer>
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
