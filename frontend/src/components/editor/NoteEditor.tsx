import { useCallback, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { useThemeStore } from "../../store/themeStore";
import { MarkdownToolbar } from "./MarkdownToolbar";

interface NoteEditorProps {
  content: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function NoteEditor({ content, onChange, readOnly }: NoteEditorProps) {
  const isDark = useThemeStore((s) => s.isDark);
  const viewRef = useRef<EditorView | null>(null);
  const [selection, setSelection] = useState<{ from: number; to: number } | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      onChange(value);
    },
    [onChange]
  );

  const handleUpdate = useCallback((update: { state: { selection: { main: { from: number; to: number; empty: boolean } } } }) => {
    const main = update.state.selection.main;
    if (!main.empty && viewRef.current) {
      setSelection({ from: main.from, to: main.to });
    } else {
      setSelection(null);
    }
  }, []);

  const handleCreateEditor = useCallback((view: EditorView) => {
    viewRef.current = view;
  }, []);

  const extensions = useMemo(
    () => [markdown(), EditorView.lineWrapping],
    []
  );

  const toolbarRect = selection && viewRef.current
    ? viewRef.current.coordsAtPos(selection.from)
    : null;

  return (
    <div className="note-editor relative h-full [&_.cm-editor]:border-0 [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-sm [&_.cm-editor]:rounded-none">
      <CodeMirror
        value={content}
        height="100%"
        theme={isDark ? "dark" : "light"}
        extensions={extensions}
        onChange={handleChange}
        onUpdate={handleUpdate}
        onCreateEditor={handleCreateEditor}
        readOnly={readOnly}
      />
      {!readOnly && selection && viewRef.current && toolbarRect && (
        <div
          className="fixed z-50"
          style={{
            left: toolbarRect.left,
            top: toolbarRect.top - 40,
          }}
        >
          <MarkdownToolbar
            view={viewRef.current}
            from={selection.from}
            to={selection.to}
            onClose={() => setSelection(null)}
          />
        </div>
      )}
    </div>
  );
}
