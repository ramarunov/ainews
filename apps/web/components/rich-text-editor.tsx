"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  LinkIcon,
  ImagePlus,
  Undo,
  Redo,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MediaPickerDialog } from "@/components/media-picker-dialog";
import type { MediaFile } from "@/lib/types";
import { cn } from "@/lib/utils";

type EditorMode = "visual" | "html";

function countWords(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ");
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-t-md border border-b-0 px-3 py-1.5 text-xs font-medium",
        active
          ? "border-border bg-background text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(active && "bg-muted text-foreground")}
    >
      {children}
    </Button>
  );
}

function Toolbar({
  editor,
  onOpenMediaPicker,
}: {
  editor: Editor;
  onOpenMediaPicker: () => void;
}) {
  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previousUrl ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b p-1">
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Ordered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Blockquote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Code block"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label="Link" active={editor.isActive("link")} onClick={setLink}>
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label="Insert image" onClick={onOpenMediaPicker}>
        <ImagePlus className="h-4 w-4" />
      </ToolbarButton>
      <div className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        label="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

export function RichTextEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (html: string) => void;
}) {
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  // WordPress-style "Visual" / "HTML" tabs — visual is the Tiptap WYSIWYG
  // editor below; html is a plain raw-source textarea, matching WordPress's
  // own Text editor (no syntax highlighting there either).
  const [mode, setMode] = useState<EditorMode>("visual");
  const [htmlDraft, setHtmlDraft] = useState(content);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image,
      Placeholder.configure({ placeholder: "Write the article content…" }),
    ],
    content,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[300px] p-3 focus:outline-none dark:prose-invert",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Tiptap doesn't auto-resync from prop changes after mount. External
  // updates to `content` (e.g. the AI Tools panel's "Insert into content" /
  // "Replace content" buttons calling setValue("content", ...)) need to be
  // pushed into the editor explicitly, but only when it actually differs
  // from what's already there — otherwise every keystroke's onUpdate would
  // round-trip back in and reset the cursor position. Skipped entirely
  // while in HTML mode: the textarea is the source of truth there, and
  // resyncing a hidden Tiptap doc on every keystroke would be wasted work -
  // switching back to Visual explicitly pushes the final draft in instead.
  useEffect(() => {
    if (!editor || mode === "html") return;
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor, mode]);

  const handleMediaSelect = (media: MediaFile) => {
    const url = media.publicUrl ?? media.cdnUrl;
    if (url && editor) {
      editor.chain().focus().setImage({ src: url, alt: media.altText ?? "" }).run();
    }
  };

  const switchToHtml = () => {
    if (editor) setHtmlDraft(editor.getHTML());
    setMode("html");
  };

  const switchToVisual = () => {
    editor?.commands.setContent(htmlDraft);
    onChange(htmlDraft);
    setMode("visual");
  };

  if (!editor) return null;

  const wordCount = countWords(mode === "html" ? htmlDraft : content);

  return (
    <div className="rounded-md border">
      <div className="flex gap-1 border-b bg-muted/30 px-1 pt-1">
        <ModeTab active={mode === "visual"} onClick={switchToVisual}>
          Visual
        </ModeTab>
        <ModeTab active={mode === "html"} onClick={switchToHtml}>
          HTML
        </ModeTab>
      </div>
      {mode === "visual" ? (
        <>
          <Toolbar editor={editor} onOpenMediaPicker={() => setMediaPickerOpen(true)} />
          <EditorContent editor={editor} />
        </>
      ) : (
        <textarea
          value={htmlDraft}
          onChange={(e) => {
            setHtmlDraft(e.target.value);
            onChange(e.target.value);
          }}
          spellCheck={false}
          className="min-h-[300px] w-full resize-y p-3 font-mono text-xs focus:outline-none"
        />
      )}
      <div className="border-t px-3 py-1.5 text-right text-xs text-muted-foreground">
        {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
      </div>
      <MediaPickerDialog
        open={mediaPickerOpen}
        onOpenChange={setMediaPickerOpen}
        onSelect={handleMediaSelect}
      />
    </div>
  );
}
