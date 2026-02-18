import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface NoteViewProps {
  content: string;
}

export function NoteView({ content }: NoteViewProps) {
  return (
    <motion.div
      className="prose dark:prose-invert prose-headings:text-text-primary prose-p:text-text-primary prose-li:text-text-primary prose-a:text-accent hover:prose-a:opacity-80 prose-code:text-accent prose-pre:bg-surface prose-pre:rounded-xl prose-pre:border prose-pre:border-border/40 max-w-none text-sm leading-relaxed p-3 sm:p-6 overflow-x-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content || "*No content*"}
      </ReactMarkdown>
    </motion.div>
  );
}
