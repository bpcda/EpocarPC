import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Quote,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
} from "lucide-react";
import { useEffect } from "react";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
}

export default function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content]);

  if (!editor) return null;

  const btnClass = (active: boolean) =>
    `p-1.5 rounded transition-colors ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`;

  const addLink = () => {
    const url = prompt("URL del link:");
    if (url) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  };

  return (
    <div className="border border-input rounded-md overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-0.5 p-2 border-b border-input bg-muted/30">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive("bold"))}>
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive("italic"))}>
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnClass(editor.isActive("underline"))}>
          <UnderlineIcon className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btnClass(editor.isActive("strike"))}>
          <Strikethrough className="h-4 w-4" />
        </button>

        <div className="w-px bg-border mx-1" />

        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btnClass(editor.isActive("heading", { level: 2 }))}>
          <Heading2 className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btnClass(editor.isActive("heading", { level: 3 }))}>
          <Heading3 className="h-4 w-4" />
        </button>

        <div className="w-px bg-border mx-1" />

        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive("bulletList"))}>
          <List className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive("orderedList"))}>
          <ListOrdered className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive("blockquote"))}>
          <Quote className="h-4 w-4" />
        </button>

        <div className="w-px bg-border mx-1" />

        <button type="button" onClick={() => editor.chain().focus().setTextAlign("left").run()} className={btnClass(editor.isActive({ textAlign: "left" }))}>
          <AlignLeft className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("center").run()} className={btnClass(editor.isActive({ textAlign: "center" }))}>
          <AlignCenter className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("right").run()} className={btnClass(editor.isActive({ textAlign: "right" }))}>
          <AlignRight className="h-4 w-4" />
        </button>

        <div className="w-px bg-border mx-1" />

        <button type="button" onClick={addLink} className={btnClass(editor.isActive("link"))}>
          <LinkIcon className="h-4 w-4" />
        </button>

        <div className="w-px bg-border mx-1" />

        <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btnClass(false)}>
          <Undo className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btnClass(false)}>
          <Redo className="h-4 w-4" />
        </button>
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-3 min-h-[200px] focus-within:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[200px]"
      />
    </div>
  );
}
