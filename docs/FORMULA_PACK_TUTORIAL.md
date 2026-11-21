# 如何编写 JSON 公式包

本教程适用于 Math Input v0.3 的 Formula Pack JSON v1。你可以用记事本或代码编辑器编写文件，再从“设置 → 公式包”导入。公式包只描述数学模板，不执行程序，也不计算公式的值。

## 1. 先做一个能导入的公式包

新建 `my-math.mathpack.json`，将下面的内容完整复制进去，以 **UTF-8** 保存。注意文件名不要变成 `my-math.mathpack.json.txt`。

这个包包含三个公式：固定的勾股定理、可以填写分子分母的比值，以及支持智能包裹的转置。

```json
{
  "schemaVersion": 1,
  "id": "my-math",
  "name": "我的数学公式",
  "version": "1.0.0",
  "author": "你的名字",
  "description": "固定公式、可编辑参数和智能包裹示例",
  "snippets": [
    {
      "id": "pythagorean",
      "command": "mypyth",
      "aliases": ["gougu"],
      "name": "勾股定理",
      "description": "插入固定公式，不需要填写参数",
      "latex": "a^2+b^2=c^2",
      "parameters": []
    },
    {
      "id": "ratio",
      "command": "myratio",
      "aliases": ["bili"],
      "name": "比值",
      "description": "依次填写分子和分母",
      "latex": "\\frac{ {{numerator}} }{ {{denominator}} }",
      "parameters": [
        {
          "id": "numerator",
          "name": "分子",
          "description": "分数线上方的表达式",
          "defaultValue": "k+t"
        },
        {
          "id": "denominator",
          "name": "分母",
          "description": "分数线下方的表达式",
          "defaultValue": "n"
        }
      ],
      "wrapTarget": "numerator",
      "preferSelection": true
    },
    {
      "id": "transpose",
      "command": "mytrans",
      "aliases": ["myzhuanzhi"],
      "name": "转置",
      "description": "将表达式整体加括号后转置",
      "latex": "\\left( {{matrix}} \\right)^{T}",
      "parameters": [
        {
          "id": "matrix",
          "name": "待转置表达式",
          "description": "可以是矩阵或矩阵表达式",
          "defaultValue": "A"
        }
      ],
      "wrapTarget": "matrix",
      "preferSelection": true
    }
  ]
}
```

## 2. 理解包、公式和参数

最外层对象是一个公式包，`snippets` 数组中的每个对象是一条公式；公式里的 `parameters` 数组定义用户需要填写的参数。

| 包字段 | 怎么填写 |
| --- | --- |
| `schemaVersion` | 固定写数字 `1`，不是字符串 `"1"` |
| `id` | 包的稳定身份，例如 `my-math`；更新同一个包时保留它 |
| `name` | 管理器显示的名称，可以用中文 |
| `version` | 包内容版本，例如 `1.0.0`、`1.0.1`；与 Schema 版本分开 |
| `author` | 作者，可以写空字符串 `""` |
| `description` | 包的说明，可以写空字符串 |
| `snippets` | 公式对象数组；多条公式之间用英文逗号分隔 |

| 公式字段 | 怎么填写 |
| --- | --- |
| `id` | 包内唯一的公式身份，例如 `ratio` |
| `command` | 在编辑器里输入的缩写，例如 `myratio` |
| `aliases` | 其他输入缩写，例如 `["bili", "myfs"]`；没有就写 `[]` |
| `name` / `description` | 公式中文名称和用途说明 |
| `latex` | 数学模板，不包含外层 `$…$` 或 `$$…$$` |
| `parameters` | 参数定义；固定公式必须写空数组 `[]` |
| `wrapTarget` | 可选，智能包裹填入的参数 ID；不需要包裹就省略 |
| `preferSelection` | 可选，默认 `true`；优先使用显式数学选区 |

除最后两个可选字段外，上面列出的字段都要写。不要把 `enabled`、`packId`、`revision` 等本机状态加进文件；启用状态由管理器单独保存，未知字段会被拒绝。

`id` 和 `command` 是两回事：修改输入缩写时通常只改 `command`，保留 `id`。同一包内公式 ID 不能重复，不同包可以各有自己的 `ratio`。

## 3. 正确处理反斜杠

JSON 字符串中的一个反斜杠要写成两个。下面右列都是文件中实际填写的内容：

| 想表达的 LaTeX | JSON 的 `latex` 字段 |
| --- | --- |
| `\sqrt{x}` | `"latex": "\\sqrt{x}"` |
| `\frac{a}{b}` | `"latex": "\\frac{a}{b}"` |
| `\alpha+\beta` | `"latex": "\\alpha+\\beta"` |
| 矩阵中的换行 `\\` | 字符串内部写 `\\\\` |

不要把 `\frac` 直接写进 JSON 字符串：其中的 `\f` 会被 JSON 当作控制字符，而不是数学命令。文本中的双引号也需要转义为 `\"`。

JSON 使用英文双引号，不支持注释、单引号或末尾多余的逗号。模板字符串需要换行时，使用 JSON 转义 `\n`，不要直接在字符串中按回车。

## 4. 用槽位声明可编辑参数

模板中的 `{{numerator}}` 表示一个参数槽位，对应 `parameters` 中 `id` 为 `numerator` 的对象。参数必须有 `id`、`name`、`description` 和 `defaultValue` 四个字段；说明可以为空，名称和默认值不能为空。

示例比值插入后默认是分子 `k+t`、分母 `n`。首次选中分子的全部默认内容，直接输入即可整体替换；Tab 进入下一参数，Enter 提前结束当前模板并保留剩余默认值。

规则如下：

- 每个参数在模板里必须恰好出现一次，槽位名与参数 ID 完全一致。
- 不能只写槽位而不声明参数，也不能声明未使用的参数。
- `parameters` 的数组顺序就是 Tab 导航顺序，可以与模板中的位置顺序不同。
- 默认值是实际数学内容，例如 `x`、`k+t` 或 JSON 中的 `"\\sqrt{x}"`，不要写“请输入分子”。默认值不能再声明槽位。
- v1 不支持一个参数控制多处相同槽位。需要两个可分别编辑的位置时，使用两个参数 ID。

分式可以写成更容易看清的 `\frac{ {{numerator}} }{ {{denominator}} }`，也可以写成紧凑形式 `\frac{{{numerator}}}{{{denominator}}}`。三层花括号来自“普通 LaTeX 分组 + 双花括号槽位”，不是另一种槽位语法。

## 5. 配置 Shift+Enter 智能包裹

`wrapTarget` 必须指向已声明的参数。例如转置公式写 `"wrapTarget": "matrix"`，选中的数学表达式就会填入 `matrix` 槽位。

使用示例转置：在正式编辑器选中 `A+B`，通过“命令”按钮或 Ctrl+Space 打开候选，选择 `mytrans`，按 Shift+Enter，结果应为 `(A+B)^T` 对应的数学表达式。保留模板中的 `\left( ... \right)`，可以让转置作用于整个和式。

`preferSelection: true` 表示优先包裹显式选区；没有显式选区时按现有智能包裹规则处理左侧数学项。设为 `false` 则优先取当前层级左侧数学项。该设置不替你添加括号，运算优先级仍要在模板中表达清楚。

## 6. 添加一个矩阵公式

下面是一条完整的公式对象。把它加入包的 `snippets` 数组，与前一条对象之间加逗号；不要把它当成完整公式包单独导入。

```json
{
  "id": "matrix-2x2",
  "command": "mymat",
  "aliases": ["myjuzhen"],
  "name": "二阶矩阵",
  "description": "按第一行、第二行的顺序编辑四个元素",
  "latex": "\\begin{pmatrix}{{a}}&{{b}}\\\\{{c}}&{{d}}\\end{pmatrix}",
  "parameters": [
    {"id": "a", "name": "左上元素", "description": "第 1 行第 1 列", "defaultValue": "a"},
    {"id": "b", "name": "右上元素", "description": "第 1 行第 2 列", "defaultValue": "b"},
    {"id": "c", "name": "左下元素", "description": "第 2 行第 1 列", "defaultValue": "c"},
    {"id": "d", "name": "右下元素", "description": "第 2 行第 2 列", "defaultValue": "d"}
  ]
}
```

`&` 分隔列，LaTeX 的 `\\` 分隔行，所以 JSON 文件中行分隔符需要四个反斜杠。这个矩阵的 Tab 顺序为 a → b → c → d。

当前交付示例采用 `pmatrix`、`bmatrix`、`vmatrix`、`array` 和 `cases` 等表示。不要假定任意 LaTeX 环境都可用：当前版本不支持 `\hline`，分块矩阵示例使用 `array` 的竖向分隔。可以参考项目中的 [27 条线性代数示例](../src/packs/examples/linear-algebra.mathpack.json)。

## 7. 导入并实际测试

1. 在“设置 → 公式包”点击“导入公式包”，选择保存的文件；也可以使用“粘贴 JSON 导入”。
2. 点击“校验并预览”，检查数量、数学预览和冲突提示，再确认导入。
3. 确认包的启用复选框已勾选。禁用包的命令不会参与新补全。
4. 返回编辑器，输入 `mypyth`，按 Enter 接受固定模板。
5. 输入 `myratio`，接受模板后将分子替换为 `7`，按 Tab 将分母替换为 `9`，再按 Enter 完成模板。补全接受、模板结束和整式提交分别占用各自的 Enter，不要误把完成模板当成提交。
6. 编辑公式并点击“测试公式”，在独立测试区验证默认值替换、Tab 顺序、Enter 提前结束和包裹；正式草稿不会被测试区覆盖。
7. 通过“导出 JSON”备份，重新导入时检查内容是否一致。

更新同一个包时保留包 ID、修改 `version`；导入时需要明确勾选“替换现有公式包”，原启用状态会保留。想创建独立副本则使用新的包 ID。不能替换只读的 `basic-math` 基础包。

多个公式匹配同一命令、别名或名称时，可在候选中按公式包来源选用。自己的命令可以加 `my` 等前缀，也可以在界面中重命名。命令和拼音别名使用小写英文字母、数字。

## 8. 常见报错

| 报错或现象 | 检查方法 |
| --- | --- |
| JSON 解析失败 | 检查英文双引号、反斜杠、逗号和字符串中的真实换行 |
| `$.schemaVersion` 报错 | 写数字 `1`，不要写应用版本 `0.3.0` |
| ID 非法或重复 | 包/公式 ID 使用小写字母开头，仅含小写字母、数字、短横线；包内公式 ID 唯一 |
| 命令或别名非法 | 小写字母开头，仅含小写字母和数字；不能有空格、中文或短横线 |
| 参数 ID 非法 | 小写字母开头，仅含小写字母、数字、下划线 |
| 槽位缺少参数或出现次数不对 | 逐一核对 `{{id}}` 和参数声明；每个参数恰好一个槽位 |
| `wrapTarget` 无效 | 使用参数的 ID，不是参数中文名称 |
| 数学解析失败 | 检查命令拼写、花括号和 begin/end 环境；当前解析器不支持所有 LaTeX |
| 导入后没有候选 | 检查包是否启用、是否存在解析异常状态、缩写是否正确 |
| 未知字段被拒绝 | 删除不属于 v1 规范的字段，不要自行增加插件或状态字段 |

错误位置中的数组下标从 0 开始。例如 `$.snippets[1].parameters[0].id` 指“第二条公式的第一个参数 ID”。

## 9. 大小与安全限制

单个文件最多 **256 KiB**，每包最多 **128 条公式**，每公式最多 **24 个参数、24 个别名**；LaTeX 模板最多 **8192 字符**，参数默认值最多 **2048 字符**，默认值展开后仍须满足模板长度与嵌套限制。包/公式 ID 最多 64 字符，命令/别名最多 40 字符，参数 ID 最多 32 字符。JSON 嵌套最多 16 层，LaTeX 花括号深度最多 32 层。

不要在模板中加入 HTML、链接、图片、文件访问、宏定义或脚本命令；`href`、`input`、`def`、`placeholder`、`color` 等命令均不接受。写槽位即可，运行时 Prompt 由应用生成。包作者不需要也不能用公式包调用系统接口。

完整字段限制与兼容规则见 [公开规范](FORMULA_PACK_SPEC.md)，机器可读的结构定义见 [JSON Schema](formula-pack.schema.json)。也可以先在 GUI 创建一个公式并导出，作为自己编写 JSON 的起点。
