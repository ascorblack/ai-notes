import { useCallback, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { useThemeStore } from "../../store/themeStore";

interface NoteEditorProps {
  content: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function NoteEditor({ content, onChange, readOnly }: NoteEditorProps) {
  const isDark = useThemeStore((s) => s.isDark);

  const handleChange = useCallback(
    (value: string) => {
      onChange(value);
    },
    [onChange]
  );

  const extensions = useMemo(
    () => [markdown(), EditorView.lineWrapping],
    []
  );

  return (
    <div className="note-editor h-full [&_.cm-editor]:border-0 [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-sm [&_.cm-editor]:rounded-none">
      <CodeMirror
        value={content}
        height="100%"
        theme={isDark ? "dark" : "light"}
        extensions={extensions}
        onChange={handleChange}
        readOnly={readOnly}
      />
    </div>
  );
}
