# Math Input v0.2 Windows 构建与交付

## 前置条件

- Windows 11 x64。
- Node.js 22.12 或更新兼容版本（本次使用 24.18.0）。
- Rust MSVC 工具链，至少 1.90（本次使用 1.98.1）。
- Visual Studio Build Tools 的 Desktop development with C++ 与 Windows SDK。
- Microsoft Edge WebView2 Runtime。

可先运行 `node --version`、`npm --version`、`cargo --version` 和 `rustup show active-toolchain` 检查。MSVC 的发现由 Rust/Cargo 工具链处理，不需要为了本工程修改全局 PATH。

```powershell
npm ci
cargo fetch --manifest-path src-tauri/Cargo.toml
npm run test
npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run desktop:build
./scripts/package.ps1
```

默认生成 `src-tauri/target/release/math-input.exe`；交付副本是 `release/MathInput.exe`。这个文件已包含前端代码、数学字体、图标和静态样式。复制 EXE 到其他目录也可运行，WebView2 用户数据仍使用当前用户的应用数据目录；这里的“便携”指无需安装的 EXE，不表示设置随 EXE 目录移动。

首次构建需要下载 npm 与 Cargo 依赖；之后可使用现有缓存。不要在没有缓存的新机器上承诺离线构建。生产运行不需要开发服务器或开发工具链。

## 安装包

`npm run tauri -- build --bundles nsis` 可额外生成 NSIS 安装包。此路径可能需要下载 Tauri 的 NSIS 工具和 WebView2 引导文件。默认交付优先提供便携 EXE，实际是否构建安装包以测试报告和 `release/` 文件为准。未签名 EXE 可能由 Windows 显示发布者未知；本项目不自动购买或配置代码签名证书。

## UI 测试与本地桌面测试

Playwright 默认使用系统 Edge；测试不连接日常 Edge 配置文件。Vite 明确忽略 `src-tauri/target` 等构建输出，避免 Windows 链接期间的文件锁令开发服务器退出。

专用文本目标通过以下命令创建：

```powershell
./scripts/build-test-target.ps1
```

它生成 `.local/MathInput.TestTarget.exe`。启动后点击“记录剪贴板基线”，再在普通编辑区呼出 Math Input。它只记录自身收到的文本、剪贴板格式名称及文本哈希，不记录原剪贴板内容。输出写入测试目标旁的 `reports/` 子目录；这不是生产功能。

原生桌面测试需要可交互且解锁的桌面。不要在锁屏、授权对话框或个人敏感界面运行自动化；不要把输入成功推断为外部应用已接收，应检查目标文件与 UI。

### 隔离代码集成测试

```powershell
./scripts/test-native.ps1 -Interactive
```

项目的 `.ps1` 使用带 BOM 的 UTF-8，兼容 Windows PowerShell 5.1 与 PowerShell 7；`.editorconfig` 保持这一约定。不要将含中文的脚本另存为不带 BOM 的 UTF-8 后交给 5.1 默认读取，否则 GBK 系统可能出现字符串未终止的解析错误。Cargo 的正常 stderr 进度不会被当作测试失败，脚本会同时检查实际退出码和完整用例结果。

该脚本编译测试专用 C# 窗口，并运行直接引用生产 `native.rs` 的 Rust 测试驱动。四项断言检查真实文本送达与剪贴板恢复、取消不修改内容、焦点改变时拒绝输入、目标关闭时拒绝输入。原接收方独立读取实际控件文本，不能用 SendInput 的返回值替代成功断言。

每轮使用不同的测试公式，并断言其哈希不同于剪贴板基线，避免原内容恰好等于公式时误以为恢复成功。接收方不把原剪贴板文字写入报告，只记录哈希及格式名称。

Windows 可能不允许后台进程取得前台；交互模式最多等待 120 秒，需在可见测试窗点击一次“开始验证”。未观测到正确前台状态会报错退出，完成计数保持 0。测试进程有自动清理和三分钟存活上限，不会借助后台消息或输入模拟夺取权限。测试保留当前剪贴板；遇到无法完整保存的混合格式时会停止。完整结果写入 `reports/native-integration.json` 与日志。

如果当前剪贴板内容可以丢弃，并且已明确同意替换，可执行 `./scripts/test-native.ps1 -Interactive -PrepareTestBaseline`。该显式开关通过生产 NativeBridge::copy 将剪贴板替换为 MathInput.NativeBaseline.20261028，由独立接收方核对哈希，再运行原四项测试；测试最终恢复到这段固定基线。**该开关会替换原剪贴板文字和附加格式，默认关闭。** 这是测试准备功能，生产自动粘贴规则保持不变。

.NET SetText 与 IDataObject.GetFormats(false) 的格式视图不能替代 Win32 EnumClipboardFormats：实际诊断中前者仅显示 UnicodeText，后者仍包含 OLE 注册格式。只读 Win32 格式诊断可运行 `cargo run --manifest-path src-tauri/Cargo.toml --example native_acceptance --offline -- --clipboard-formats`，仅记录格式 ID/名称，不读取格式内容。

只读环境诊断可运行 `cargo run --manifest-path src-tauri/Cargo.toml --example native_acceptance --offline -- --environment`，它不创建窗口、不发送输入，也不写剪贴板。桥接层代码验证和完整桌面 UI 验证是两个不同的测试层级。

若需要单独验证混合格式剪贴板的拒绝与保留，可在编译好 NativeFixture 后运行 `cargo run --manifest-path src-tauri/Cargo.toml --example native_acceptance --offline -- --clipboard-guard --interactive`。该专项仍需要解锁且可交互的桌面，只调用生产 preflight，不请求粘贴或写入剪贴板；预期当前剪贴板确实含不支持的格式。结果单独写入 reports/native-clipboard-guard.json，不能替代四项正向/取消原生测试或最终 EXE 验收。开始运行就将结果置为未完成，避免中断后沿用旧的成功记录。

## 构建说明

`package.ps1` 只复制当前已构建文件并生成 SHA-256，不代替编译或测试。报告、文档和版权说明一起放入 `release/`，可复核源文件与交付文件的哈希。大型 MathLive JavaScript 块的 Vite 体积提示是资源大小提示，不是构建错误；离线数学编辑库约 0.86 MB，压缩后约 0.24 MB。

v0.2 的版本化压缩包为 `release/MathInput-0.2.0-win64.zip`，文件名从 package.json 读取。前端、Cargo 与 Tauri 配置的版本均为 0.2.0，应用标识保持不变，使 v0.1 草稿、别名和设置可继续使用。旧设置自动补上 85% 缩放与紧凑模式，不清空用户数据。

本轮开始前的可恢复检查点在 `.local/checkpoints/v0.1-20261028-161007/`，包括 v0.1 可运行 EXE、原生报告和源码。`sources.zip` 是原始比较存档，`sources-restorable.zip` 保留前后端原目录层级并补入未修改的图标/构建文件，恢复时应解压后者到新目录；`RESTORE.txt` 有简要说明。没有初始化或推送远程仓库，也没有为本轮添加新前端依赖。
