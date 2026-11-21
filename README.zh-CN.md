# Math Input

[English](README.md)

Math Input 是一个离线 Windows 数学公式输入器。在支持 Markdown 的编辑器里按 **Ctrl + Alt + M** 呼出窗口，用命令补全和可编辑模板写公式，再把 LaTeX 或 Markdown 插回原输入框。

## 下载

在 [GitHub Releases](https://github.com/iteveryxy/MathInput/releases) 下载 Windows x64 安装包或便携 ZIP。使用便携版时，先解压再运行 `MathInput.exe`。两种版本都需要 WebView2 Runtime。

## 快速开始

1. 按下 **Ctrl + Alt + M**，输入 `frac` 后按 **Enter** 插入分式。
2. 输入分子，按 **Tab** 切换到分母。按 **Enter** 完成模板，再按 **Enter** 提交公式。
3. 如果是直接打开程序，可以点「仅复制」。在设置里可以调整快捷键、输出格式和自动粘贴。

## 写公式

- **模板补全**支持命令、拼音和自定义别名。输入 `sqrt`、`sum`、`lim` 等命令，或按 **Ctrl + Space** 打开命令列表。
- **矩阵**可通过工具栏或 **Alt + M** 插入。分别填写行数和列数，支持矩形矩阵、向量和方阵行列式，最多逐格编辑 400 个单元格。
- **公式包**可以从「设置 → 公式包」启用、导入和导出，也可以把当前公式保存为模板。随附 366 条本科公式和记号。

在「设置 → 界面语言」可切换简体中文和 English。公式重名时，按方向键或点选候选上的公式包来源。导入时可一次选择多个 JSON 文件，也可把文件拖到窗口或 `MathInput.exe` 上。

| 公式包 | 内容 | 文件 |
| --- | --- | --- |
| 高等数学 | 极限、微分、积分、级数和常微分方程 | [121 条模板](src/packs/university/advanced-math.mathpack.json) |
| 本科线性代数 | 行列式、向量空间、特征值、矩阵分解和二次型 | [117 条模板](src/packs/university/university-linear-algebra.mathpack.json) |
| 通用数学记号 | 希腊字母、数集、集合运算、量词和区间 | [128 条模板](src/packs/university/math-notation.mathpack.json) |

三个本科包默认关闭。已有公式库可用「添加随附本科公式包」补齐，再勾选所需的包。

## 从源码构建

桌面版使用 Tauri 2、TypeScript 和 MathLive。构建需要 Node.js 22.12+、Rust MSVC 1.90+、Visual Studio C++ 桌面生成工具和 Windows SDK。运行生成的程序需要 WebView2 Runtime。

```powershell
npm ci
npm run desktop:build
```

生成的 EXE 位于 `src-tauri/target/release/math-input.exe`。只预览公式编辑器可运行 `npm run dev`，再访问 [本地预览](http://127.0.0.1:1420)。完整环境和打包步骤见 [Windows 构建指南](docs/BUILD_WINDOWS.md)。

## 测试

```powershell
npm run test
npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

UI 套件在 Edge 中验证公式编辑、模板补全和导出。桌面快捷键与剪贴板的验证范围见 [测试报告](docs/TEST_REPORT.md)。

## 文档

- [使用手册与快捷键](docs/USER_GUIDE.md)
- [公式包编写教程](docs/FORMULA_PACK_TUTORIAL.md)与[格式规范](docs/FORMULA_PACK_SPEC.md)
- [程序架构](docs/ARCHITECTURE.md)
- [维护者 GitHub 发布指南](docs/PUBLISH_GITHUB.md)

## 许可证

Math Input 源码和项目文档采用 [MIT 许可证](LICENSE)。第三方组件及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
