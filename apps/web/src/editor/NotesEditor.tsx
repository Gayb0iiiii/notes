import Bold from "lucide-react/dist/esm/icons/bold.js";
import Heading1 from "lucide-react/dist/esm/icons/heading-1.js";
import Heading2 from "lucide-react/dist/esm/icons/heading-2.js";
import ImagePlus from "lucide-react/dist/esm/icons/image-plus.js";
import Italic from "lucide-react/dist/esm/icons/italic.js";
import List from "lucide-react/dist/esm/icons/list.js";
import ListOrdered from "lucide-react/dist/esm/icons/list-ordered.js";
import TableIcon from "lucide-react/dist/esm/icons/table.js";
import { useEffect, useRef, useState } from "react";
import type { PageDto } from "@notes/shared";
import { localDb } from "../lib/localDb";

interface NotesEditorProps {
  workspaceId: string;
  page: PageDto;
  pages: PageDto[];
}

function command(name: string, value?: string) {
  document.execCommand(name, false, value);
}

function tableHtml(rows: number, cols: number) {
  const safeRows = Math.max(1, Math.min(20, rows));
  const safeCols = Math.max(1, Math.min(12, cols));
  const head = `<tr>${Array.from({ length: safeCols }, () => "<th><br></th>").join("")}</tr>`;
  const body = Array.from({ length: Math.max(0, safeRows - 1) }, () => `<tr>${Array.from({ length: safeCols }, () => "<td><br></td>").join("")}</tr>`).join("");
  return `<table><tbody>${head}${body}</tbody></table><p><br></p>`;
}

export function NotesEditor({ page }: NotesEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [loadedPageId, setLoadedPageId] = useState<string | null>(null);
  const [tableLength, setTableLength] = useState(3);
  const [tableWidth, setTableWidth] = useState(4);

  useEffect(() => {
    let cancelled = false;
    setLoadedPageId(null);
    void localDb.localDocuments.get(page.id).then((document) => {
      if (cancelled || !editorRef.current) return;
      editorRef.current.innerHTML = document?.html || "<p><br></p>";
      setLoadedPageId(page.id);
    });
    return () => {
      cancelled = true;
    };
  }, [page.id]);

  async function save() {
    if (!editorRef.current || loadedPageId !== page.id) return;
    await localDb.localDocuments.put({
      pageId: page.id,
      html: editorRef.current.innerHTML,
      updatedAt: new Date().toISOString()
    });
  }

  function runToolbar(action: () => void) {
    editorRef.current?.focus();
    action();
    void save();
  }

  async function insertImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      runToolbar(() => command("insertHTML", `<img src="${reader.result}" alt="${file.name.replaceAll('"', "&quot;")}">`));
    };
    reader.readAsDataURL(file);
  }

  return (
    <section className="editor-panel">
      <div className="editor-toolbar">
        <button title="Bold" onClick={() => runToolbar(() => command("bold"))}><Bold size={16} /></button>
        <button title="Italic" onClick={() => runToolbar(() => command("italic"))}><Italic size={16} /></button>
        <button title="Heading 1" onClick={() => runToolbar(() => command("formatBlock", "h1"))}><Heading1 size={16} /></button>
        <button title="Heading 2" onClick={() => runToolbar(() => command("formatBlock", "h2"))}><Heading2 size={16} /></button>
        <button title="Bullet list" onClick={() => runToolbar(() => command("insertUnorderedList"))}><List size={16} /></button>
        <button title="Numbered list" onClick={() => runToolbar(() => command("insertOrderedList"))}><ListOrdered size={16} /></button>
        <div className="table-insert-controls">
          <label title="Table length">
            <span>L</span>
            <input type="number" min={1} max={20} value={tableLength} onChange={(event) => setTableLength(Number(event.target.value) || 1)} />
          </label>
          <label title="Table width">
            <span>W</span>
            <input type="number" min={1} max={12} value={tableWidth} onChange={(event) => setTableWidth(Number(event.target.value) || 1)} />
          </label>
          <button title="Insert table" onClick={() => runToolbar(() => command("insertHTML", tableHtml(tableLength, tableWidth)))}><TableIcon size={16} /></button>
        </div>
        <label className="icon-upload" title="Image">
          <ImagePlus size={16} />
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => event.currentTarget.files?.[0] && void insertImage(event.currentTarget.files[0])} />
        </label>
        <span className="connection-dot" data-connected="false">Local</span>
      </div>
      <div
        ref={editorRef}
        className="prose editor-surface"
        contentEditable
        suppressContentEditableWarning
        onInput={() => void save()}
        onBlur={() => void save()}
        onPaste={(event) => {
          const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith("image/"));
          if (!file) return;
          event.preventDefault();
          void insertImage(file);
        }}
        onDrop={(event) => {
          const file = [...(event.dataTransfer?.files ?? [])].find((item) => item.type.startsWith("image/"));
          if (!file) return;
          event.preventDefault();
          void insertImage(file);
        }}
      />
    </section>
  );
}
