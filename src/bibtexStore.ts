import * as vscode from "vscode";
import * as path from "path";

/**
 * BibTeX 文件读写模块。
 */

export interface BibEntry {
  citationKey: string;
  raw: string;
}

/**
 * 从 BibTeX 条目中提取字段值。
 * @param raw 原始 BibTeX 条目文本
 * @param field 字段名（如 title、author、year）
 * @returns 字段值，未找到时返回空字符串
 */
export function getBibField(raw: string, field: string): string {
  // 支持三种写法：
  //   year = {1997} / year = "1997" / year = 1997（裸值）
  const regex = new RegExp(`\\b${field}\\s*=\\s*(?:[{"']([^"'}]*)[}"']|([^,\\n]*))`, "i");
  const m = regex.exec(raw);
  if (!m) return "";
  const value = m[1] !== undefined ? m[1] : m[2];
  return value !== undefined ? value.trim() : "";
}

/**
 * 从 BibTeX 条目中提取文献类型（@ 后的类型，如 article、book、inproceedings）。
 * @param entry BibTeX 条目
 * @returns 文献类型（小写），无法识别时返回空字符串
 */
export function getBibEntryType(entry: BibEntry): string {
  const m = /^@\w+/.exec(entry.raw);
  if (!m || !m[0]) return "";
  return m[0].slice(1).toLowerCase();
}

/** 国标 GB/T 7714 文献类型标识。 */
const GB_ENTRY_TYPE_MARK: Record<string, string> = {
  article: "J",
  book: "M",
  incollection: "M",
  inbook: "M",
  inproceedings: "C",
  proceedings: "C",
  conference: "C",
  mastersthesis: "D",
  phdthesis: "D",
  thesis: "D",
  patent: "P",
  report: "R",
  misc: "Z",
};

/**
 * 从 author 字段解析作者列表。
 * 支持 "Last, First and Last, First" 与 "First Last" 两种写法，
 * 并去除花括号（如 {El-Laham}）。
 * @param authorRaw author 字段原始文本
 * @returns 作者姓名数组
 */
function parseAuthors(authorRaw: string): string[] {
  const cleaned = authorRaw.replace(/[{}]/g, "").trim();
  return cleaned
    .split(" and ")
    .map((a) => a.trim())
    .filter(Boolean);
}

/**
 * 将作者姓名转换为国标著录格式（姓在前、名缩写，如 "George EI"）。
 * @param name 原始姓名（"Last, First" 或 "First Last"）
 */
function authorToGbName(name: string): string {
  const parts = name.split(",");
  let last: string;
  let first: string;
  if (parts.length >= 2) {
    last = parts[0].trim();
    first = parts.slice(1).join(" ").trim();
  } else {
    const tokens = name.trim().split(/\s+/);
    if (tokens.length === 1) {
      last = tokens[0];
      first = "";
    } else {
      first = tokens.slice(0, -1).join(" ");
      last = tokens[tokens.length - 1];
    }
  }
  const initial = first
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("");
  return `${last}${initial ? " " + initial : ""}`.trim();
}

/** 作者列表国标著录：>3 人取前 3 人 + "等"。 */
function formatGbAuthors(authorRaw: string): string {
  const names = parseAuthors(authorRaw).map(authorToGbName);
  if (names.length === 0) return "";
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${shown}, 等` : shown;
}

/**
 * 从 BibTeX 条目生成符合国标 GB/T 7714 的脚注文本。
 * 期刊示例：George EI, McCulloch RE. Approaches for Bayesian variable selection [J]. Stat. Sin., 1997, 7(2): 339-373.
 * 专著示例：Peyr{\'e} G, Cuturi M. Computational optimal transport... [M]. 出版地: 出版社, 2019.
 * @param entry BibTeX 条目
 * @returns 脚注定义文本（不含 [^key]: 前缀）
 */
export function toMarkdownFootnote(entry: BibEntry): string {
  const type = getBibEntryType(entry);
  const authors = formatGbAuthors(getBibField(entry.raw, "author"));
  const title = getBibField(entry.raw, "title").replace(/[{}]/g, "");
  const year = getBibField(entry.raw, "year");
  const mark = "[" + (GB_ENTRY_TYPE_MARK[type] ?? "J") + "]";

  const parts: string[] = [];
  if (authors) parts.push(authors);
  if (title) parts.push(`${title} ${mark}`);

  // 期刊 / 会议（有 volume/journal）
  const journal = getBibField(entry.raw, "journal") || getBibField(entry.raw, "booktitle");
  if (journal) {
    const vol = getBibField(entry.raw, "volume");
    const num = getBibField(entry.raw, "number");
    const pages = getBibField(entry.raw, "pages").replace(/--/g, "-");
    const loc = [journal.replace(/[{}]/g, ""), year].filter(Boolean).join(", ");
    let detail = [vol, num ? `(${num})` : ""].filter(Boolean).join("");
    if (pages) detail += detail ? `: ${pages}` : pages;
    parts.push(loc + (detail ? ", " + detail : ""));
  } else {
    // 专著 / 报告 / 其他：出版地: 出版社, 年
    const publisher = getBibField(entry.raw, "publisher");
    const detail = [publisher, year].filter(Boolean).join(", ");
    if (detail) parts.push(detail);
  }

  return parts.join(". ") + ".";
}

/**
 * 解析 BibTeX 文件，返回所有条目。
 * 自动处理文件末尾无换行符的情况。
 */
export function parseBibtex(text: string): BibEntry[] {
  const entries: BibEntry[] = [];
  // 末尾补换行，确保最后一个条目（无结尾换行）也能匹配 \n}
  const normalized = text.endsWith("\n") ? text : text + "\n";
  const regex = /@(\w+)\s*\{([^,]+),([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(normalized)) !== null) {
    const citationKey = m[2].trim();
    entries.push({ citationKey, raw: m[0] });
  }
  return entries;
}

/**
 * 按引用键替换 .bib 文本中的条目，保留注释、@comment、@string、@preamble 等非条目内容。
 * @param text 原始 .bib 文本
 * @param replacements 引用键 -> 新条目文本 的映射
 * @returns 替换后的完整文本
 */
export function replaceBibEntries(text: string, replacements: Map<string, string>): string {
  const normalized = text.endsWith("\n") ? text : text + "\n";
  const regex = /@(\w+)\s*\{([^,]+),([\s\S]*?)\n\}/g;
  let result = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(normalized)) !== null) {
    // 保留条目之前的非条目内容（注释、@comment、@string、@preamble 等）
    result += normalized.slice(lastIndex, m.index);
    const key = m[2].trim();
    const replacement = replacements.get(key);
    result += replacement !== undefined ? replacement : m[0];
    lastIndex = regex.lastIndex;
  }
  // 保留末尾内容
  result += normalized.slice(lastIndex);
  return result;
}

/**
 * 追加条目到 .bib 文件。文件不存在时自动创建。
 */
export async function appendBibliographyEntries(bibPath: vscode.Uri, newEntries: string): Promise<void> {
  let existingText = "";
  let fileExists = false;
  try {
    const existing = await vscode.workspace.fs.readFile(bibPath);
    existingText = Buffer.from(existing).toString("utf-8");
    fileExists = true;
  } catch {
    // 文件不存在时创建，其他错误也视为不存在（保守处理）
  }
  const content = (fileExists ? existingText.trimEnd() + "\n\n" : "") + newEntries.trim() + "\n";
  await vscode.workspace.fs.writeFile(bibPath, Buffer.from(content, "utf-8"));
}

/**
 * 解析 .bib 文件路径。
 */
export function resolveBibPath(documentUri: vscode.Uri, bibName: string): vscode.Uri {
  return vscode.Uri.joinPath(documentUri, "..", bibName);
}