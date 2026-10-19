import * as vscode from "vscode";
import * as path from "path";
import { getActiveEditor, getDocumentCiteKeys } from "./editor";
import { exportBibtex, getConfig, pickCiteKeys } from "./zotero";
import { hideStatusBarItem, showStatusBarItem } from "./statusBar";
import {
  parseBibtex,
  appendBibliographyEntries,
  resolveBibPath,
  replaceBibEntries,
  toMarkdownFootnote,
} from "./bibtexStore";

/**
 * 导出 BibTeX：扫描当前文档的引用键，导出到 .bib 文件。
 */
export async function exportBib(): Promise<void> {
  try {
    const editor = getActiveEditor();
    // 仅 LaTeX 文档支持扫描引用键导出 BibTeX
    if (editor.document.languageId !== "latex") {
      vscode.window.showErrorMessage("此命令仅支持 LaTeX 文档，请在 .tex 文件中执行。");
      return;
    }
    if (editor.document.isUntitled) {
      vscode.window.showErrorMessage("请先保存当前文件再导出 BibTeX。");
      return;
    }
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("未打开工作区文件夹。");
      return;
    }

    const currentFileUri = editor.document.uri;
    const { defaultBibName } = getConfig();
    const bibName = await vscode.window.showInputBox({
      value: defaultBibName,
      prompt: "文件名：",
    });
    if (bibName === undefined) {
      return;
    }

    const bibPath = vscode.Uri.joinPath(currentFileUri, "..", bibName);
    if (!bibName.trim()) {
      vscode.window.showErrorMessage("文件名不能为空。");
      return;
    }
    const keys = getDocumentCiteKeys(editor);
    const uniqueKeys = Array.from(new Set(keys));
    if (uniqueKeys.length === 0) {
      vscode.window.showErrorMessage("未检测到引用键。");
      return;
    }

    const { bibtex: bibliography, missingKeys } = await exportBibtex(uniqueKeys);
    if (!bibliography.trim()) {
      vscode.window.showInformationMessage("所选引用键在 Zotero 中均未找到，未导出任何内容。");
      return;
    }
    await vscode.workspace.fs.writeFile(bibPath, Buffer.from(bibliography + "\n", "utf-8"));
    if (missingKeys.length > 0) {
      vscode.window.showWarningMessage(
        `导出成功，但有 ${missingKeys.length} 个条目在 Zotero 中未找到：${missingKeys.join(", ")}`
      );
    } else {
      vscode.window.showInformationMessage("导出成功。");
    }
    await vscode.window.showTextDocument(bibPath);
  } catch (error) {
    vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

/**
 * 引用并更新文献：插入引用键，同时更新 .bib 文件。
 */
export async function citeBibliography(): Promise<void> {
  try {
    const editor = getActiveEditor();
    if (editor.document.isUntitled) {
      vscode.window.showErrorMessage("请先保存当前标签页。");
      return;
    }

    const { defaultBibName } = getConfig();
    const bibPath = resolveBibPath(editor.document.uri, defaultBibName);

    // 选择引用键
    const citeKeys = await pickCiteKeys();
    if (citeKeys.length === 0) {
      return;
    }

    // 先导出 BibTeX 条目，成功后再插入引用，避免 Zotero 连接失败时引用残留
    const { bibtex: newEntries, missingKeys } = await exportBibtex(citeKeys);
    if (!newEntries.trim()) {
      vscode.window.showInformationMessage("所选引用键在 Zotero 中均未找到，未更新参考文献文件。");
      return;
    }

    // 仅 Markdown：在文档末尾渲染脚注定义，不操作任何 .bib 文件
    const isMarkdown = editor.document.languageId === "markdown";

    if (isMarkdown) {
      // 脚注去重：同一 citationKey 只保留一份定义
      const seen = new Set<string>();
      const footnotes = parseBibtex(newEntries)
        .filter((e) => {
          if (seen.has(e.citationKey)) return false;
          seen.add(e.citationKey);
          return true;
        })
        .map((e) => `[^${e.citationKey}]: ${toMarkdownFootnote(e)}`)
        .join("\n");
      insertCiteKeys(citeKeys, editor, footnotes);
    } else {
      // LaTeX：追加到 .bib 文件
      try {
        await appendBibliographyEntries(bibPath, newEntries);
      } catch (error) {
        vscode.window.showErrorMessage(
          `读取参考文献文件失败：${error instanceof Error ? error.message : String(error)}`
        );
        return;
      }
      // 导出和写入成功后再插入引用
      insertCiteKeys(citeKeys, editor);
    }

    // 提示消息：根据文件类型区分
    if (isMarkdown) {
      if (missingKeys.length > 0) {
        vscode.window.showWarningMessage(
          `引用已插入，但 ${missingKeys.length} 个条目在 Zotero 中未找到：${missingKeys.join(", ")}`
        );
      } else {
        vscode.window.showInformationMessage(`引用已插入，脚注已渲染到文档末尾。`);
      }
    } else {
      if (missingKeys.length > 0) {
        vscode.window.showWarningMessage(
          `参考文献已更新：向 ${path.basename(bibPath.fsPath)} 追加了 ${citeKeys.length} 条新记录，但有 ${missingKeys.length} 个条目在 Zotero 中未找到：${missingKeys.join(", ")}`
        );
      } else {
        vscode.window.showInformationMessage(
          `参考文献已更新：向 ${path.basename(bibPath.fsPath)} 追加了 ${citeKeys.length} 条新记录。`
        );
      }
    }
  } catch (error) {
    vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

/**
 * 更新 BibTeX 条目：从 Zotero 更新 .bib 文件的所有条目。
 * 焦点处理：当焦点是 .bib 文件时，直接更新当前打开的 .bib 文件；
 * 否则解析同目录下的默认 .bib 文件。
 * 执行期间隐藏状态栏按钮（避免鼠标悬停触发 tooltip），并显示进度。
 */
export async function updateBibEntries(): Promise<void> {
  // 执行期间隐藏状态栏按钮，避免悬停显示 tooltip
  hideStatusBarItem();
  try {
    const editor = getActiveEditor();
    const { defaultBibName } = getConfig();

    // 焦点处理：焦点是 .bib 文件时直接使用当前文件
    let bibPath: vscode.Uri;
    if (editor.document.languageId === "bibtex") {
      bibPath = editor.document.uri;
    } else {
      bibPath = resolveBibPath(editor.document.uri, defaultBibName);
    }

    // 读取整个文件文本（保留注释、@comment、@string、@preamble 等非条目内容）
    // 文件不存在时视为空文件（新文档首次更新场景）
    let fileText = "";
    try {
      const fileBytes = await vscode.workspace.fs.readFile(bibPath);
      fileText = Buffer.from(fileBytes).toString("utf-8");
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") {
        throw error;
      }
    }
    const parsedData = parseBibtex(fileText);
    const total = parsedData.length;
    if (total === 0) {
      vscode.window.showInformationMessage("未在 .bib 文件中检测到任何条目。");
      return;
    }

    const allKeys = parsedData.map((e) => e.citationKey);

    // 批量导出（1-2 次请求替代逐条 N 次请求）
    const { bibtex, missingKeys } = await exportBibtex(allKeys);

    // 解析导出的条目，建立 引用键 -> 新条目文本 映射
    const replacements = new Map<string, string>();
    for (const entry of parseBibtex(bibtex)) {
      replacements.set(entry.citationKey, entry.raw);
    }

    const updatedCount = replacements.size;
    if (updatedCount > 0) {
      // 按引用键替换条目，保留注释等非条目内容
      const newText = replaceBibEntries(fileText, replacements);
      await vscode.workspace.fs.writeFile(bibPath, Buffer.from(newText, "utf-8"));
    }

    if (missingKeys.length > 0) {
      vscode.window.showInformationMessage(
        `有 ${missingKeys.length} 条 bib 记录未在 Zotero 中找到：${missingKeys.join(", ")}`
      );
    }

    vscode.window.showInformationMessage(`已成功更新 ${updatedCount}/${total} 条 bib 记录。`);
  } catch (error) {
    vscode.window.showErrorMessage(
      `更新 BibTeX 文件失败：${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    // 命令执行完毕，恢复状态栏按钮显示
    showStatusBarItem();
  }
}

/**
 * 在文档中插入引用键。
 * @param citeKeys 引用键数组
 * @param editor 当前编辑器
 * @param footnotes 可选的脚注定义文本（Markdown 时传入，追加到文档末尾）
 */
function insertCiteKeys(citeKeys: string[], editor: vscode.TextEditor, footnotes?: string): void {
  const languageId = editor.document.languageId;
  let text: string;
  if (languageId === "markdown") {
    text = citeKeys.map((k) => `[^${k}]`).join("");
  } else {
    text = `\\cite{${citeKeys.join(",")}}`;
  }
  editor.edit((editBuilder) => {
    editBuilder.insert(editor.selection.active, text);
    // Markdown：在文档末尾追加脚注定义
    if (footnotes) {
      const documentText = editor.document.getText();
      // 精确匹配文档中已有的脚注定义行（行首 [^key]: ），避免重复追加
      const newFootnotes = footnotes
        .split("\n")
        .filter((line) => {
          const trimmed = line.trim();
          if (!trimmed) return true;
          // 检查该脚注定义行是否已存在于文档中（行首精确匹配）
          const keyMatch = trimmed.match(/^\[\^([^\]]+)\]:/);
          if (keyMatch) {
            const key = keyMatch[1];
            const exists = new RegExp(`^\\[\\^${key}\\]:`, "m").test(documentText);
            return !exists;
          }
          return true;
        });
      const filtered = newFootnotes.join("\n");
      if (filtered) {
        const end = editor.document.lineAt(editor.document.lineCount - 1).range.end;
        const prefix = documentText.trimEnd() ? "\n\n" : "";
        editBuilder.insert(end, `${prefix}${filtered}\n`);
      }
    }
  });
}

/**
 * 状态栏命令选择器：弹出可用命令列表供用户选择。
 */
interface CommandQuickPickItem extends vscode.QuickPickItem {
  commandId: string;
}

export async function showTaskPicker(): Promise<void> {
  try {
    const editor = getActiveEditor();
    const languageId = editor.document.languageId;

    // 根据当前文件格式显示对应的命令
    const items: CommandQuickPickItem[] = [];

    // LaTeX / Markdown 文件：支持引用并更新文献
    if (languageId === "latex" || languageId === "markdown") {
      items.push({
        label: "$(zap) 引用并更新文献",
        description: "弹出 Zotero 选择窗口，插入引用并更新参考文献",
        commandId: "zotero-cite-texmd.citeBibliography",
      });
    }

    // 仅 LaTeX 文件：支持导出 .bib
    if (languageId === "latex") {
      items.push({
        label: "$(file-code) 导出 BibTeX",
        description: "扫描当前 LaTeX 文档引用键，导出 BibTeX 到 .bib 文件",
        commandId: "zotero-cite-texmd.exportBib",
      });
    }

    // 仅 BibTeX / LaTeX 文件：支持更新条目（Markdown 不操作 .bib）
    if (languageId === "bibtex" || languageId === "latex") {
      items.push({
        label: "$(refresh) 更新 BibTeX 条目",
        description: "从 Zotero 更新 .bib 文件的所有条目",
        commandId: "zotero-cite-texmd.updateBibtexEntries",
      });
    }

    if (items.length === 0) {
      vscode.window.showInformationMessage(
        `当前文件类型（${languageId}）不支持 Zotero Cite for TeXMD 命令。请在 LaTeX、Markdown 或 BibTeX 文件中使用。`
      );
      return;
    }

    const picked = await vscode.window.showQuickPick(items, {
      title: "Zotero Cite for TeXMD",
      placeHolder: "选择要执行的命令",
      matchOnDescription: true,
    });

    if (!picked) {
      return;
    }
    await vscode.commands.executeCommand(picked.commandId);
  } catch (error) {
    vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}