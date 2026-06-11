import TableIcon from "lucide-react/dist/esm/icons/table.js";
import Plus from "lucide-react/dist/esm/icons/plus.js";
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Editor } from "@tiptap/react";

interface TablePopoverProps {
  editor: Editor | null;
  run: (action: () => void) => void;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function TablePopover({ editor, run }: TablePopoverProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(4);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inTable = editor?.isActive("table") ?? false;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: globalThis.MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close when editor selection leaves a table
  useEffect(() => {
    if (!editor) return;
    const close = () => { if (open && !editor.isActive("table")) setOpen(false); };
    editor.on("selectionUpdate", close);
    return () => { editor.off("selectionUpdate", close); };
  }, [editor, open]);

  function handleToggle(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    setOpen((v) => !v);
  }

  function insertTable(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    run(() => editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run());
    setOpen(false);
  }

  function tableAction(action: () => void) {
    return (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      run(action);
    };
  }

  return (
    <div className="table-popover-wrap">
      <div className="toolbar-group">
        <button
          ref={buttonRef}
          type="button"
          title={inTable ? "Table options" : "Insert table"}
          className={open || inTable ? "active" : ""}
          onMouseDown={handleToggle}
        >
          <TableIcon size={16} />
        </button>
      </div>

      {open && (
        <div className="table-popover" ref={popoverRef}>
          {inTable ? (
            <>
              <p className="table-popover-label">Table</p>
              <div className="table-popover-actions">
                <button type="button" onMouseDown={tableAction(() => editor?.chain().focus().addRowAfter().run())}>
                  <Plus size={13} /> Add row
                </button>
                <button type="button" onMouseDown={tableAction(() => editor?.chain().focus().addColumnAfter().run())}>
                  <Plus size={13} /> Add column
                </button>
                <button type="button" onMouseDown={tableAction(() => editor?.chain().focus().deleteRow().run())}>
                  <Trash2 size={13} /> Delete row
                </button>
                <button type="button" onMouseDown={tableAction(() => editor?.chain().focus().deleteColumn().run())}>
                  <Trash2 size={13} /> Delete column
                </button>
                <button type="button" className="table-popover-danger" onMouseDown={tableAction(() => editor?.chain().focus().deleteTable().run())}>
                  <Trash2 size={13} /> Delete table
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="table-popover-label">Insert table</p>
              <div className="table-popover-fields">
                <label>
                  Rows
                  <input
                    type="number" min={1} max={20} value={rows}
                    onChange={(e) => setRows(clampNumber(Number(e.target.value), 1, 20))}
                  />
                </label>
                <label>
                  Columns
                  <input
                    type="number" min={1} max={12} value={cols}
                    onChange={(e) => setCols(clampNumber(Number(e.target.value), 1, 12))}
                  />
                </label>
              </div>
              <button className="table-popover-insert" type="button" onMouseDown={insertTable}>
                Insert
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
