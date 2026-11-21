# Phase 0：MathLive 技术验证

## v0.3 Formula Packs 实测补充

外部 JSON 可直接交给原 SnippetRegistry/PlaceholderManager。2×2、3×3 pmatrix、vmatrix 行列式、array 分块以及 cases 方程组的独立 Prompt 和声明顺序 Tab 已由真实浏览器验证；全部 27 条示例另逐条检查公开 errors、完整默认值选择与替换、Prompt 清理及导出。

初始 Phase 0 只验证编辑/导航，未拦截 hline 解析错误；强化 errors 断言后确认当前版本报告 unknown-command。因此交付改为竖向分隔，另有负向测试明确记录 hline 不支持，没有把“能显示并编辑”当作全部语法受支持的证明。

新增发现：控制词与 Prompt 相邻时，去掉 Prompt 不能机械拼接字符串，lVert 与字母 A 会形成错误命令。joinLatex 现用于槽位默认值展开及 Prompt 解除，保留必要的 TeX 分隔，范数包裹和双向控制词边界均有测试。

独立测试区复用 MathEditor，使用公开 mount 事件后设置菜单和插入模板。模板运行不依赖内部 Model/Atom/Shadow DOM。原生文件对话框使用 tauri-plugin-dialog 的 Rust API，文件读写由受限命令完成，不启用前端通用 FS 权限。

验证环境为本项目实际安装的 **MathLive 0.110.0**，类型定义位于 `node_modules/mathlive/types/`。不能把在线文档里的示例直接等同于当前版本行为；本项目使用真实 MathLive 浏览器实例验证并保留探测报告。

| 能力 | 采用的公开 API | 证据 |
| --- | --- | --- |
| 带默认值的结构插入 | `insert()`、`selectionMode` | `phase0.spec.ts` 与编辑器 UI 用例 |
| 独立命名参数 | `\placeholder[id]{value}`、`getPrompts()` | `reports/mathlive-probe.json` |
| 整体选中和替换默认值 | `getPromptRange()`、`selection.ranges` | 探测中 `k+t → n`，UI 测试 C/D |
| Tab 导航 | 由应用会话栈选择下一个 Prompt Range | UI 测试 C/D 与 J |
| Enter 提前完成 | 应用键盘状态分发，展开当前 Prompt 内容 | UI 测试 B，确认未提交整式 |
| 包裹显式选区 | `insert()` 中的 `#0`；产品层使用声明式包裹参数 | Phase 0 单独验证 `\sqrt{#0}`；产品测试 E/F/G |
| 分子、分母、指数和根号定位 | `position`、`getElementInfo()`、`getValue(range)` | 探测偏移表与 UI 导航测试 |
| 数学导航 | `executeCommand()` 普通导航与公开偏移 | 产品保留普通箭头；Ctrl 路由独立实现 |
| LaTeX 导入/导出 | `setValue()`、`getValue('latex-expanded')` | Phase 0 与输出模式测试 |
| 事件拦截 | `input`、`selection-change`、DOM capture 阶段 `keydown`、composition 事件 | 持续输入、优先级、IME 事件测试 |

已核对的实际类型签名包括 `getPromptRange(id): Range | null`、`selection: Selection`、`position: Offset`、`getElementInfo(offset): ElementInfo | undefined`。Selection 以 `{ ranges: [[start,end]] }` 形式写入。未使用已移除的 `math-json` 输出格式、旧 `setOptions()` 接口或 MathLive 私有 Model。

## 必要的应用适配

- **结构树**：MathLive 公开 ElementInfo 提供节点深度及 LaTeX。实际探测显示偏移按后序排列，空节点标记编辑分支起点。只读适配层保留分子/分母/指数等分支，组合底数与后置上下标，合并数字，识别普通括号节点。隐式乘法仅用于操作范围分组，不改写输入。
- **会话栈**：MathLive 的 Prompt 提供可靠内容锚点，但产品需要的“Enter 结束当前模板、嵌套后回到父参数”由独立栈完成。
- **导出**：公开 LaTeX 输出会保留 Prompt 标记。导出器按 TeX 命令与嵌套组递归展开它们，避免正则截断嵌套公式。
- **快速输入**：真实测试发现输入事件可能晚于最后一次键盘更新。接受候选前重新读取当前查询范围；程序化插入使用静默通知，保留独立补全状态。
- **WebView2 聚焦**：原生验证发现聚焦 Tauri 顶层窗口并不等于聚焦嵌入的 WebView。调用两个公开 `set_focus()` 后再恢复 MathLive 输入焦点。

这些适配均有独立模块；未修改 MathLive 自带补全实现。MathLive 的自动 inline shortcuts 关闭，避免与产品补全竞争。字体与静态数学预览样式随 EXE 离线嵌入。

## v0.2 补充实测

`reports/v02-mathlive-baseline.json` 保存改动前的真实公开偏移与细删过程：`\sin` 是单个节点，`sinValue` 是独立字母；`\sin(x)` 的参数可表现为有子分支的括号，普通嵌套括号也可能是同层文字节点，两者都需要保留。

当前版本公开 ElementInfo.bounds 可定位普通字形与分支哨兵；部分后置脚本偏移没有 bounds，因此浮层必须有明确回退，不能把缺失坐标假装成精确光标 API。UI 测试使用字形实际边界检查候选不遮挡当前数学内容，并检查主区域的 Bounding Box 不因筛选移动。

公开 insert 可用空字符串替换非空选区。连续细删与结构替换的 Undo 边界有差异，现以公开事件和命令适配并做一次撤销与连续撤销回归。没有调用内部快照方法。

### 官方参考

- [MathLive API](https://mathlive.io/mathfield/api/)
- [MathLive Prompt / Fill-in-the-blank](https://mathlive.io/mathfield/guides/fill-in-the-blank/)
- [MathLive 编辑命令](https://mathlive.io/mathfield/guides/commands/)
- [MathLive 交互与事件](https://mathlive.io/mathfield/guides/interacting/)
- [Tauri 2 全局快捷键](https://v2.tauri.app/plugin/global-shortcut/)
- [Tauri Windows 构建前置条件](https://v2.tauri.app/start/prerequisites/)
- [Microsoft UI Automation 焦点接口](https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/nf-uiautomationclient-iuiautomation-getfocusedelement)

原始探测可用 `npm run dev` 启动服务后运行 `node scripts/probe.mjs` 复现。Phase 0 与产品用例是不同证据层级；测试矩阵见 `TEST_REPORT.md`。
