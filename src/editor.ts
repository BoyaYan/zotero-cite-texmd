import * as vscode from "vscode";

/**
 * 从当前文档中提取所有引用键。
 * 支持 LaTeX 的 \cite{key1,key2} 和 Markdown 的 [^key]。
 */
export function getDocumentCiteKeys(editor: vscode.TextEditor): string[] {
  const text = editor.document.getText();
  const keys: string[] = [];

  // LaTeX: \cite{key1,key2} 或 \cite[opt]{key}
  const latexRegex = /\\cite(?:\[[^\]]*\])?\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = latexRegex.exec(text)) !== null) {
    const inner = m[1];
    inner.split(",").forEach((k) => {
      const key = k.trim();
      if (key) {
        keys.push(key);
      }
    });
  }

  // Markdown footnote: [^key]
  const footnoteRegex = /\[\^([^\]]+)\]/g;
  while ((m = footnoteRegex.exec(text)) !== null) {
    keys.push(m[1].trim());
  }

  return keys;
}

/**
 * 获取当前活动编辑器。
 */
export function getActiveEditor(): vscode.TextEditor {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error("未找到当前活动编辑器。");
  }
  return editor;
}