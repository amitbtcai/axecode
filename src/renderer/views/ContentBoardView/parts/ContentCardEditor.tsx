import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { useLingui } from "@lingui/react/macro";
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Strikethrough } from "lucide-react";
import type { Editor } from "@tiptap/core";

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
}) {
  const { t } = useLingui();
  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: props.placeholder })],
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

  return (
    <div className="min-h-[140px] rounded-lg border border-[var(--hairline)] bg-surface px-3 py-2">
      <EditorContent editor={editor} className="lc-notes-content" />
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 rounded-md border border-[color:var(--border)] bg-[var(--content-background)] p-0.5 shadow-md"
      >
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("bold") ? "text-accent" : ""}`}
          title={t`Bold`}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-3.5" />
        </button>
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("italic") ? "text-accent" : ""}`}
          title={t`Italic`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-3.5" />
        </button>
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("strike") ? "text-accent" : ""}`}
          title={t`Strikethrough`}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-3.5" />
        </button>
        <div className="mx-0.5 h-4 w-px bg-[color:var(--border)]" />
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("heading", { level: 2 }) ? "text-accent" : ""}`}
          title={t`Heading`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-3.5" />
        </button>
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("bulletList") ? "text-accent" : ""}`}
          title={t`Bullet list`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-3.5" />
        </button>
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("orderedList") ? "text-accent" : ""}`}
          title={t`Numbered list`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-3.5" />
        </button>
        <div className="mx-0.5 h-4 w-px bg-[color:var(--border)]" />
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("link") ? "text-accent" : ""}`}
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
      </BubbleMenu>
    </div>
  );
}
