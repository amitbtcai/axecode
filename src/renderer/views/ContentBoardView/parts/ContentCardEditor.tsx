import { useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { TextAlign } from "@tiptap/extension-text-align";
import { Image } from "@tiptap/extension-image";
import { Node, mergeAttributes } from "@tiptap/core";
import { useLingui } from "@lingui/react/macro";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Strikethrough,
  Underline,
  Video,
} from "lucide-react";
import type { Editor } from "@tiptap/core";

/** Inline video node — renders <video controls> and round-trips through bodyDoc. */
const ContentVideo = Node.create({
  name: "contentVideo",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [{ tag: "video[src]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["video", mergeAttributes(HTMLAttributes, { controls: "true" })];
  },
});

/**
 * Fork-owned (Axe Code): WYSIWYG body editor for content cards — same tiptap
 * stack as the project Notes panel. `bodyDoc` (JSON) preserves formatting for
 * editing; callers persist `editor.getText()` into `body` as the publish
 * payload for social channels.
 */
export function ContentCardEditor(props: {
  initialDoc: unknown;
  placeholder: string;
  onReady: (editor: Editor) => void;
  /** Save a picked media file locally; returns the file://-scheme URL to embed, or null. */
  onInsertMedia?: (file: File) => Promise<{ url: string; name: string } | null>;
}) {
  const { t } = useLingui();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: props.placeholder }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image,
      ContentVideo,
    ],
    content: (props.initialDoc as object | null) ?? "",
    editorProps: {
      attributes: {
        class: "lc-notes-prose",
        "aria-label": t`Content body`,
      },
    },
    onCreate: ({ editor: ed }) => props.onReady(ed),
  });

  if (!editor) return null;

  const buttonClass =
    "inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-foreground hover:bg-foreground/5";
  const active = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs) ? "text-accent" : "";
  const activeAlign = (align: string) =>
    editor.isActive({ textAlign: align }) ? "text-accent" : "";

  async function insertMedia(file: File | undefined) {
    if (!file || !props.onInsertMedia) return;
    const saved = await props.onInsertMedia(file);
    if (!saved || !editor) return;
    if (file.type.startsWith("video/")) {
      editor
        .chain()
        .focus()
        .insertContent({ type: "contentVideo", attrs: { src: saved.url } })
        .run();
    } else {
      editor.chain().focus().setImage({ src: saved.url, alt: saved.name }).run();
    }
  }

  const markButtons = (
    <>
      <button
        type="button"
        className={`${buttonClass} ${active("bold")}`}
        title={t`Bold`}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-3.5" />
      </button>
      <button
        type="button"
        className={`${buttonClass} ${active("italic")}`}
        title={t`Italic`}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-3.5" />
      </button>
      <button
        type="button"
        className={`${buttonClass} ${active("underline")}`}
        title={t`Underline`}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline className="size-3.5" />
      </button>
      <button
        type="button"
        className={`${buttonClass} ${active("strike")}`}
        title={t`Strikethrough`}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-3.5" />
      </button>
    </>
  );

  const linkButton = (
    <button
      type="button"
      className={`${buttonClass} ${active("link")}`}
      title={t`Link`}
      onClick={() => {
        const url = window.prompt(t`Link URL`);
        if (url === null) return;
        if (!url) {
          editor.chain().focus().unsetLink().run();
          return;
        }
        editor.chain().focus().setLink({ href: url }).run();
      }}
    >
      <Link2 className="size-3.5" />
    </button>
  );

  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-surface">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--hairline)] px-1.5 py-1">
        {markButtons}
        <div className="mx-0.5 h-4 w-px bg-[color:var(--border)]" />
        {linkButton}
        {props.onInsertMedia ? (
          <>
            <button
              type="button"
              className={buttonClass}
              title={t`Insert image`}
              onClick={() => imageInputRef.current?.click()}
            >
              <ImagePlus className="size-3.5" />
            </button>
            <button
              type="button"
              className={buttonClass}
              title={t`Insert video`}
              onClick={() => videoInputRef.current?.click()}
            >
              <Video className="size-3.5" />
            </button>
          </>
        ) : null}
        <div className="mx-0.5 h-4 w-px bg-[color:var(--border)]" />
        <button
          type="button"
          className={`${buttonClass} ${activeAlign("left")}`}
          title={t`Align left`}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="size-3.5" />
        </button>
        <button
          type="button"
          className={`${buttonClass} ${activeAlign("center")}`}
          title={t`Align center`}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="size-3.5" />
        </button>
        <button
          type="button"
          className={`${buttonClass} ${activeAlign("right")}`}
          title={t`Align right`}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="size-3.5" />
        </button>
        <button
          type="button"
          className={`${buttonClass} ${activeAlign("justify")}`}
          title={t`Justify`}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        >
          <AlignJustify className="size-3.5" />
        </button>
        <div className="mx-0.5 h-4 w-px bg-[color:var(--border)]" />
        <button
          type="button"
          className={`${buttonClass} ${active("heading", { level: 2 })}`}
          title={t`Heading`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-3.5" />
        </button>
        <button
          type="button"
          className={`${buttonClass} ${active("bulletList")}`}
          title={t`Bullet list`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-3.5" />
        </button>
        <button
          type="button"
          className={`${buttonClass} ${active("orderedList")}`}
          title={t`Numbered list`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-3.5" />
        </button>
      </div>
      {/* Clicking empty space below the text focuses the editable (flex stretch
          makes .lc-notes-prose fill the box, this catches the padding clicks). */}
      <EditorContent
        editor={editor}
        className="lc-notes-content flex min-h-[180px] flex-col px-3 py-2"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest(".lc-notes-prose")) {
            editor.commands.focus("end");
          }
        }}
      />
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 rounded-md border border-[color:var(--border)] bg-[var(--content-background)] p-0.5 shadow-md"
      >
        {markButtons}
        {linkButton}
      </BubbleMenu>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={t`Insert image`}
        onChange={(e) => {
          void insertMedia(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        aria-label={t`Insert video`}
        onChange={(e) => {
          void insertMedia(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
