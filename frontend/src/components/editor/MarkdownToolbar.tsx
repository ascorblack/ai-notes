import type { EditorView } from "@codemirror/view";

interface MarkdownToolbarProps {
  view: EditorView;
  from: number;
  to: number;
  onClose: () => void;
}

function wrapBold(text: string): string {
  if (/^\*\*.*\*\*$/.test(text)) return text.slice(2, -2);
  return `**${text}**`;
}
function wrapItalic(text: string): string {
  if (/^\*.*\*$/.test(text) && !text.startsWith("**")) return text.slice(1, -1);
  return `*${text}*`;
}
function wrapCode(text: string): string {
  if (/^`.*`$/.test(text)) return text.slice(1, -1);
  return `\`${text}\``;
}
function wrapLink(text: string): string {
  const url = encodeURIComponent(text);
  return `[${text}](${url})`;
}

export function MarkdownToolbar({ view, from, to, onClose }: MarkdownToolbarProps) {
  const apply = (wrap: (t: string) => string) => {
    const text = view.state.sliceDoc(from, to);
    const replacement = wrap(text);
    view.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: from, head: from + replacement.length },
    });
    onClose();
  };

  return (
    <div
      className="absolute z-50 flex gap-0.5 rounded-lg border border-border bg-bg-elevated px-1 py-1 shadow-lg"
      role="toolbar"
    >
      <button
        type="button"
        onClick={() => apply(wrapBold)}
        className="rounded px-2 py-1 text-sm font-bold hover:bg-accent-muted/50"
        title="Bold"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => apply(wrapItalic)}
        className="rounded px-2 py-1 text-sm italic hover:bg-accent-muted/50"
        title="Italic"
      >
        I
      </button>
      <button
        type="button"
        onClick={() => apply(wrapCode)}
        className="rounded px-2 py-1 font-mono text-sm hover:bg-accent-muted/50"
        title="Code"
      >
        {"</>"}
      </button>
      <button
        type="button"
        onClick={() => apply(wrapLink)}
        className="rounded px-2 py-1 text-sm hover:bg-accent-muted/50"
        title="Link"
      >
        ⎘
      </button>
    </div>
  );
}
