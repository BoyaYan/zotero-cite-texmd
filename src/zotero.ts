import * as vscode from "vscode";
import axios from "axios";

/**
 * Zotero Better BibTeX JSON-RPC 通信模块。
 * 通过 HTTP POST 调用 Better BibTeX 的 JSON-RPC 接口。
 */

export interface ZoteroConfig {
  endpoint: string;
  caywUrl: string;
  latexBibStyle: string;
  defaultBibName: string;
}

export function getConfig(): ZoteroConfig {
  const cfg = vscode.workspace.getConfiguration("zotero-cite-texmd");
  return {
    endpoint: cfg.get<string>("endpoint", "http://localhost:23119/better-bibtex/json-rpc"),
    caywUrl: cfg.get<string>("caywUrl", "http://localhost:23119/better-bibtex/cayw"),
    latexBibStyle: cfg.get<string>("latexBibStyle", "bibtex"),
    defaultBibName: cfg.get<string>("defaultBibName", "ref.bib"),
  };
}

/**
 * 提取 axios 错误的具体原因（连接拒绝、超时、HTTP 状态码等）。
 */
function describeAxiosError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNREFUSED") {
      return `连接被拒绝（ECONNREFUSED），请确认 Zotero 已启动且 Better BibTeX 插件已安装`;
    }
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return `请求超时（${error.message}），Zotero 可能无响应`;
    }
    if (error.response) {
      return `HTTP ${error.response.status} 错误：${error.response.statusText || "请求失败"}`;
    }
    if (error.message) {
      return `网络错误（${error.code || "未知"}）：${error.message}`;
    }
    return "未知网络错误";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * 调用 Better BibTeX JSON-RPC 方法。
 * @param method 方法名，如 "item.export"
 * @param params 参数数组
 */
export async function postJsonRpc(method: string, params: unknown[]): Promise<unknown> {
  const { endpoint } = getConfig();
  let response;
  try {
    response = await axios.post(endpoint, {
      jsonrpc: "2.0",
      method,
      params,
      id: Date.now(),
    }, {
      timeout: 10000, // 10 秒超时，避免 Zotero 卡住时请求挂起
    });
  } catch (error) {
    throw new Error(`JSON-RPC 请求失败（${endpoint}）：${describeAxiosError(error)}`);
  }
  const data = response.data;
  if (data && data.error) {
    throw new Error(`JSON-RPC 服务端错误（method: ${method}）：${data.error.message || JSON.stringify(data.error)}`);
  }
  return data ? data.result : undefined;
}

/**
 * 轻量检测 Zotero 连接状态：向 JSON-RPC 端点发一个最小请求。
 * 判断依据是端点是否可达（收到任何 HTTP 响应即视为已连接），
 * 而非业务结果（条目未找到等业务错误不代表未连接）。
 * @returns 是否成功建立连接
 */
export async function checkConnection(): Promise<boolean> {
  const { endpoint } = getConfig();
  try {
    // 直接发 JSON-RPC 请求（不走 postJsonRpc，避免它把服务端业务错误当异常抛出），
    // 只要收到任何 HTTP 响应就认为端点可达、连接正常。
    // 用不存在的键做探测：BBT 会返回 JSON-RPC 错误响应（not found），但这恰恰说明端点是通的。
    const response = await axios.post(
      endpoint,
      {
        jsonrpc: "2.0",
        method: "item.export",
        params: ["__zotero_cite_ping__", "bibtex"],
        id: 0,
      },
      {
        timeout: 10000,
        validateStatus: () => true, // 任何 HTTP 状态码都视为"端点有响应"
      }
    );
    // 收到响应（含 200/4xx/5xx）都说明网络层可达
    return true;
  } catch (error) {
    // 网络层失败（连接拒绝/超时/DNS 解析失败）才视为未连接
    return false;
  }
}

/**
 * 导出结果：BibTeX 文本 + 缺失（未找到）的引用键。
 */
export interface ExportResult {
  bibtex: string;
  missingKeys: string[];
}

/**
 * 导出指定引用键的 BibTeX 文本。
 * 使用两参数形式（不带 groupId），可跨所有分组文库导出。
 * 当部分键在 Zotero 中找不到时，自动跳过这些键，并在 missingKeys 中报告。
 * @param keys 引用键数组
 * @returns 导出结果，包含 BibTeX 文本和缺失的引用键
 */
export async function exportBibtex(keys: string[]): Promise<ExportResult> {
  const { latexBibStyle } = getConfig();
  const missingKeys: string[] = [];
  let remaining = keys;
  let bibtex = "";

  // 循环替代递归：BBT 每次报告所有 not found 键，最多迭代 2 次
  while (remaining.length > 0) {
    try {
      const result = await postJsonRpc("item.export", [remaining, latexBibStyle]);
      bibtex += String(result || "");
      break;
    } catch (error) {
      // BBT 在部分键找不到时返回 "not found: key1, key2" 错误
      const message = error instanceof Error ? error.message : String(error);
      const notFoundMatch = message.match(/not found:\s*(.+)/i);
      if (!notFoundMatch) {
        throw error;
      }
      const notFoundKeys = notFoundMatch[1]
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      missingKeys.push(...notFoundKeys);
      const notFoundSet = new Set(notFoundKeys);
      remaining = remaining.filter((k) => !notFoundSet.has(k));
    }
  }
  return { bibtex, missingKeys };
}

/**
 * 从 Zotero 获取单个引用键的 BibTeX 条目。
 * @param citeKey 引用键
 * @returns BibTeX 文本，未找到时返回 null
 */
export async function getBibtexFromZotero(citeKey: string): Promise<string | null> {
  try {
    const { latexBibStyle } = getConfig();
    const result = await postJsonRpc("item.export", [[citeKey], latexBibStyle]);
    return result ? String(result) : null;
  } catch (error) {
    // 未找到或不可达的条目由调用方处理
    return null;
  }
}

/**
 * 通过 CAYW (Cite As You Write) 接口弹出 Zotero 选择窗口。
 * 用户在 Zotero 弹出的窗口中选择条目后，返回 @citeKey 格式的引用键。
 * @returns 选中的引用键数组
 */
export async function pickCiteKeys(): Promise<string[]> {
  const { caywUrl } = getConfig();

  let response;
  try {
    // 参考原插件：使用 GET 请求，通过 params 传递参数
    response = await axios.get(caywUrl, {
      params: {
        format: "pandoc",
        brackets: "1",
        minimize: "1",
      },
    });
  } catch (error) {
    throw new Error(
      `无法连接 Zotero CAYW 接口（${caywUrl}）。请确认 Zotero 和 Better BibTeX 插件已启动。${describeAxiosError(error)}`
    );
  }

  const citeKeys: string[] = [];
  const pattern = /@([\w-:\d]+)/g;
  const dataText = String(response.data ?? "");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(dataText)) !== null) {
    citeKeys.push(match[1]);
  }

  if (citeKeys.length === 0) {
    throw new Error("未在 Zotero 中选择任何条目。");
  }
  return citeKeys;
}