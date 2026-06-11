import Bold from "lucide-react/dist/esm/icons/bold.js";
import CheckSquare from "lucide-react/dist/esm/icons/check-square.js";
import Code2 from "lucide-react/dist/esm/icons/code-2.js";
import FileText from "lucide-react/dist/esm/icons/file-text.js";
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
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import type { PageDto } from "@notes/shared";
import { queueOrUploadAsset } from "../lib/assets";
import { localDb } from "../lib/localDb";
import { usePageDocument } from "./usePageDocument";

interface NotesEditorProps {
  workspaceId: string;
  page: PageDto;
  pages: PageDto[];
}

const KnowledgeBaseImage = Image.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      width: {
        default: "100%",
        parseHTML: (element) => element.getAttribute("data-width") ?? element.getAttribute("width") ?? (element.style.width || null),
        renderHTML: (attributes) => {
          const width = typeof attributes.width === "string" && attributes.width ? attributes.width : "100%";
          return { "data-width": width, width, style: `width: ${width}; max-width: 100%; height: auto;` };
        }
      }
    };
  }
});

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function uploadedFile(event: ChangeEvent<HTMLInputElement>): File | null {
  const file = event.currentTarget.files?.[0] ?? null;
  event.currentTarget.value = "";
  return file;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function NotesEditor({ workspaceId, page }: NotesEditorProps) {
  const { ydoc, connected, localReady } = usePageDocument(workspaceId, page.id);
  const [tableLength, setTableLength] = useState(3);
  const [tableWidth, setTableWidth] = useState(4);
  const [selectedImageWidth, setSelectedImageWidth] = useState("100%");
  const [assetError, setAssetError] = useState<string | null>(null);
  const initializedPageId = useRef<string | null>(null);
  const snapshotTimer = useRef<number | null>(null);

  const extensions = useMemo(() => {
    if (!ydoc) return [];
    return [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: ydoc }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      KnowledgeBaseImage.configure({ allowBase64: true }),
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
      autofocus: false,
      editorProps: {
        attributes: {
          class: "prose editor-surface",
          spellcheck: "true"
        },
        handlePaste(_view, event) {
          const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith("image/") || item.type === "application/pdf");
          if (!file) return false;
          event.preventDefault();
          void insertAsset(file);
          return true;
        },
        handleDrop(_view, event) {
          const file = [...(event.dataTransfer?.files ?? [])].find((item) => item.type.startsWith("image/") || item.type === "application/pdf");
          if (!file) return false;
          event.preventDefault();
          void insertAsset(file);
          return true;
        }
      },
      onUpdate({ editor: currentEditor }) {
        scheduleSnapshot(currentEditor.getHTML());
      }
    },
    [extensions, page.id]
  );

  function scheduleSnapshot(html = editor?.getHTML()) {
    if (!html) return;
    if (snapshotTimer.current) window.clearTimeout(snapshotTimer.current);
    snapshotTimer.current = window.setTimeout(() => {
      snapshotTimer.current = null;
      void saveSnapshot(html);
    }, 450);
  }

  async function saveSnapshot(html = editor?.getHTML()) {
    if (!html) return;
    await localDb.localDocuments.put({
      pageId: page.id,
      html,
      updatedAt: new Date().toISOString()
    });
    window.dispatchEvent(new CustomEvent("notes:document-snapshot", { detail: { pageId: page.id } }));
  }

  useEffect(() => {
    initializedPageId.current = null;
    return () => {
      if (snapshotTimer.current) window.clearTimeout(snapshotTimer.current);
      snapshotTimer.current = null;
    };
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

  useEffect(() => {
    if (!editor) return;
    const refreshSelectedImage = () => {
      if (!editor.isActive("image")) {
        setSelectedImageWidth("100%");
        return;
      }
      const attrs = editor.getAttributes("image") as { width?: string | null };
      setSelectedImageWidth(attrs.width ?? "100%");
    };
    editor.on("selectionUpdate", refreshSelectedImage);
    editor.on("transaction", refreshSelectedImage);
    refreshSelectedImage();
    return () => {
      editor.off("selectionUpdate", refreshSelectedImage);
      editor.off("transaction", refreshSelectedImage);
    };
  }, [editor]);

  async function insertAsset(file: File) {
    if (!editor) return;
    setAssetError(null);
    try {
      const asset = await queueOrUploadAsset(workspaceId, page.id, file);
      if (asset.mimeType.startsWith("image/")) {
        editor
          .chain()
          .focus()
          .setImage({
            src: asset.src,
            alt: file.name,
            title: asset.uploadStatus === "pending" ? "Queued for upload" : file.name,
            width: "100%"
          } as Parameters<typeof editor.commands.setImage>[0])
          .run();
      } else if (asset.mimeType === "application/pdf") {
        const label = `${asset.uploadStatus === "pending" ? "Queued PDF" : "PDF"}: ${file.name}`;
        editor
          .chain()
          .focus()
          .insertContent(`<p><a href="${escapeHtml(asset.src)}" target="_blank" rel="noreferrer">📄 ${escapeHtml(label)}</a></p>`)
          .run();
      } else {
        throw new Error("unsupported_asset_type");
      }
      await saveSnapshot();
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "File could not be added");
    }
  }

  function applySelectedImageWidth(width: string) {
    if (!editor?.isActive("image")) return;
    editor.chain().focus().updateAttributes("image", { width }).run();
    scheduleSnapshot();
  }

  function run(action: () => void) {
    if (!editor) return;
    action();
    scheduleSnapshot();
  }

  function toolbarAction(action: () => void) {
    return (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      run(action);
    };
  }

  return (
    <section className="editor-panel">
      <div className="editor-toolbar" aria-label="Editor toolbar">
        <div className="toolbar-group">
          <button type="button" className={editor?.isActive("bold") ? "active" : ""} title="Bold" onMouseDown={toolbarAction(() => editor?.chain().focus().toggleBold().run())}>
            <Bold size={16} />
          </button>
          <button type="button" className={editor?.isActive("italic") ? "active" : ""} title="Italic" onMouseDown={toolbarAction(() => editor?.chain().focus().toggleItalic().run())}>
            <Italic size={16} />
          </button>
          <button type="button" className={editor?.isActive("heading", { level: 1 }) ? "active" : ""} title="Heading 1" onMouseDown={toolbarAction(() => editor?.chain().focus().toggleHeading({ level: 1 }).run())}>
            <Heading1 size={16} />
          </button>
          <button type="button" className={editor?.isActive("heading", { level: 2 }) ? "active" : ""} title="Heading 2" onMouseDown={toolbarAction(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())}>
            <Heading2 size={16} />
          </button>
        </div>

        <div className="toolbar-group">
          <button type="button" className={editor?.isActive("bulletList") ? "active" : ""} title="Bullet list" onMouseDown={toolbarAction(() => editor?.chain().focus().toggleBulletList().run())}>
            <List size={16} />
          </button>
          <button type="button" className={editor?.isActive("orderedList") ? "active" : ""} title="Numbered list" onMouseDown={toolbarAction(() => editor?.chain().focus().toggleOrderedList().run())}>
            <ListOrdered size={16} />
          </button>
          <button type="button" className={editor?.isActive("taskList") ? "active" : ""} title="Task list" onMouseDown={toolbarAction(() => editor?.chain().focus().toggleTaskList().run())}>
            <CheckSquare size={16} />
          </button>
          <button type="button" className={editor?.isActive("blockquote") ? "active" : ""} title="Quote" onMouseDown={toolbarAction(() => editor?.chain().focus().toggleBlockquote().run())}>
            <Quote size={16} />
          </button>
          <button type="button" className={editor?.isActive("codeBlock") ? "active" : ""} title="Code block" onMouseDown={toolbarAction(() => editor?.chain().focus().toggleCodeBlock().run())}>
            <Code2 size={16} />
          </button>
          <button type="button" title="Divider" onMouseDown={toolbarAction(() => editor?.chain().focus().setHorizontalRule().run())}>
            <Minus size={16} />
          </button>
        </div>

        <div className="toolbar-group table-insert-controls">
          <label title="Table length">
            <span>L</span>
            <input type="number" min={1} max={20} value={tableLength} onChange={(event) => setTableLength(clampNumber(Number(event.target.value), 1, 20))} />
          </label>
          <label title="Table width">
            <span>W</span>
            <input type="number" min={1} max={12} value={tableWidth} onChange={(event) => setTableWidth(clampNumber(Number(event.target.value), 1, 12))} />
          </label>
          <button type="button" title="Insert table" onMouseDown={toolbarAction(() => editor?.chain().focus().insertTable({ rows: tableLength, cols: tableWidth, withHeaderRow: true }).run())}>
            <TableIcon size={16} />
          </button>
          <button type="button" title="Add row" disabled={!editor?.isActive("table")} onMouseDown={toolbarAction(() => editor?.chain().focus().addRowAfter().run())}>
            <Plus size={16} />
          </button>
          <button type="button" title="Add column" disabled={!editor?.isActive("table")} onMouseDown={toolbarAction(() => editor?.chain().focus().addColumnAfter().run())}>
            <TableIcon size={16} />
          </button>
          <button type="button" title="Delete table" disabled={!editor?.isActive("table")} onMouseDown={toolbarAction(() => editor?.chain().focus().deleteTable().run())}>
            <Trash2 size={16} />
          </button>
        </div>

        <div className="toolbar-group image-controls" aria-label="Selected image size">
          <label className="icon-upload" title="Photo or PDF">
            <ImagePlus size={16} />
            <input type="file" accept="image/*,application/pdf" onChange={(event) => {
              const file = uploadedFile(event);
              if (file) void insertAsset(file);
            }} />
          </label>
          <label className="icon-upload" title="PDF">
            <FileText size={16} />
            <input type="file" accept="application/pdf" onChange={(event) => {
              const file = uploadedFile(event);
              if (file) void insertAsset(file);
            }} />
          </label>
          <button type="button" className={selectedImageWidth === "33%" ? "active text-tool" : "text-tool"} title="Image width 33%" disabled={!editor?.isActive("image")} onMouseDown={toolbarAction(() => applySelectedImageWidth("33%"))}>33</button>
          <button type="button" className={selectedImageWidth === "50%" ? "active text-tool" : "text-tool"} title="Image width 50%" disabled={!editor?.isActive("image")} onMouseDown={toolbarAction(() => applySelectedImageWidth("50%"))}>50</button>
          <button type="button" className={selectedImageWidth === "75%" ? "active text-tool" : "text-tool"} title="Image width 75%" disabled={!editor?.isActive("image")} onMouseDown={toolbarAction(() => applySelectedImageWidth("75%"))}>75</button>
          <button type="button" className={selectedImageWidth === "100%" ? "active text-tool" : "text-tool"} title="Image width 100%" disabled={!editor?.isActive("image")} onMouseDown={toolbarAction(() => applySelectedImageWidth("100%"))}>100</button>
        </div>

        <span className="connection-dot" data-connected={connected}>{connected ? "Live" : localReady ? "Local" : "Loading"}</span>
      </div>
      {assetError ? <p className="editor-error">{assetError}</p> : null}
      <EditorContent editor={editor} />
    </section>
  );
}
