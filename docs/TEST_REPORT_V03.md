# Math Input v0.3 测试报告

日期：2026-10-28，Asia/Shanghai。基于 v0.2 增量实现 Formula Packs，使用 MathLive 0.110.0；旧测试和 Windows 输入安全边界保持。

## 构建与自动化结果

| 层级 | 实际结果 | 证据 |
| --- | --- | --- |
| 严格 TypeScript / Vite | `npm run build` 通过，最终桌面构建再次执行 | `dist/`、桌面构建输出 |
| 单元测试 | **102/102，0 failed，0 skipped** | `reports/unit-results.json` |
| 真实 MathLive / Edge UI | **90/90，0 failed，0 skipped，0 flaky** | `reports/ui-results.json` |
| Rust 单元 / 实际文件存储 | **12/12，0 failed，0 ignored** | `reports/rust-tests.log` |
| Windows Release | **构建通过，版本 0.3.0** | `release/v0.3.0/MathInput.exe` |
| Windows 混合剪贴板保护 | **1/1，实际生产 preflight 拒绝并完整保留** | `reports/desktop-v03/native-clipboard-guard.json` |
| 最终 EXE 全局呼出 / 取消 | **通过，文字、剪贴板和原控件焦点保持** | `reports/desktop-v03/hotkey-cancel-after.txt` |
| 四项原生桥接重跑 | **首轮 0/4，剪贴板恢复失败；准确粘贴已单独观察到** | `reports/desktop-v03/native-first-attempt.json`、`.log` |

原有 **70 单元、36 UI、5 Rust** 用例全部保留。本轮新增 **32 单元、54 UI、7 Rust** 用例。54 项 UI 含 6 项早期可行性检查和 48 项公式包、编辑器及示例测试。没有跳过旧测试或删除行为断言。

最终 EXE SHA-256：`E94A8863CE8ADA1C2DB6DE1729C4E18EBC09796C6848E59AB8E6F22A8F32C9CA`。

原生文件导出/回导和矩阵测试先在中间构建 `925DB35B3BE49A151D3B70D30C82485A7978DC18D02707A85D2654CBA8341A4C` 完成；随后仅修正测试区参数提示 CSS，重新完整运行 90 项 UI 并构建最终 E94A… EXE。最终 EXE 已实际通过全局呼出/取消，未重复所有系统文件对话框动作。两次构建的 Windows 输入桥源码相同。

## 自动化覆盖

- 导入/导出语义往返，非法 JSON、未来版本、未知字段、重复 ID、路径字符、槽位与参数不一致、无效包裹目标、过大文件/字符串、超深 JSON/TeX 和脚本/HTML 命令拒绝；元数据中的 HTML 作为字面文本显示。
- GUI 创建包和模板、编辑/复制/确认删除、参数槽位按钮、参数重命名关联、默认值替换、导航顺序、包裹目标、独立交互测试、保存当前固定公式、立即补全。
- 同命令/别名、多包与内置/本机附加别名冲突，稳定排序与来源；修复命令和禁用冲突包；启停、重载、草稿和活跃参数会话保留。
- 全部 **27** 条线性代数模板逐条通过真实 MathLive 解析、默认值整体选中与替换、Tab 顺序和清除 Prompt 后导出；覆盖矩阵、行列式、分块 array、cases 方程组及常见运算。
- transpose、inverse、adjugate、vector、norm、determinant 的显式选区包裹、整矩阵包裹、左侧数学项优先，以及参数/嵌套会话与 Enter 提前结束。
- 保存失败不覆盖、并发 revision、原子落盘、上一成功状态备份、损坏库保留与恢复、解析异常包隔离、控制词相邻边界和原型属性名。
- 原有数学删除/选择、配对、Unwrap、缩放、浮层边界、鼠标/键盘补全、IME composition、Undo/Redo、输出及嵌套全部回归。

## 实际发现并修复

1. 当前 MathLive 不支持 `\\hline`，初版仅看编辑/导航的探针未发现解析错误。最终探针检查公开 `errors`，显式负例验证其失败；分块矩阵采用 `array` 竖向分隔，全部交付模板重新验证。`reports/v03-phase0-ui.json` 是早期 5 项有限探针，不能代替最终 90 项报告。
2. 默认值展开和去除 Prompt 时，`\\lVert` 紧接字母会变成错误控制词；通过 TeX 词边界连接修复，并验证范数和其他控制词。
3. 参数 ID 失焦时重建表单使下一次点击丢失；保留行节点、按关联 ID 更新槽位。
4. 独立 Mathfield 尚未 mount 时设置菜单/插入会失败；在公开 mount 事件后初始化，回调在挂载前不访问编辑器。
5. 长候选列表内部滚动触发重定位，再滚回首项，导致点击错误公式；保留内部滚动位置，仅在需要时显露当前候选，真实鼠标滚动测试通过。
6. 原生文件对话框最初没有绑定父窗口，会被始终置顶的输入器遮挡。改用官方 FileDialogBuilder.set_parent，将其绑定到调用 WebviewWindow；随后重新构建并实际验收文件导出、回导。
7. 独立测试区复用主界面的绝对定位参数提示，导致提示覆盖窗口标题。限定测试区提示在数学工作面下正常排布，并新增位置断言；最终完整 90 项 UI 回归通过。

## Windows 实机记录

本轮 Computer Use 已能访问最终 v0.3 程序。实际打开设置和公式包管理器，看到基础数学 13、我的公式 0、线性代数 27；勾选线性代数后读取实际配置 revision=1，重启最终 EXE 后仍启用，原正式草稿保持。

实际通过 Windows 系统保存对话框将线性代数包导出到 `reports/desktop-v03/linear-algebra-export.mathpack.json`，逐字段比较与源码示例一致；再通过系统打开对话框回导、校验并预览，显式勾选同 ID 替换并确认，落盘 revision=2，启用状态保留，上一状态备份存在。

实际独立矩阵测试中编辑首单元、Tab 整体选中下一默认参数并以 8 替换、Enter 提前结束，剩余 c/d 保留，导出为 `\begin{pmatrix}7a & 8\\ c & d\end{pmatrix}`；点击首单元后是在原 a 前精细输入 7，所以首单元为 7a。取消测试表单并返回后，正式草稿相同，示例模板未保存修改；随后恢复线性代数最初禁用状态，revision=3。矩阵测试截图记录在 native-matrix-test.png。

最终 EXE 从专用 TestTarget 的普通编辑控件实际通过 Ctrl+Alt+M 呼出，再按 Esc 取消；接收方文字等于预设基线、foreground/targetFocused 均为 true，剪贴板文本哈希与格式列表不变。证据为 hotkey-baseline.txt 和 hotkey-cancel-after.txt。此步骤没有提交公式。

当前混合剪贴板含 HTML/Chromium 附加格式。本轮专用、PID 核验的真实 Windows 接收方调用生产 NativeBridge preflight，**1/1** 通过：拒绝原因来自格式保护，所有控件内容、文本哈希及格式列表不变，没有请求剪贴板写入或键盘输入。记录在 `reports/desktop-v03/native-clipboard-guard.json`。

稍后只读 Win32 检查发现剪贴板已是 CF13/16/1/7 纯文本格式，因此在 Windows PowerShell 5.1 中以原样保留基线的方式运行四项桥接回归，没有启用 PrepareTestBaseline。第一项独立接收方确实读到完整且唯一的测试公式，但生产桥接报告剪贴板恢复失败，最终哈希仍为该测试公式，驱动按完整断言判为 **0/4 失败**，其余三项未执行。记录在 native-first-attempt.json/.log；准确送达不能代替剪贴板恢复成功。

失败现场同时存在每 250ms 读取剪贴板的额外 TestTarget 和两个每 60ms 读取的桥接接收方；是否为失败原因尚未确认。额外 TestTarget 已退出。自动审批以首轮剪贴板未恢复、继续运行可能覆盖当前状态为由拒绝直接重跑，后续基线测试等待用户明确授权；没有用其他接口绕过。报告只保留基线哈希，没有原剪贴板正文可供恢复，当前剪贴板可能仍是测试公式。

v0.2 的四项生产桥接正向/取消/焦点改变/目标关闭测试曾 **4/4** 通过，证据及旧 EXE 哈希保留在 `reports/desktop-v02/bridge-history/` 和 `verification-v02.json`，以及 `docs/TEST_REPORT_V02.md`。旧 4/4 不计作本轮最终 EXE 的四项端到端通过。

生产 `native.rs` SHA-256 仍是 `C1AC0B6BC49AC50C0EF356F6AFDC1D6B9EFFC081FCD3B99241A652A2A1A18043`，与 v0.2 检查点一致。这证明该文件未变，不替代运行行为证据。

## 支持范围和未实现项

已实现并自动化验证：公式包管理、自定义公式与参数编辑、独立真实测试区、固定公式保存、JSON 文件格式/校验、冲突处理、原子本地存储与恢复、27 条示例。Windows 原生文件导出/回导及重启持久化也已实际验证。

部分支持：矩阵等可用 MathLive 原生编辑及模板参数导航，但没有扩大 v0.2 对矩阵内部的结构选区/配对语义；分块矩阵没有横向 hline；不支持的数学解析会拒绝新保存/导入，已存异常包保留并隔离。一个参数只对应一个槽位。

未实现：选中数学子表达式自动参数化、在线商店、账户/云同步、AI 生成、可执行插件、代数计算、NSIS 安装包和代码签名。真实中文输入法、不同键盘布局、多屏混合 DPI、远程桌面、Word/聊天软件和慢应用粘贴仍需相应环境验证；composition 事件用例不能替代真实输入法验收。

## 可恢复交付

开发前本地检查点：提交 `061c887057d387ae8a5191f00330ff86a6df1f5d`，标签 `checkpoint-v0.2-20261028`。额外 `.local/checkpoints/v0.2-before-formula-packs/` 保存旧源码 ZIP、EXE、交付 ZIP 和恢复说明。未修改旧草稿/设置的键或应用标识，未推送远程仓库，未修改系统安全设置。

版本化目录 `release/v0.3.0/` 包含 EXE、示例包、规范、Schema、测试报告及依赖版权说明；便携包为 `release/MathInput-0.3.0-win64.zip`。校验值以版本目录 `SHA256SUMS.txt` 和 `reports/verification-v03.json` 为准。
