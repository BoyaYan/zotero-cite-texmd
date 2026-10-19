# Zotero Cite for TeXMD

基于 Zotero Better BibTeX 的引用管理扩展，让 LaTeX / Markdown / BibTeX 文档中的引用管理无需离开编辑器。扩展通过 JSON-RPC 与 CAYW（Cite As You Write）接口与 Zotero 通信，一键完成引用插入、文献库同步与参考文献渲染。

## 功能特性

- **引用并更新文献**：弹出 Zotero 选择窗口，选中条目后自动插入引用键并同步参考文献。LaTeX 文档写入 `.bib`，Markdown 文档在末尾渲染国标（GB/T 7714）脚注。
- **导出 BibTeX**：扫描 LaTeX 文档中的引用键，批量导出 BibTeX 至 `.bib` 文件，适合初始化或补全缺失条目。
- **更新 BibTeX 条目**：从 Zotero 批量刷新 `.bib` 中的条目，保留注释与 `@string` / `@preamble` 等非条目内容。
- **状态栏快捷入口**：编辑 LaTeX / BibTeX / Markdown 文件时，状态栏显示 **Zotero** 按钮，按文件类型过滤可用命令。

## 前置条件

- 安装 [Zotero](https://www.zotero.org/)
- 安装 [Better BibTeX](https://retorque.re/zotero-better-bibtex/) 插件
- 启动 Zotero（Better BibTeX 的 JSON-RPC 与 CAYW 服务默认监听 `http://localhost:23119`）

## 使用说明

### 引用并更新文献

1. 打开 LaTeX 或 Markdown 文档
2. 按 `Ctrl+Shift+P` 选择 **Zotero Cite for TeXMD: 引用并更新文献**，或点击状态栏 **Zotero** 按钮
3. 在 Zotero 弹出的选择窗口中挑选文献条目
4. 引用键自动插入光标位置，参考文献同步更新：
   - **LaTeX**：插入 `\cite{key}`，对应条目追加至 `.bib` 文件
   - **Markdown**：插入 `[^key]` 脚注引用，文档末尾自动渲染国标（GB/T 7714）脚注定义
     （如 `[^key]: George EI, McCulloch RE. Approaches for Bayesian variable selection [J]. Stat. Sin., 1997, 7(2): 339-373.`）

### 导出 BibTeX

1. 打开含 `\cite{}` 引用键的 LaTeX 文档
2. 按 `Ctrl+Shift+P` 选择 **Zotero Cite for TeXMD: 导出 BibTeX**
3. 输入文件名（默认 `ref.bib`），确认生成
4. 生成的 `.bib` 文件自动在编辑器中打开

### 更新 BibTeX 条目

1. 打开 `.bib` 文件（或 LaTeX 文档）
2. 按 `Ctrl+Shift+P` 选择 **Zotero Cite for TeXMD: 更新 BibTeX 条目**
3. 全部条目从 Zotero 重新拉取并替换，注释与非条目内容保持不变

### 命令选择器

按 `Ctrl+Shift+P` 选择 **Zotero Cite for TeXMD: 选择命令**，或直接点击状态栏 **Zotero** 按钮，将根据当前文件类型过滤命令：

| 文件类型 | 可用命令 |
|----------|----------|
| LaTeX | 引用并更新文献、导出 BibTeX、更新 BibTeX 条目 |
| Markdown | 引用并更新文献 |
| BibTeX | 更新 BibTeX 条目 |

## 配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `zotero-cite-for-texmd.endpoint` | `http://localhost:23119/better-bibtex/json-rpc` | Better BibTeX JSON-RPC 接口地址 |
| `zotero-cite-for-texmd.caywUrl` | `http://localhost:23119/better-bibtex/cayw` | CAYW 选择窗口接口地址 |
| `zotero-cite-for-texmd.defaultBibName` | `ref.bib` | 导出引用文件默认文件名 |
| `zotero-cite-for-texmd.latexBibStyle` | `bibtex` | 导出的 LaTeX 引用格式（`bibtex` 或 `biblatex`） |

## 许可证

[MIT](./LICENSE)

## 发布流程

本扩展采用**手动上传**方式发布到 Visual Studio Marketplace，不使用 `vsce publish` 自动化流程。

### 打包

```powershell
npm run package   # 编译 + 生成 zotero-cite-texmd-X.Y.Z.vsix
```

生成文件位于项目根目录，文件名格式为 `zotero-cite-texmd-{version}.vsix`。

### 手动上传

1. 打开 [Visual Studio Marketplace 管理页面](https://marketplace.visualstudio.com/manage/publishers)
2. 选择目标 Publisher（`boyayan`）
3. 进入扩展页面，点击 **"Upload New Version"**
4. 拖入 `.vsix` 文件，填写变更日志，提交

### 版本管理

发布前手动递增 `package.json` 中的 `version` 字段（`major` / `minor` / `patch`）。