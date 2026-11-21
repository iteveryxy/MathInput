# Math Input

[简体中文](README.zh-CN.md)

Math Input is an offline formula editor for Windows. Press **Ctrl + Alt + M** in your target application, compose a formula, and send it back as LaTeX or Markdown.

## Download

Get the Windows x64 installer or portable ZIP from [GitHub Releases](https://github.com/iteveryxy/MathInput/releases). To use the portable build, extract the ZIP and run `MathInput.exe`. Both builds require the Microsoft Edge WebView2 Runtime. The interface is in Simplified Chinese.

## Quick start

1. Place the cursor in your target editor and press **Ctrl + Alt + M**.
2. Type `frac` and press **Enter**. Fill in the numerator, press **Tab**, and fill in the denominator.
3. Press **Enter** to finish the template, then **Enter** again to submit. If you opened the app directly, use **Copy only** to copy the result.

Use **Ctrl + Space** to browse templates. Commands such as `sqrt`, `sum`, and `lim` also support Pinyin and custom aliases. Use **Alt + M** to insert a matrix by entering its rows and columns. You can edit up to 400 cells in a single matrix.

## Formula packs

Enable the packs you want under **Settings → Formula packs**. You can import and export JSON packs or save the current formula as a template. If you are upgrading an existing library, use **Add bundled university packs** to add the new packs before enabling them.

| Pack | Contents | JSON |
| --- | --- | --- |
| Calculus | Limits, derivatives, integrals, series, and ordinary differential equations | [121 templates](src/packs/university/advanced-math.mathpack.json) |
| Linear algebra | Determinants, vector spaces, eigenvalues, matrix decompositions, and quadratic forms | [117 templates](src/packs/university/university-linear-algebra.mathpack.json) |
| Mathematical notation | Greek letters, number sets, set operations, quantifiers, and intervals | [128 templates](src/packs/university/math-notation.mathpack.json) |

## Build and test

The desktop app uses Tauri 2, TypeScript, and MathLive. Building on Windows requires Node.js 22.12+, Rust MSVC 1.90+, the Visual Studio C++ build tools, and the Windows SDK.

```powershell
npm ci
npm run desktop:build
```

The executable is written to `src-tauri/target/release/math-input.exe`. Run `npm run dev` to preview the editor in your browser.

```powershell
npm run test
npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

## Documentation

The following guides are written in Simplified Chinese.

- [User guide and shortcuts](docs/USER_GUIDE.md)
- [Formula pack tutorial](docs/FORMULA_PACK_TUTORIAL.md) and [format specification](docs/FORMULA_PACK_SPEC.md)
- [Windows build guide](docs/BUILD_WINDOWS.md) and [GitHub release guide](docs/PUBLISH_GITHUB.md)

## License

Math Input's source and project documentation are distributed under the [MIT License](LICENSE). Bundled dependencies retain their respective licenses. See [third-party notices](THIRD_PARTY_NOTICES.md).
