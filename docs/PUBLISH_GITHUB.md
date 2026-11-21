# 发布 Math Input 到 GitHub

[发布脚本](../scripts/publish-github.ps1)会把当前分支的工作区改动加入提交，并推送到 GitHub。首次运行可创建远端仓库。默认把新仓库设为私有，`-Visibility Public` 可创建公开仓库。

## 首次准备

在 PowerShell 中安装 GitHub CLI。安装后重新打开终端，再用浏览器登录 GitHub。选用 HTTPS 并允许 GitHub CLI 为 Git 提供凭据。[Windows 安装说明](https://github.com/cli/cli/blob/trunk/docs/install_windows.md) · [GitHub CLI 登录说明](https://docs.github.com/en/github-cli/github-cli/quickstart)

```powershell
winget install --id GitHub.cli --source winget
```

```powershell
gh auth login --hostname github.com --git-protocol https --web
gh auth status --hostname github.com
```

提交使用本机 Git 配置的 `user.name` 和 `user.email`。公开仓库会显示提交中的作者信息，可以使用 GitHub 提供的 `noreply` 邮箱。[GitHub 提交邮箱说明](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address)

## 预览和推送

在项目根目录执行。把 `YOUR_ACCOUNT/MathInput` 换成自己的 GitHub 用户名和仓库名。`-Preview` 会列出目标和待提交文件，无需 GitHub CLI 登录。

```powershell
.\scripts\publish-github.ps1 -Repository 'YOUR_ACCOUNT/MathInput' -Visibility Public -Preview
```

核对名单后去掉 `-Preview`，脚本会提交并推送当前分支。想先用私有仓库检查，去掉 `-Visibility Public`。已有同名仓库会沿用它的可见性。

```powershell
.\scripts\publish-github.ps1 -Repository 'YOUR_ACCOUNT/MathInput' -Visibility Public -Message 'Publish Math Input v0.3.0'
```

后续提交可直接使用已配置的 `origin`。

```powershell
.\scripts\publish-github.ps1 -Message 'Describe the change'
```

## 遇到问题

- **找不到脚本或提示执行策略限制**。在项目目录运行以下命令，执行策略只应用于这一次 PowerShell 进程。

  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\publish-github.ps1 -Repository 'YOUR_ACCOUNT/MathInput' -Visibility Public -Preview
  ```

- **Git 要求登录**。运行 `gh auth setup-git --hostname github.com` 配置凭据助手，然后重试。[GitHub CLI 身份验证说明](https://docs.github.com/en/github-cli/github-cli/authenticating-with-github-cli)
- **远端分支已有独立提交**。Git 会拒绝覆盖。首次上传到手动创建的仓库时应选空仓库，已有工作历史则先在本机合并。推送失败后，本地提交可继续用于重试。

## 发布 Windows 下载

在准备发布的提交上执行以下命令。打包脚本会构建 x64 NSIS 安装程序和便携 ZIP，在 `release/github/v<版本>/` 生成两个附件与 SHA-256 校验文件。两个包都包含项目许可证和第三方版权说明。

```powershell
npm ci
.\scripts\package-github-release.ps1
```

发布源码后，为同一提交打版本标签。以下以首次发布 `v0.3.0` 为例。确认版本和文件名与本次构建一致。

```powershell
git tag -a v0.3.0 -m 'Math Input v0.3.0'
git push origin refs/tags/v0.3.0
gh release create v0.3.0 --verify-tag --title 'Math Input v0.3.0' --generate-notes `
  ./release/github/v0.3.0/MathInput-0.3.0-win64-setup.exe `
  ./release/github/v0.3.0/MathInput-0.3.0-win64-portable.zip `
  ./release/github/v0.3.0/SHA256SUMS.txt
```
