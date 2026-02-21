import { useState, useRef } from "react";
import type { NoteResponse } from "../../api/client";

interface ExportNoteButtonProps {
  note: NoteResponse;
  /** When true, renders as two menu items (no dropdown), for use inside another menu */
  asMenuItems?: boolean;
  onAction?: () => void;
}

function exportAsHtml(title: string, content: string) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
    pre { background: #f4f4f4; padding: 1rem; border-radius: 8px; overflow-x: auto; }
    code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 4px; }
    h1,h2,h3 { margin-top: 1.5em; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="content">${content
    .split("\n")
    .map((l) => `<p>${escapeHtml(l) || "&nbsp;"}</p>`)
    .join("")}</div>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(title)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAsPdf(title: string, content: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; font-size: 14px; }
    pre { background: #f4f4f4; padding: 1rem; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; }
    code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 4px; }
    h1,h2,h3 { margin-top: 1.5em; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="content">${content
    .split("\n")
    .map((l) => `<p>${escapeHtml(l) || "&nbsp;"}</p>`)
    .join("")}</div>
</body>
</html>`);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
    printWindow.close();
  };
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function slugify(s: string): string {
  return s
    .replace(/[^a-zA-Zа-яА-Я0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "note";
}

export function ExportNoteButton({ note, asMenuItems, onAction }: ExportNoteButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const doHtml = () => {
    exportAsHtml(note.title, note.content);
    onAction?.();
  };
  const doPdf = () => {
    exportAsPdf(note.title, note.content);
    onAction?.();
  };

  if (asMenuItems) {
    return (
      <>
        <button
          type="button"
          onClick={doHtml}
          className="touch-target-48 w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-accent-muted flex items-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Экспорт HTML
        </button>
        <button
          type="button"
          onClick={doPdf}
          className="touch-target-48 w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-accent-muted flex items-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Экспорт PDF
        </button>
      </>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-text-secondary hover:text-accent touch-target-48 px-2 py-1.5 rounded-lg hover:bg-accent-muted"
        title="Экспорт"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[99]"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-[100] py-1 rounded-lg border border-border bg-surface shadow-lg min-w-[140px]">
            <button
              type="button"
              className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-accent-muted"
              onClick={() => {
                doHtml();
                setOpen(false);
              }}
            >
              HTML
            </button>
            <button
              type="button"
              className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-accent-muted"
              onClick={() => {
                doPdf();
                setOpen(false);
              }}
            >
              PDF (печать)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
