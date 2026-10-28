# Math Input v0.2 测试报告

日期：2026-10-28，Asia/Shanghai。基于现有 v0.1 增量开发；没有删除原测试，没有访问 MathLive 私有 Model 或 Shadow DOM，没有新增前端依赖。

## 最终结果

| 层级 | 命令或方式 | 本轮实际结果 | 证据 |
| --- | --- | --- | --- |
| 严格 TypeScript / Vite | `npm run build`，桌面构建亦再次执行 | 通过 | `dist/`、构建输出 |
| 单元测试 | `npm run test` | **70/70，0 failed，0 skipped** | `reports/unit-results.json` |
| 真实 MathLive / Edge UI | `npm run test:ui` | **36/36，0 failed，0 skipped** | `reports/ui-results.json` |
| Rust 原生边界逻辑 | `cargo test --manifest-path src-tauri/Cargo.toml --lib --offline` | **5/5，0 ignored** | `reports/rust-tests.log` |
| Windows 原生集成 | Windows PowerShell 5.1：`scripts/test-native.ps1 -Interactive -PrepareTestBaseline` | **4/4，0 skipped，退出码 0** | `reports/native-integration.json`、`.log` |
| 最终 EXE 实机 UI | Computer Use | **应用访问仍被拒绝，未完成；锁屏已由用户解除** | `reports/desktop-v02/status.json` |
| 混合剪贴板保护专项 | `native_acceptance --clipboard-guard --interactive` | **1/1，文本哈希、格式列表及全部测试控件内容不变** | `reports/native-clipboard-guard.json` |
| Windows Release EXE | `npm run desktop:build` | **构建通过，产品版本 0.2.0** | `release/MathInput.exe` |

原有 45 项单元和 17 项 UI 测试全部保留。本轮新增 **25 项单元用例、19 项 UI 用例**。原容器跳出测试按任务书从 Ctrl+Shift+Right 改为 Alt+Right，位置和范围断言保持不变；旧 Alt+Shift 扩展/收缩仍受测试覆盖。

EXE SHA-256：`2B701A0C4FFDD432323593DB7A654123C301106BD4553469F70C5BEAB51A6810`。汇总在 `reports/verification-v02.json`，打包校验值在 `release/SHA256SUMS.txt`。

## 已实现和验证的行为

| 任务书场景 | 真实断言 |
| --- | --- |
| A 函数名称删除 | 逐步删除 sin 参数及括号；命令名先完整选择、再删除，Undo 恢复；普通 sin 和 sinValue 保留字符行为 |
| B 整体函数选择 | 从左右选择完整函数调用；真实 Selection 和高亮状态一致；删除后可继续输入，一次 Undo 恢复上下文 |
| C Unwrap | sin、平方根、普通/智能括号保留全部主体；分式、带根指数和带幂函数拒绝解除 |
| D 层级选择 | 底数 x → x² → 2x² → 同层表达式，反方向逐级恢复；Esc 仅清结构选择，重新输入清历史 |
| E 括号 | 嵌套配对而非最近符号；普通及智能括号可单侧删除；未配对安全无操作 |
| F 浮层稳定 | s → ↓ → q 正确筛选 sqrt；焦点保留；shell x/y/height 与编辑器 y 位移均不超过 1 CSS px |
| G 边界 | 视口顶部、底部、左侧、右侧均不溢出；底部向上翻转；与公开字形 bounds 留出间隔 |
| H 缩放 | 65/85/100/125%，真实滑动条按键调整、保存、重载、鼠标定位、候选点击及参数提示 |
| I 原有回归 | sum、整段默认值替换、Enter 提前完成、frac→sqrt→frac、Shift+Enter 包裹、输出、撤销/重做全部重跑 |
| 附加组合 | 连续结构删除各自 Undo/Redo、Undo 不选择无关上下文、结构选区包裹、参数默认选区 Esc、显式鼠标选区 |
| 长内容 | 超高 dfrac 公式可局部滚动，滚动和视口尺寸变化后浮层保持可见，长列表内部滚动 |

浮层的遮挡断言使用实际数学字形的公开 bounds；编辑器背景还含留白，浮层可覆盖留白。没有把“必须完全位于编辑器背景外”当成数学内容不遮挡的定义。

## Phase 1 证据与实现选择

实际安装版本为 MathLive 0.110.0。改动前的 `reports/v02-mathlive-baseline.json` 表明，解析后的函数命令已经是原子，普通变量字符串是独立字母；原生细删会把智能括号变成只有一侧的形式。v0.2 因此增强明确边界和操作反馈，没有按 sin 子串猜测函数。

旧布局中 CompletionPopup 位于 shell 正常流，ResizeObserver 又按 shell 高度调整原生窗口。现在菜单是 body 下的 fixed portal，以公开 ElementInfo.bounds 近似定位，独立纯函数计算翻转和边界；主窗口只观察自身内容。没有独立原生弹出窗，也没有 transform: scale。

默认窗口配置 420×224、最小 320×188 逻辑像素。浏览器在 420×224 视口、85% 下测得基础 shell 高约 195 CSS px，见 `reports/v02-ui-geometry.json`。这不是 Windows 实机尺寸证明。截图 `ui-v02-compact.png` 与 `ui-v02-selection.png` 已实际查看。

## 发现并修复的问题

1. 细删与结构删除的 Undo 合并：以公开 undo-state-change、Selection、insert 和导航命令建立边界；函数完整删除、连续删除及重做均有测试。
2. 带幂函数的括号被当成普通 Unwrap：函数投影保留脚本分支，拒绝可能丢失语义的解除。
3. 异步 input 通知清掉刚建立的高亮：只在内容或范围实际改变时清理选择状态。
4. 紧凑预览的 nowrap 把块级 Markdown 换行合并：恢复 pre，原 v0.1 输出断言未修改。
5. 深层公式几何需等待 MathLive 布局完成：用真实超高测试内容和轮询滚动边界，保留实际溢出断言；编辑区使用内部滚动。
6. 后置脚本可能没有公开 bounds：按附近公开偏移回退，保持候选在可见视口内。

测试初始化使用真实可聚焦的数学工作面，不把 MathLive 的逻辑 hasFocus 状态当成浏览器 DOM 焦点证明。

恢复验证的首轮 UI 结果是 33/36：3 个旧用例在首次输入时没有取得实际 DOM 焦点。公开事件诊断发现键盘事件落在 BODY，而 hasFocus() 已返回 true；已安装 MathLive 的 focus 实现会延迟约 60ms 才完成键盘焦点。旧 editor.spec.ts 的 beforeEach 增加 toBeFocused() 前置检查后，完整 36/36 通过，0 skipped、0 flaky，没有删除或放宽行为断言，也没有增加固定 sleep。首轮结果保存在 reports/desktop-v02/ui-first-attempt.json，诊断在 focus-probe-before.json。本次只修改测试准备条件，发布 EXE 未改变。

## Windows 本轮边界

用户解锁并明确允许将临时剪贴板替换成固定测试文字 MathInput.NativeBaseline.20261028 后，四项原生集成已实际完成 **4/4**：独立 WinForms 接收方读到与唯一测试公式完全相同的 Markdown，剪贴板文本哈希和格式恢复；取消不改内容且恢复焦点；控件焦点改变时拒绝输入；目标关闭时拒绝输入。没有将 SendInput 返回成功当成送达证明。

固定基线使用新增的显式测试开关 -PrepareTestBaseline，通过生产 NativeBridge::copy 路径写入，并由独立接收方比较预期文字哈希。该开关默认关闭，不改变正常脚本或生产自动粘贴策略。完成后剪贴板保持在这段固定基线；原临时内容的替换已获用户明确授权。基线证据见 reports/desktop-v02/plaintext-baseline-preparation.json。

准备过程确认了一个格式视图差异：.NET Clipboard.SetText 写入后，IDataObject.GetFormats(false) 仅列出 UnicodeText，但 Win32 EnumClipboardFormats 还枚举出 DataObject 和 Ole Private Data。生产桥接据 Win32 格式判断，因此仍会拒绝自动覆盖。诊断见 reports/native-clipboard-formats.json 与 reports/desktop-v02/baseline-dotnet-attempt.json。测试改用生产显式复制接口建立基线，没有放宽 safe_text_format 或忽略注册格式。此前 HTML、Chromium 附加格式及 EnterpriseDataProtectionId 的拒绝也符合现有保留策略；两次条件不符的文字转换均未写入。

混合剪贴板保护专项在解锁后实际通过 **1/1**：两个独立、PID 校验的测试输入框调用生产 NativeBridge preflight，验证错误来自不支持的剪贴板格式；重新取得确认后的快照，文本哈希、格式列表和所有测试控件内容均不变。该专项没有请求剪贴板写入或按键。它验证拒绝路径，不能代替四项正向/取消测试。

最终发布 EXE 的 Computer Use 启动仍返回 Computer Use was not approved to use mathinput，界面和全局快捷键端到端验收仍未完成。命令/文件的全部访问与 Computer Use 应用授权分开管理，参见 [官方说明](https://learn.chatgpt.com/docs/computer-use)。原生测试只控制本项目生成的隔离接收方，没有通过其他接口控制这个被拒绝的进程。此前锁屏中止保留在 reports/desktop-v02/attempt-locked-20261028.json，应用访问失败保留在 resume-20261028.json。

测试驱动和专用窗口均已退出，剩余测试进程为 0。

生产 `native.rs` SHA-256 仍为 `C1AC0B6BC49AC50C0EF356F6AFDC1D6B9EFFC081FCD3B99241A652A2A1A18043`，与 v0.1 完成剪贴板修复后的桥接源文件相同。本轮仅调整桌面适配的最小高度和窗口配置，没有改变全局快捷键或剪贴板安全策略。此源码一致性不能替代 v0.2 最终 EXE 的实际交互验收。

`TEST_REPORT_V01.md` 与 `reports/desktop-acceptance/` 是旧版本、旧 EXE 哈希的历史通过证据。本轮现状以本报告及 `reports/desktop-v02/` 为准。

## 限制与建议亲自验证

- 补全不能越出同一 WebView，小窗口可能只有一两项可见，需用方向键或内部滚轮。复杂节点用公开元素边界近似光标，未承诺每种 TeX 构造都能像素级对齐。
- 不确定结构不做 Unwrap；分式、带根指数、带幂/上下限函数明确拒绝。尖括号、绝对值、混合定界符、自定义宏、矩阵等未获得完整语义增强。
- 解析后的函数命令是 MathLive 原子，不能在该原子内直接把 sin 拆成 si；普通字母输入和明确的现有范围仍可精细编辑。
- 连续运算符保留，空槽由 MathLive 维持可编辑状态，不进行数学求值或代数修复。
- 真实中文输入法候选、不同键盘布局、远程桌面、多显示器不同 DPI、Word/聊天软件、慢应用粘贴仍需实机验证。现有 IME 用例是 composition 事件测试。
- 请亲自检查 65%/125% 的可读性、函数名两次删除、Ctrl+Shift 方向选择及反向收缩、Ctrl+M、Ctrl+Alt+U 和补全靠近窗口底部的滚动。
- 仍需允许 Computer Use 访问 MathInput，再用专用 TestTarget 检查最终 EXE 的全局呼出、实际粘贴、取消不改原文及剪贴板恢复。四项生产桥接测试和混合剪贴板拒绝专项现已通过；这不能代替打包程序的端到端验收。混合剪贴板不会被生产自动粘贴流程清空。
- 交付便携 EXE，未构建 NSIS 安装包、未代码签名。没有推送远程仓库或修改系统安全配置。
