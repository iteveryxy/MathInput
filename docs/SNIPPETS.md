# 模板定义与扩展

内置配置位于 `src/snippets/BuiltinSnippets.ts`，结构声明在 `src/snippets/types.ts`。

```ts
const example: Snippet = {
  id: 'sqrt',
  command: 'sqrt',
  aliases: ['genhao', 'gh'],
  name: '平方根',
  description: '对一个数学项取平方根',
  latex: '\\sqrt{ {{radicand}} }',
  parameters: [{
    id: 'radicand',
    name: '被开方数',
    description: '根号内部的表达式',
    defaultValue: 'x',
  }],
  wrapTarget: 'radicand',
};
```

`parameters` 的数组顺序就是导航顺序，与参数在 TeX 字符串中的物理顺序无关。`{{id}}` 为声明式槽位；注册器检查槽位、参数 ID 和包裹目标是否一致。参数默认值是正常 LaTeX，不是提示文字。

接受命令时，PlaceholderManager 为每个实例生成唯一 Prompt ID，并在外层再加一个模板锚点。选择 `getPromptRange(id)` 的整个正文范围实现“开始输入就替换全部默认值”。外层锚点让模板结束位置不依赖固定数字偏移。

完成时，读取当前模板的真实内容，递归移除临时 Prompt 标记，再通过一次公开 `insert()` 替换该模板；外层模板的其他 Prompt 身份不会被改变。用户内容、未填写默认值和内部公式都保留。会话栈记录每层的模板、参数 ID 和当前索引；撤销时结合正文快照恢复会话。

添加模板的步骤：

1. 在内置配置数组中添加声明，或在初始化中调用 `registry.register()`。
2. 用静态预览确认默认 LaTeX。
3. 添加真实 UI 测试，验证默认值整体覆盖、Tab 顺序、Enter 提前结束、嵌套和导出。
4. 如模板引入新数学容器，为公开结构投影添加对应回归用例。

设置页中的用户自定义目前只支持**别名**，保存在本机；任意新模板通过源码声明扩展。第一版没有执行用户脚本、远程模板或网络同步功能。
