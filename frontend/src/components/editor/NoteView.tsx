import { useRef, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const TASK_LINE_RE = /^\s*[-*]\s+\[([ xX])\]\s*/;

function getTaskListLineIndices(content: string): number[] {
  const lines = content.split("\n");
  const indices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (TASK_LINE_RE.test(lines[i])) indices.push(i);
  }
  return indices;
}

function toggleTaskLine(content: string, lineIndex: number): string {
  const lines = content.split("\n");
  const line = lines[lineIndex];
  if (line == null) return content;
  if (/\[ \]/.test(line)) {
    lines[lineIndex] = line.replace(/\[ \]/, "[x]");
  } else if (/\[[xX]\]/.test(line)) {
    lines[lineIndex] = line.replace(/\[[xX]\]/, "[ ]");
  }
  return lines.join("\n");
}

interface NoteViewProps {
  content: string;
  /** When set, checkboxes become interactive and updates are persisted via this callback. */
  onCheckboxToggle?: (newContent: string) => void;
}

export function NoteView({ content, onCheckboxToggle }: NoteViewProps) {
  const taskLineIndices = useMemo(
    () => getTaskListLineIndices(content),
    [content]
  );
  const checkboxIndexRef = useRef(0);

  const components = useMemo(() => {
    if (onCheckboxToggle == null) return undefined;

    return {
      input: ({
        node,
        disabled,
        ...props
      }: React.ComponentProps<"input"> & { node?: unknown }) => {
        if (props.type !== "checkbox") {
          return <input {...props} disabled />;
        }
        const index = checkboxIndexRef.current++;
        const lineIndex = taskLineIndices[index];
        const isChecked = Boolean(props.checked);

        const handleChange = useCallback(() => {
          if (lineIndex == null) return;
          const nextContent = toggleTaskLine(content, lineIndex);
          onCheckboxToggle(nextContent);
        }, [content, lineIndex, onCheckboxToggle]);

        return (
          <input
            {...props}
            type="checkbox"
            checked={isChecked}
            onChange={handleChange}
            className="cursor-pointer accent-accent"
            readOnly={false}
          />
        );
      },
    };
  }, [content, onCheckboxToggle, taskLineIndices]);

  // Reset counter before each render so checkbox indices stay correct
  checkboxIndexRef.current = 0;

  return (
    <motion.div
      className="prose dark:prose-invert prose-headings:text-text-primary prose-p:text-text-primary prose-li:text-text-primary prose-a:text-accent hover:prose-a:opacity-80 prose-code:text-accent prose-pre:bg-surface prose-pre:rounded-xl prose-pre:border prose-pre:border-border/40 max-w-none text-sm leading-relaxed p-3 sm:p-6 overflow-x-auto [&_input[type=checkbox]:mr-2]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {content || "*No content*"}
      </ReactMarkdown>
    </motion.div>
  );
}
