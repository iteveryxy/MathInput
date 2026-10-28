# Math Input v0.2

离线运行的 Windows 结构化数学公式输入器。Tauri 2 + TypeScript 严格模式 + MathLive 0.110.0。数学内容直接在所见即所得编辑器中编辑，支持命令补全、默认参数、嵌套模板、结构导航和 Markdown 输出。

## 运行

交付文件位于 `release/MathInput.exe`。Windows 11 需要 Microsoft Edge WebView2 Runtime（通常随系统提供）；无需 Node.js、Rust、账户或联网服务。关闭窗口或按 Esc 后程序留在托盘，可从托盘菜单退出。

1. 双击 `MathInput.exe`。
2. 在普通文本输入框中按 **Ctrl + Alt + M**。
3. 输入 `frac`，按 Enter 接受分式；输入分子，Tab，输入分母，Enter 完成模板。
4. 再按 Enter 提交。默认输出 `$\frac{x+1}{y}$` 形式的行内 Markdown。

初次直接启动窗口没有原输入目标，可使用“仅复制”。设置按钮可修改全局快捷键、输出模式、自动粘贴、命令别名、65%～125% 界面缩放及紧凑模式；`?` 按钮提供快捷键帮助。

v0.2 新增数学语义选择/删除、函数名删除确认、括号匹配与安全 Unwrap。Ctrl+Shift+方向键扩展/反向收缩选区，Alt+方向键跳出容器，Ctrl+Backspace/Delete 删除数学项，Ctrl+M 匹配括号，Ctrl+Alt+U 解除结构。候选菜单在光标附近悬浮并自动翻转，不再撑大主窗口。详见使用手册。

## 开发与验证

环境：Windows 11、Node.js 22.12+、Rust MSVC 1.90+、Visual Studio C++ 桌面生成工具、Windows SDK、WebView2 Runtime。

```powershell
npm ci
npm run dev                  # 浏览器编辑器，127.0.0.1:1420
npm run desktop:dev          # Tauri 调试运行
npm run test                 # 纯逻辑 Vitest
npm run test:ui              # 真 MathLive / 无头 Edge 交互测试
cargo test --manifest-path src-tauri/Cargo.toml --lib
./scripts/test-native.ps1 -Interactive # 隔离 Windows 原生集成测试，需要真实可见桌面
npm run desktop:build        # 构建便携 EXE
./scripts/package.ps1        # 拷贝交付文件并生成 SHA-256
```

UI 测试默认使用系统 Edge，与 Windows WebView2 的 Chromium 引擎接近。也可设置 `PLAYWRIGHT_CHANNEL=chrome` 使用已安装 Chrome，或者修改 Playwright 配置后使用 `npx playwright install chromium` 下载的浏览器。测试使用独立临时配置，不读取日常浏览器数据。

`predev` / `prebuild` 自动从已安装 MathLive 包复制字体与数学样式到本地 `public/mathlive/`。前端发布资源全部嵌入 EXE，不使用 CDN。依赖版本由 `package-lock.json` 和 `src-tauri/Cargo.lock` 锁定。首次开发安装依赖需要联网；编译完成后的程序离线工作。

如 npm 默认镜像不可用，可仅为本次安装指定 `npm ci --registry=https://registry.npmjs.org`。无需更改系统 PATH 或全局 npm 设置。

## 主要模块

| 模块 | 职责 |
| --- | --- |
| `src/editor/` | MathLive 生命周期、键盘状态分发、光标与选区协调 |
| `src/completion/` | 独立补全状态、别名筛选、查询范围、MathLive 公式预览 |
| `src/snippets/` | 声明式模板、整体默认值选择、嵌套会话栈与撤销恢复 |
| `src/math/` | 由公开节点深度投影出的结构树、数字分组和数学项导航 |
| `src/output/` | 清除临时 Prompt 元数据、LaTeX 与 Markdown 输出 |
| `src/components/` | 窗口、参数提示、偏好设置 |
| `src/platform/` | 浏览器/桌面桥接、本机设置与草稿 |
| `src-tauri/src/` | 快捷键、托盘、焦点核验、有限剪贴板事务与前台粘贴 |

不读取 MathLive 的 `_mathfield`、内部 Atom、私有 Model 或 Shadow DOM 实现。结构编辑基于公开的 `getElementInfo()`、`getValue()`、Selection 和 Position。

## 文档

- [使用手册与快捷键](docs/USER_GUIDE.md)
- [模板定义与扩展](docs/SNIPPETS.md)
- [MathLive 技术验证](docs/FEASIBILITY.md)
- [架构与边界](docs/ARCHITECTURE.md)
- [真实测试结果与限制](docs/TEST_REPORT.md)
- [Windows 构建与打包](docs/BUILD_WINDOWS.md)

## 当前边界

支持单行及可由 MathLive 编辑的常见公式；第一版的自定义“结构操作”重点覆盖分式、根式、上下标、括号和隐式乘法。矩阵/分段、复杂 TeX 宏、单位语义及绝对值歧义未纳入可靠性承诺，可继续使用 MathLive 普通光标编辑。

自动粘贴只针对捕获并重新核验的普通编辑控件，不向密码框、受保护桌面、管理员程序、终端或未知后台窗口发送内容。图片、文件、HTML 等混合剪贴板不会被自动覆盖，结果保留供显式“仅复制”。通用的按键注入成功不等于目标应用已消费粘贴，应用提示和测试报告均区分这两者。

输入法自动化测试覆盖 composition 事件路由；真实中文输入法候选、远程桌面、多显示器不同 DPI、Word/各类聊天软件等组合仍需分别验证。

v0.2 已通过 70 项单元测试、36 项浏览器 UI 测试、5 项 Rust 测试，以及 Windows 生产桥接原生集成 4/4、混合剪贴板拒绝专项 1/1。修正了旧 UI 测试首次输入前的实际焦点等待，保留全部行为断言。原生测试使用用户明确授权的固定纯文本基线，独立接收方验证实际文字与剪贴板恢复。Computer Use 仍拒绝访问 MathInput，因此最终 EXE 的全局快捷键、窗口 UI 和完整端到端验收尚未完成。v0.1 的既有桌面记录单独保留。详情见本轮测试报告。
