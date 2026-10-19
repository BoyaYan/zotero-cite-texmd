import * as vscode from "vscode";
import { createStatusBarItem, setConnectionStatus } from "./statusBar";

/**
 * 扩展激活入口。
 */
export function activate(context: vscode.ExtensionContext): void {
  // 延迟加载命令模块：axios 等重依赖只在首次执行命令时加载，加快插件激活速度
  let commandsPromise: Promise<typeof import("./commands")> | undefined;
  const loadCommands = (): Promise<typeof import("./commands")> =>
    (commandsPromise ??= import("./commands"));

  // 注册命令（激活时只做轻量注册，不加载重依赖）
  context.subscriptions.push(
    vscode.commands.registerCommand("zotero-cite-texmd.exportBib", async () => {
      const { exportBib } = await loadCommands();
      return exportBib();
    }),
    vscode.commands.registerCommand("zotero-cite-texmd.citeBibliography", async () => {
      const { citeBibliography } = await loadCommands();
      return citeBibliography();
    }),
    vscode.commands.registerCommand("zotero-cite-texmd.updateBibtexEntries", async () => {
      const { updateBibEntries } = await loadCommands();
      return updateBibEntries();
    }),
    vscode.commands.registerCommand("zotero-cite-texmd.showTaskPicker", async () => {
      const { showTaskPicker } = await loadCommands();
      return showTaskPicker();
    })
  );

  // 创建状态栏按钮（高优先级，放在右边状态栏最左边）
  const statusBarItem = createStatusBarItem();

  // 根据焦点文件类型显示按钮：LaTeX、Markdown 和 BibTeX 文件显示
  const updateStatusBar = (): void => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const languageId = editor.document.languageId;
      if (languageId === "latex" || languageId === "markdown" || languageId === "bibtex") {
        statusBarItem.show();
        return;
      }
    }
    statusBarItem.hide();
  };

  updateStatusBar();
  context.subscriptions.push(
    statusBarItem,
    vscode.window.onDidChangeActiveTextEditor(updateStatusBar)
  );

  // 后台检测 Zotero 连接状态，更新状态栏指示
  const checkConnection = async (): Promise<void> => {
    try {
      const { checkConnection: ping } = await import("./zotero");
      const connected = await ping();
      setConnectionStatus(connected ? "connected" : "disconnected");
    } catch {
      setConnectionStatus("disconnected");
    }
  };
  void checkConnection();
}

/**
 * 扩展停用入口。
 */
export function deactivate(): void {
  // 无需清理
}