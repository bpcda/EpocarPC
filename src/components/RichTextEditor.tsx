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
import { editorHtml } from "@/lib/rich-text";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  label?: string;
  disabled?: boolean;
}

export default function RichTextEditor({ content, onChange, label = "Contenuto", disabled = false }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: editorHtml(content),
    editable: !disabled,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { role: "textbox", "aria-label": label, "aria-multiline": "true" } },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && editorHtml(content) !== editor.getHTML()) {
      editor.commands.setContent(editorHtml(content), { emitUpdate: false });
    }
  }, [content, editor]);

  useEffect(() => { editor?.setEditable(!disabled, false); }, [disabled, editor]);

  if (!editor) return null;

  const btnClass = (active: boolean) =>
    `inline-flex min-h-11 min-w-11 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`;

  const addLink = () => {
    const url = prompt("URL del link:");
    if (url) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  };

  return (
    <div className="border border-input rounded-md overflow-hidden">
      {/* Toolbar */}
      <div role="group" aria-label={`Formattazione: ${label}`} className="flex flex-wrap gap-0.5 p-1 sm:p-2 border-b border-input bg-muted/30">
        <button type="button" aria-label="Grassetto" title="Grassetto" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive("bold"))}>
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Corsivo" title="Corsivo" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive("italic"))}>
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Sottolineato" title="Sottolineato" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnClass(editor.isActive("underline"))}>
          <UnderlineIcon className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Barrato" title="Barrato" onClick={() => editor.chain().focus().toggleStrike().run()} className={btnClass(editor.isActive("strike"))}>
          <Strikethrough className="h-4 w-4" />
        </button>

        <div className="w-px bg-border mx-1" />

        <button type="button" aria-label="Titolo 2" title="Titolo 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btnClass(editor.isActive("heading", { level: 2 }))}>
          <Heading2 className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Titolo 3" title="Titolo 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btnClass(editor.isActive("heading", { level: 3 }))}>
          <Heading3 className="h-4 w-4" />
        </button>

        <div className="w-px bg-border mx-1" />

        <button type="button" aria-label="Elenco puntato" title="Elenco puntato" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive("bulletList"))}>
          <List className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Elenco numerato" title="Elenco numerato" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive("orderedList"))}>
          <ListOrdered className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Citazione" title="Citazione" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive("blockquote"))}>
          <Quote className="h-4 w-4" />
        </button>

        <div className="w-px bg-border mx-1" />

        <button type="button" aria-label="Allinea a sinistra" title="Allinea a sinistra" onClick={() => editor.chain().focus().setTextAlign("left").run()} className={btnClass(editor.isActive({ textAlign: "left" }))}>
          <AlignLeft className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Centra testo" title="Centra testo" onClick={() => editor.chain().focus().setTextAlign("center").run()} className={btnClass(editor.isActive({ textAlign: "center" }))}>
          <AlignCenter className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Allinea a destra" title="Allinea a destra" onClick={() => editor.chain().focus().setTextAlign("right").run()} className={btnClass(editor.isActive({ textAlign: "right" }))}>
          <AlignRight className="h-4 w-4" />
        </button>

        <div className="w-px bg-border mx-1" />

        <button type="button" aria-label="Inserisci link" title="Inserisci link" onClick={addLink} className={btnClass(editor.isActive("link"))}>
          <LinkIcon className="h-4 w-4" />
        </button>

        <div className="w-px bg-border mx-1" />

        <button type="button" aria-label="Annulla formattazione" title="Annulla formattazione" onClick={() => editor.chain().focus().undo().run()} className={btnClass(false)}>
          <Undo className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Ripeti formattazione" title="Ripeti formattazione" onClick={() => editor.chain().focus().redo().run()} className={btnClass(false)}>
          <Redo className="h-4 w-4" />
        </button>
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-4 min-h-[240px] break-words focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[240px] [&_pre]:whitespace-pre-wrap"
      />
    </div>
  );
}
