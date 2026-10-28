# 测试报告

执行日期：2026-10-27（Asia/Shanghai）。所有计数来自真实命令或浏览器执行结果，没有跳过失败断言或将未执行场景计为通过。

## 最终自动化结果

| 层级 | 命令 | 结果 | 原始证据 |
| --- | --- | --- | --- |
| 严格 TypeScript 与前端构建 | `npm run build` | 通过 | 桌面构建前置步骤，`dist/` |
| 逻辑、状态机、结构投影 | `npm run test` | **45 / 45 通过** | `reports/unit-results.json` |
| 真实 MathLive UI | `npm run test:ui` | **17 / 17 通过** | `reports/ui-results.json` |
| Rust 原生边界逻辑 | `cargo test --manifest-path src-tauri/Cargo.toml --lib --offline` | **5 / 5 通过，0 ignored** | `reports/rust-tests.log` |
| PowerShell 脚本兼容性 | Windows PowerShell 5.1 实际解析全部三个脚本，并执行构建测试框、原生测试及打包 | **三个脚本解析错误均为 0** | `reports/powershell-compatibility.json` |
| 隔离原生集成测试 | Windows PowerShell 5.1：`./scripts/test-native.ps1 -Interactive` | **4 / 4 通过，退出码 0，0 skipped** | `reports/native-integration.json`、`reports/native-integration.log` |
| 最终 EXE 桌面验收 | Computer Use 控制最终 EXE 与专用 WinForms 输入框，接收方独立记录实际结果 | **K / L 均通过** | `reports/desktop-acceptance/` |
| Windows release 构建 | `npm run desktop:build` | **通过，生成 EXE** | `src-tauri/target/release/math-input.exe` |

本次环境：Node.js 24.18.0、npm 11.16.0、TypeScript 5.9.3、MathLive 0.110.0、Vite 7.3.7、Vitest 3.2.7、Playwright 1.64.1、Tauri CLI/API 2.12.4、Rust 1.98.1 MSVC。Cargo 的 Tauri 为 2.12.5，全局快捷键插件 2.4.1。

## 验收矩阵

| 场景 | 已执行的验证 | 状态 |
| --- | --- | --- |
| A 持续补全输入 | `s → ↓ → q`，候选变为 sqrt，输入焦点保留 | UI 通过 |
| B 默认参数 | sum 输入 v 后 Enter，其余默认值保留、未提交、退出位置正确 | UI 通过 |
| C 逐参数填写 | Tab 顺序、参数提示、逐个替换 | UI 通过 |
| D 整体默认值覆盖 | `k+t → n`，整段被替换 | UI 通过 |
| E 根号包裹 | `a+b → a+\sqrt{b}` | UI 通过 |
| F 括号包裹 | `(a+b) → \sqrt{(a+b)}` | UI 通过 |
| G 指数层级 | 外部包裹 x²，指数内部只包裹 2 | UI 通过 |
| H 隐式乘法 | 连续输入 23，整体包裹 2x | UI 与逻辑通过 |
| I 结构导航 | 分子内跨过 x²，跳出分式；选区按路径扩展/收缩 | UI 与逻辑通过 |
| J 嵌套会话 | frac → sqrt → frac，内层完成后恢复外层及分母导航 | UI 与逻辑通过 |
| K 全局输出 | Ctrl+Alt+M 呼出，Enter 提交，原控件收到精确 Markdown，原剪贴板文本哈希及格式恢复，原焦点恢复 | **最终 EXE 实机通过** |
| L 取消 | 修改草稿后 Esc，原输入框文本完全不变、剪贴板及焦点不变；再次呼出保留未提交草稿 | **最终 EXE 实机通过** |

额外 UI 用例覆盖显式选区优先、鼠标候选保持焦点、composition 事件分发、没有 ASCII keydown 的文本服务输入、撤销重做恢复会话、输出模式与失败结果保留、自定义字母数字别名、公式预览实际数学 DOM、窗口聚焦事件不重置选区。

五项 Rust 单元测试只验证纯文本格式保护策略、受保护程序/终端排除、UTF-16 输出、输出边界和真实插件快捷键解析。另有四项原生集成测试直接运行生产桥接模块；最终 EXE 的 K/L 通过 Computer Use 与接收方文件交叉核验。前端源代码在本轮未变，45 项逻辑与 17 项浏览器结果沿用此前完整回归；本轮重新执行了 Rust 单元测试、原生集成测试、严格 TypeScript 和 release 构建。

## 原生桌面观察与此前中止记录

通过 computer-use 在项目专用测试窗口与诊断构建中观察到：Tauri 无边框置顶窗口正常打开；离线字体与 MathLive 数学布局正常；全局快捷键可从专用普通输入框触发；原生文本输入可触发候选；Enter 接受分式后出现可编辑默认参数，Enter 可结束模板；鼠标拖动能选中数学结构。

测试发现并修复了 WebView 与顶层窗口焦点分离、文本服务不经过 ASCII keydown、重复聚焦回调干扰选区，以及候选滚动带动页面的问题。最终修复版本通过全部浏览器回归并完成 Windows release 构建。

此前启动最终构建验收时，computer-use 报告用户按物理 Esc 停止自动化。用户随后恢复授权，但工具的下一次只读窗口请求仍返回停止状态，因此当时没有继续控制，也没有将未执行的桌面场景记为通过。以下旧阻塞记录均由重启后的最终验收更新；真实中文 IME 候选仍未验证。

### 重启前的再次验证

用户明确要求再次尝试 Computer Use，并允许在有可靠断言的情况下进行代码验证。再次检查时，窗口枚举已恢复，但启动交付程序返回 **`Computer Use was not approved to use mathinput`**。未改用其他方式控制这个被拒绝的应用。

已新增可重复执行的隔离代码测试：`src-tauri/examples/native_acceptance.rs` 直接引用生产 `src-tauri/src/native.rs`，使用单独的 C# 测试进程作为原输入框与编辑器替身。它对进程 ID、窗口归属与实际前台状态进行核验，接收方独立读取自己的真实文本，并检查剪贴板文本 SHA-256 和格式名称。预定验证实际粘贴、取消、焦点改变与原窗口关闭四个场景。

重启前的执行结果：后台测试进程请求前台激活被 Windows 拒绝；交互模式随后等待真实用户激活 120 秒，未观测到该条件后退出。那次完成 0 / 4、退出码 1，没有发送键盘输入，也没有写入剪贴板。用例断言保持不变，没有采用模拟成功、后台消息粘贴或绕过前台限制的方式。

只读环境探测实际返回 `WinSta0 / Default`，输入桌面也为 `Default`，且存在前台窗口。因此没有把原因断言为非交互桌面。能确认的边界是：本次执行环境未让测试窗取得所需前台状态；测试框未出现在 Computer Use 当次可访问窗口列表中，剪贴板观测不可用。原始环境结果在 `reports/native-environment.json`。

新增测试脚本应在用户本机可见桌面的终端运行：`./scripts/test-native.ps1 -Interactive`。如 Windows 不允许后台取得前台，用户在测试窗点击一次“开始验证”后才继续；两个测试进程仅能操作自身控件，并会自动关闭。它验证 Windows 桥接层，不代替打包 Tauri 程序的全局快捷键、WebView 聚焦和 Enter 提交整条链路验收。

最终 EXE 的 SHA-256 以 `release/SHA256SUMS.txt` 为准；与最终测试副本比对一致。本次源码未提交远程仓库。

### 重启后的最终验收

用户重启 Codex 后，Computer Use 可以启动并观察最终 MathInput.exe 与两个专用测试程序。

1. 在实际的 Windows PowerShell **5.1.26100.9711 / GBK** 中复现用户报告的解析错误。根因是含中文的 UTF-8 脚本没有 BOM。三个 `.ps1` 均改为 UTF-8 BOM，并增加编辑器编码约定；同时修复 5.1 把 Cargo 正常 stderr 当作 PowerShell ErrorRecord 导致提前终止的问题，JSON 使用显式 UTF-8 读取。最终脚本实际执行四项测试并以 0 退出。
2. 最初有一次真实送达成功、剪贴板恢复失败，测试因此退出失败。诊断观察到剪贴板写入时序列号为 813，关闭后为 816，恢复时仍为 816、所有者未变。旧代码在关闭前取号，误把系统变化当作新复制而跳过恢复。现改为关闭后取号，发送前与恢复锁内同时检查序列号和所有者。原始诊断保留在 `reports/native-clipboard-regression-before.log`。[Windows 剪贴板格式转换](https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-formats)与[序列号 API](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getclipboardsequencenumber)提供相关系统行为说明。
3. 加强恢复断言：每轮公式含不同的测试数字，接收方计算预期公式哈希，并要求其不同于原剪贴板基线。早期固定公式复跑中曾出现基线恰好等于公式的情况；该次不作为剪贴板恢复的有效证据。最终 4/4 报告明确带有 `baselineDiffersFromFormula: true`。
4. 最终 EXE 经 Computer Use 接受 `frac`、显示并选择默认分子 `x`，替换为 `x+1`，Enter 完成模板，并在外部加 `9`。电脑插件文本输入期间观察到剪贴板短暂改变，因此在编辑结束后记录稳定基线，再由目标输入框按 Ctrl+Alt+M 呼出草稿并按 Enter 提交。接收方 UI 与独立文件均为精确的 `$\frac{x+1}{y}+9$`。文本 SHA-256 和四种纯文本格式恢复，原窗口及原控件重新获得焦点。K 证据为 `reports/desktop-acceptance/paste.json` 及前后快照。
5. 在同一接收框再次呼出，使用数字键将未提交草稿改为 `$\frac{x+1}{y}+92$` 后按 Esc。原接收框仍为 `$\frac{x+1}{y}+9$`，文本逐字节未变，剪贴板和焦点恢复；再次呼出确认 `+92` 草稿仍在。L 证据为 `reports/desktop-acceptance/cancel.json`、前后快照和重新打开的编辑器可访问性树。

两个桌面场景以及最终原生集成报告对应的 EXE SHA-256 均为 `59112959D5BB62C8B84C6010872D1750C88559312844873C328A5B519E73E0A6`。未把其他应用中的粘贴或真实中文输入法推断为通过。

## 迭代中发现的缺陷

- 快速输入后立即 Enter：旧查询范围可能留下命令尾字母；改为接受前读取当前范围。
- 程序化插入触发补全：改用静默通知，真实 input 事件单独驱动补全。
- 文本服务输入没有 ASCII keydown：按实际 input 重新筛选，并增加回归。
- 字母数字别名：扫描器支持数字组，配置与执行保持一致。
- Windows 构建目标被 Vite 监听：忽略 `src-tauri/**` 等生成目录，避免 EBUSY 导致服务退出。
- 设置关闭后焦点恢复：关闭后下一帧恢复，测试显式确认焦点。
- 过期 Windows 请求：增加期限检查，避免排队超时后再向未知时点执行输入。
- Windows PowerShell 5.1 编码与 stderr：脚本使用 UTF-8 BOM，正常 Cargo 进度与实际非零退出分别处理。
- 剪贴板关闭后的序列号：改为关闭后记录，并加入所有者核验；用不同于基线的公式验证真实恢复。

早期失败均保留为问题记录；最终计数来自修复后完整运行。MathLive 的 `\frac12`、`\sqrt2`、`x_{i}` 等合法正规化写法与带花括号的等价表达式没有被当作数学内容错误。

## 已知限制与后续工作

1. K/L 已在本机普通 WinForms 输入框通过；Word、浏览器编辑器、各类聊天软件仍需分别验收，不能由本次结果推断兼容所有应用。
2. 真实中文 IME 候选、不同键盘布局、WebView2 修饰键组合、远程桌面、多屏不同 DPI 尚未全面验证。当前 composition 用例是事件级测试。
3. 原窗口关闭、焦点变化已通过原生测试；管理员程序、快捷键冲突、剪贴板被占用等路径未逐一做真实故障注入。电脑插件的 Ctrl+A 未可靠形成全选，本次使用实际鼠标选区完成替换；不同键盘组合仍需单独核验。
4. 通用 Ctrl+V 没有跨应用消费确认；650 ms 后的剪贴板恢复是尽力而为，慢应用可能需要手动复制。
5. 混合剪贴板不自动覆盖；显式“仅复制”会用结果替换剪贴板。
6. 高级结构导航的可靠范围为常见根式、分式、上下标、括号和相邻因子；矩阵、分段、自定义宏、单位、绝对值等复杂歧义需继续增加专门模型与测试。
7. 会话撤销状态缓存限 200 个正文快照；更旧内容仍可由 MathLive 撤销，但不承诺恢复参数会话。
8. 已构建便携 EXE；未构建或验证 NSIS 安装包，未代码签名。运行需已有 WebView2 Runtime。
