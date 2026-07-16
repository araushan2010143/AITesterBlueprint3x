"use client";
/**
 * Lazy-loaded Monaco editor — SSR-safe dynamic import.
 * Use <MonacoEditor> anywhere in client components.
 */
import dynamic from "next/dynamic";
import type { EditorProps } from "@monaco-editor/react";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface MonacoEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  height?: string | number;
}

export default function MonacoEditor({
  value,
  onChange,
  language = "typescript",
  readOnly = false,
  height = "420px",
}: MonacoEditorProps) {
  const options: EditorProps["options"] = {
    readOnly,
    minimap: { enabled: false },
    fontSize: 12,
    lineHeight: 20,
    tabSize: 2,
    wordWrap: "on",
    scrollBeyondLastLine: false,
    renderLineHighlight: "line",
    smoothScrolling: true,
    cursorBlinking: "smooth",
    padding: { top: 12, bottom: 12 },
    overviewRulerLanes: 0,
  };

  return (
    <Editor
      height={height}
      language={language}
      value={value}
      theme="vs-dark"
      options={options}
      onChange={v => onChange?.(v ?? "")}
      loading={
        <div style={{
          height, display: "flex", alignItems: "center", justifyContent: "center",
          background: "#1e1e1e", color: "#6B7280", fontSize: 12, fontFamily: "monospace",
        }}>
          Loading editor...
        </div>
      }
    />
  );
}
