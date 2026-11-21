# Formula Pack JSON v1

适用版本：Math Input 0.3.0，MathLive 0.110.0。公式包是离线静态数据，推荐文件名 `名称.mathpack.json`，也接受普通 `.json`；使用 UTF-8。不会加载脚本、宏插件或网络资源。

## 完整示例

```json
{
  "schemaVersion": 1,
  "id": "my-ratios",
  "name": "我的分式",
  "version": "1.0.0",
  "author": "本机用户",
  "description": "可编辑的双参数分式",
  "snippets": [{
    "id": "ratio",
    "command": "myratio",
    "aliases": ["bili"],
    "name": "比值",
    "description": "依次编辑分子、分母",
    "latex": "\\frac{{{numerator}}}{{{denominator}}}",
    "parameters": [
      {"id":"numerator","name":"分子","description":"分数线上方","defaultValue":"k+t"},
      {"id":"denominator","name":"分母","description":"分数线下方","defaultValue":"n"}
    ],
    "wrapTarget": "numerator",
    "preferSelection": true
  }]
}
```

其中 `\frac{{{numerator}}}` 是一个普通 LaTeX 内容组包着 `{{numerator}}` 槽位；也可写成更易读的 `\frac{ {{numerator}} }{ {{denominator}} }`。GUI 的“添加参数并插入槽位”会关联槽位和参数，重命名参数会同步修改槽位。槽位替换会保留 TeX 控制词与相邻字母的分界。

## 字段与上限

所有包字段均必需，作者和描述可以是空字符串。公式的 `wrapTarget`、`preferSelection` 可省略，其余公式字段均必需。空参数数组表示固定模板。

| 字段 | 规则 |
| --- | --- |
| schemaVersion | 必须为整数 1；未来版本明确拒绝，留待显式迁移 |
| 包 / 公式 id | `^[a-z][a-z0-9-]{0,63}$`；公式 ID 在包内唯一，包 ID 在本机唯一 |
| version | 三段数字 major.minor.patch，每段最多 5 位 |
| name / author / description | 分别最多 80 / 120 / 1000 字符；名称非空 |
| command | `^[a-z][a-z0-9]{0,39}$` |
| aliases | 最多 24 个，格式同 command，同一数组不得重复 |
| snippets | 最多 128 条；允许空包 |
| parameters | 最多 24 个，数组顺序就是 Tab 顺序 |
| 参数 id | `^[a-z][a-z0-9_]{0,31}$`；同一公式内唯一 |
| 参数名称 / 说明 / 默认值 | 最多 80 / 500 / 2048 字符；名称和默认值非空 |
| latex | 非空，最多 8192 字符，花括号深度最多 32；展开默认值后仍须满足这两个上限 |
| wrapTarget | 已声明参数 ID；省略表示不启用包裹 |
| preferSelection | 布尔值，默认 true；false 表示优先取当前层级左侧数学项 |
| 文件 | 最多 256 KiB，JSON 对象/数组嵌套最多 16 层 |
| 本地库 | 最多 32 个用户包，紧凑 JSON 最多 8 MiB |

每个参数必须**恰好出现一次**，使用完整的 `{{parameter_id}}` 槽位。v1 不提供同名参数的多处同步绑定；需要重复符号时可在固定表达式里写入，或声明不同参数。默认值不能再次声明槽位。包 ID 不用于拼接用户目录或文件路径。

不认识的字段会连同错误位置一起拒绝，不能当作“兼容”静默删除。机器可读结构见 `formula-pack.schema.json`；唯一 ID、槽位、深度、宏安全和 MathLive 解析由语义校验器补充。

## 校验和安全

顺序为文件字节限制、JSON 解析、结构与字段校验、槽位/默认值/包裹目标校验、当前 MathLive 的公开 `errors` 检查，然后才允许提交。错误显示为 `$.snippets[0].parameters[1].id: ...` 等路径。Rust 写入边界再次执行结构、数量、深度和命令安全校验。

LaTeX 中禁止 HTML 标签、URL/HTML/CSS 命令、用户宏定义、文件读写、外部图片、系统命令和内部 Prompt 命令；包括 href、input、def、htmlClass、style、placeholder 等。v1 也不接受 color/textcolor/colorbox 等样式模板命令。元数据通过 DOM textContent 显示，含 HTML 的名称只显示字面文字。数学预览只保留生成的数学标签，并剔除事件、链接、URL 属性；预览容器限制绘制范围。

不支持的 LaTeX 会阻止新导入或保存。已存用户包若遇到当前解析器不支持的表达式，会保留原数据并标记“解析异常，已隔离”，不参与新补全；仍可查看、导出、编辑修复或确认删除。不会访问 MathLive 私有对象。

## 命令冲突

相同命令和别名可以存在，但**不会覆盖公式**。管理器和导入预览显示名称及来源；补全保留全部匹配候选并标注来源。

完全匹配冲突时基础数学优先；同级沿用命令/别名匹配分数，再按稳定的注册顺序：基础数学、我的公式、其余包 ID、包内声明顺序。前缀匹配沿用原 CompletionEngine 的分数。相似前缀本身不是冲突。本机设置中的附加别名也参与冲突检查；内置公式继续使用旧 ID，自定义公式使用 `pack-id:snippet-id` 身份。

可通过修改自定义公式的命令、别名，或禁用来源包消除冲突。基础数学不可编辑、删除或替换；导出后可在导入预览更换包 ID，建立自己的副本。同 ID 用户包替换必须显式勾选，替换后保留原启用状态。

## 持久化与更新

Windows 使用 Tauri 应用配置目录中的 `formula-packs.json`。包、启用状态和 revision 一并提交，Rust 互斥锁及修订号检查阻止旧状态覆盖新状态。临时文件写入并 sync_all 后同目录重命名；原文件保持到提交成功。第二次及以后的保存还会生成上一成功状态的 `formula-packs.backup.json`。

损坏或未来版本的库不会被空库覆盖。管理器可确认“从本地备份恢复”，先另存当前损坏文件，再恢复有效备份。第一次保存尚无上一状态备份，应使用导出建立额外备份。浏览器预览使用同源 localStorage 原子键、Web Locks 和备份键；桌面产品使用 Rust 文件存储。

应用标识和旧 settings/draft/result 存储键保持不变。基础包来自应用；首次没有公式库时提供空的“我的公式”和默认禁用的线性代数示例。以后启动优先读取用户库，不用新示例覆盖用户编辑，也不会自动重新安装已删除的包。

## 当前数学支持边界

交付的线性代数包共有 27 条模板，矩阵、行列式、cases 方程组、转置、逆矩阵、范数等均使用同一个 Prompt 机制。分块矩阵使用 `array` 的竖向分隔；当前 MathLive 的 `\hline` 会产生 unknown-command，故不承诺横向分块线。公式模板提供表示与编辑，不执行代数运算，也不扩展 v0.2 对矩阵的结构化选区/配对语义。
