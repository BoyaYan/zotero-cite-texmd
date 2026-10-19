import * as vscode from "vscode";

/**
 * 状态栏按钮管理模块。
 * 独立于 extension.ts，供 commands.ts 在执行耗时命令时隐藏/显示按钮，
 * 避免鼠标悬停触发 tooltip。支持根据 Zotero 连接状态更新 tooltip。
 */

let statusBarItem: vscode.StatusBarItem | undefined;
let connectionStatus: "unknown" | "connected" | "disconnected" = "unknown";

/**
 * 创建状态栏按钮（高优先级，放在右边状态栏最左边）。
 * VS Code 规则：优先级数值越大越靠左。
 */
export function createStatusBarItem(): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1100);
  statusBarItem.text = "$(zotero) Zotero";
  statusBarItem.tooltip = "Zotero Cite for TeXMD：点击选择命令";
  statusBarItem.command = "zotero-cite-texmd.showTaskPicker";
  return statusBarItem;
}

/**
 * 更新 Zotero 连接状态，同步刷新 tooltip 和按钮文本。
 * @param status 连接状态
 */
export function setConnectionStatus(status: "connected" | "disconnected"): void {
  connectionStatus = status;
  if (!statusBarItem) return;
  if (status === "connected") {
    statusBarItem.text = "$(zotero) Zotero";
    statusBarItem.tooltip = "Zotero Cite for TeXMD：已连接 Better BibTeX，点击选择命令";
  } else {
    statusBarItem.text = "$(zotero) Zotero ⚠";
    statusBarItem.tooltip = "Zotero Cite for TeXMD：未连接 Better BibTeX，请确认 Zotero 已启动";
  }
}

/** 返回当前连接状态。 */
export function getConnectionStatus(): "unknown" | "connected" | "disconnected" {
  return connectionStatus;
}

/**
 * 隐藏状态栏按钮（耗时命令执行期间调用，避免悬停显示 tooltip）。
 */
export function hideStatusBarItem(): void {
  statusBarItem?.hide();
}

/**
 * 显示状态栏按钮（耗时命令执行完毕后调用）。
 */
export function showStatusBarItem(): void {
  statusBarItem?.show();
}