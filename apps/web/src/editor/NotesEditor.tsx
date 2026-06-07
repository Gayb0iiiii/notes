import Bold from "lucide-react/dist/esm/icons/bold.js";
import CheckSquare from "lucide-react/dist/esm/icons/check-square.js";
import Code2 from "lucide-react/dist/esm/icons/code-2.js";
import Heading1 from "lucide-react/dist/esm/icons/heading-1.js";
import Heading2 from "lucide-react/dist/esm/icons/heading-2.js";
import ImagePlus from "lucide-react/dist/esm/icons/image-plus.js";
import Italic from "lucide-react/dist/esm/icons/italic.js";
import List from "lucide-react/dist/esm/icons/list.js";
import ListOrdered from "lucide-react/dist/esm/icons/list-ordered.js";
import Minus from "lucide-react/dist/esm/icons/minus.js";
import Plus from "lucide-react/dist/esm/icons/plus.js";
import Quote from "lucide-react/dist/esm/icons/quote.js";
import TableIcon from "lucide-react/dist/esm/icons/table.js";
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { PageDto } from "@notes/shared";
import { queueOrUploadImage } from "../lib/assets";
import { localDb } from "../lib/localDb";
import { usePageDocument } from "./usePageDocument";

interface NotesEditorProps {
  workspaceId: string;
  page: PageDto;
  pages: PageDto[];
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function uploadedFile(event: ChangeEvent<HTMLInputElement>): File | null {
  const file = event.currentTarget.files?.[0] ?? null;
  event.currentTarget.value = "";
  return file;
}

export function NotesEditor({ workspaceId, page }: NotesEditorProps) {
  const { ydoc, connected, localReady } = usePageDocument(workspaceId, page.id);
  const [tableLength, setTableLength] = useState(3);
  const [tableWidth, setTableWidth] = useState(4);
  const [imageError, setImageError] = useState<string | null>(null);
  const initializedPageId = useRef<string | null>(null);

  const extensions = useMemo(() => {
    if (!ydoc) return [];
    return [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: ydoc }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Image.configure({ allowBase64: true }),
      Placeholder.configure({ placeholder: "Start writing..." }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell
    ];
  }, [ydoc]);

  const editor = useEditor(
    {
      extensions,
      autofocus: "end",
      editorProps: {
        attributes: {
          class: "prose editor-surface",
          spellcheck: "true"
        },
        handlePaste(_view, event) {
          const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith("image/"));
          if (!file) return false;
          event.preventDefault();
          void insertImage(file);
          return true;
        },
        handleDrop(_view, event) {
          const file = [...(event.dataTransfer?.files ?? [])].find((item) => item.type.startsWith("image/"));
          if (!file) return false;
          event.preventDefault();
          void insertImage(file);
          return true;
        }
      },
      onUpdate({ editor: currentEditor }) {
        void saveSnapshot(currentEditor.getHTML());
      }
    },
    [extensions, page.id]
  );

  async function saveSnapshot(html = editor?.getHTML()) {
    if (!html) return;
    await localDb.localDocuments.put({
      pageId: page.id,
      html,
      updatedAt: new Date().toISOString()
    });
  }

  useEffect(() => {
    initializedPageId.current = null;
  }, [page.id]);

  useEffect(() => {
    if (!editor || !ydoc || !localReady || initializedPageId.current === page.id) return;
    initializedPageId.current = page.id;
    const fragment = ydoc.getXmlFragment("default");
    if (fragment.length > 0) {
      void saveSnapshot(editor.getHTML());
      return;
    }

    void localDb.localDocuments.get(page.id).then((document) => {
      if (initializedPageId.current !== page.id || ydoc.getXmlFragment("default").length > 0) return;
      editor.commands.setContent(document?.html || "<p></p>", false);
      void saveSnapshot(editor.getHTML());
    });
  }, [editor, localReady, page.id, ydoc]);

  async function insertImage(file: File) {
    if (!editor) return;
    setImageError(null);
    try {
      const image = await queueOrUploadImage(workspaceId, page.id, file);
      editor
        .chain()
        .focus()
        .setImage({
          src: image.src,
          alt: file.name,
          title: image.uploadStatus === "pending" ? "Queued for upload" : file.name
        })
        .run();
      await saveSnapshot();
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Image could not be added");
    }
  }

  function run(action: () => void) {
    if (!editor) return;
    action();
    void saveSnapshot();
  }

  return (
    <section className="editor-panel">
      <div className="editor-toolbar" aria-label="Editor toolbar">
        <button className={editor?.isActive("bold") ? "active" : ""} title="Bold" onClick={() => run(() => editor?.chain().focus().toggleBold().run())}>
          <Bold size={16} />
        </button>
        <button className={editor?.isActive("italic") ? "active" : ""} title="Italic" onClick={() => run(() => editor?.chain().focus().toggleItalic().run())}>
          <Italic size={16} />
        </button>
        <button className={editor?.isActive("heading", { level: 1 }) ? "active" : ""} title="Heading 1" onClick={() => run(() => editor?.chain().focus().toggleHeading({ level: 1 }).run())}>
          <Heading1 size={16} />
        </button>
        <button className={editor?.isActive("heading", { level: 2 }) ? "active" : ""} title="Heading 2" onClick={() => run(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())}>
          <Heading2 size={16} />
        </button>
        <button className={editor?.isActive("bulletList") ? "active" : ""} title="Bullet list" onClick={() => run(() => editor?.chain().focus().toggleBulletList().run())}>
          <List size={16} />
        </button>
        <button className={editor?.isActive("orderedList") ? "active" : ""} title="Numbered list" onClick={() => run(() => editor?.chain().focus().toggleOrderedList().run())}>
          <ListOrdered size={16} />
        </button>
        <button className={editor?.isActive("taskList") ? "active" : ""} title="Task list" onClick={() => run(() => editor?.chain().focus().toggleTaskList().run())}>
          <CheckSquare size={16} />
        </button>
        <button className={editor?.isActive("blockquote") ? "active" : ""} title="Quote" onClick={() => run(() => editor?.chain().focus().toggleBlockquote().run())}>
          <Quote size={16} />
        </button>
        <button className={editor?.isActive("codeBlock") ? "active" : ""} title="Code block" onClick={() => run(() => editor?.chain().focus().toggleCodeBlock().run())}>
          <Code2 size={16} />
        </button>
        <button title="Divider" onClick={() => run(() => editor?.chain().focus().setHorizontalRule().run())}>
          <Minus size={16} />
        </button>

        <div className="table-insert-controls">
          <label title="Table length">
            <span>L</span>
            <input type="number" min={1} max={20} value={tableLength} onChange={(event) => setTableLength(clampNumber(Number(event.target.value), 1, 20))} />
          </label>
          <label title="Table width">
            <span>W</span>
            <input type="number" min={1} max={12} value={tableWidth} onChange={(event) => setTableWidth(clampNumber(Number(event.target.value), 1, 12))} />
          </label>
          <button title="Insert table" onClick={() => run(() => editor?.chain().focus().insertTable({ rows: tableLength, cols: tableWidth, withHeaderRow: true }).run())}>
            <TableIcon size={16} />
          </button>
        </div>
        <button title="Add row" disabled={!editor?.isActive("table")} onClick={() => run(() => editor?.chain().focus().addRowAfter().run())}>
          <Plus size={16} />
        </button>
        <button title="Add column" disabled={!editor?.isActive("table")} onClick={() => run(() => editor?.chain().focus().addColumnAfter().run())}>
          <TableIcon size={16} />
        </button>
        <button title="Delete table" disabled={!editor?.isActive("table")} onClick={() => run(() => editor?.chain().focus().deleteTable().run())}>
          <Trash2 size={16} />
        </button>

        <label className="icon-upload" title="Image">
          <ImagePlus size={16} />
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => {
            const file = uploadedFile(event);
            if (file) void insertImage(file);
          }} />
        </label>
        <span className="connection-dot" data-connected={connected}>{connected ? "Live" : localReady ? "Local" : "Loading"}</span>
      </div>
      {imageError ? <p className="editor-error">{imageError}</p> : null}
      <EditorContent editor={editor} />
    </section>
  );
}
