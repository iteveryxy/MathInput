import type { Snippet, SnippetParameter } from './types';

const p = (id: string, name: string, defaultValue: string, description: string): SnippetParameter =>
  ({ id, name, defaultValue, description });

export const BUILTIN_SNIPPETS: Snippet[] = [
  { id: 'sqrt', command: 'sqrt', aliases: ['root', 'genhao', 'gh', 'pingfanggen'], name: '平方根', description: '对一个数学项取平方根', latex: '\\sqrt{ {{radicand}} }', parameters: [p('radicand', '被开方数', 'x', '根号内部的表达式')], wrapTarget: 'radicand' },
  { id: 'frac', command: 'frac', aliases: ['fraction', 'fenshu', 'fs'], name: '分式', description: '插入分子与分母', latex: '\\frac{ {{numerator}} }{ {{denominator}} }', parameters: [p('numerator', '分子', 'x', '分数线上方的表达式'), p('denominator', '分母', 'y', '分数线下方的表达式')], wrapTarget: 'numerator' },
  { id: 'pow', command: 'pow', aliases: ['power', 'zhishu', 'zs', 'mici'], name: '幂 / 指数', description: '为底数添加指数', latex: '{ {{base}} }^{ {{exponent}} }', parameters: [p('base', '底数', 'x', '进行乘方的底数'), p('exponent', '指数', '2', '底数的幂次')], wrapTarget: 'base' },
  { id: 'sum', command: 'sum', aliases: ['sigma', 'qiuhe', 'qh'], name: '求和', description: '带上下界的累加式', latex: '\\sum_{ {{variable}} = {{start}} }^{ {{end}} } {{body}}', parameters: [p('variable', '求和变量', 'i', '随每次求和递增的索引'), p('start', '起点', 'k', '索引的初始值'), p('end', '终点', 'k+t', '索引的终止值，包含在求和内'), p('body', '求和表达式', 'x_i', '每一步需要相加的表达式')], wrapTarget: 'body' },
  { id: 'lim', command: 'lim', aliases: ['limit', 'jixian', 'jx'], name: '极限', description: '变量趋近某值时的极限', latex: '\\lim_{ {{variable}} \\to {{target}} } {{body}}', parameters: [p('variable', '趋近变量', 'x', '发生变化的变量'), p('target', '趋近值', '0', '变量所趋近的值'), p('body', '函数表达式', '\\frac{\\sin x}{x}', '需要求极限的表达式')], wrapTarget: 'body' },
  { id: 'int', command: 'int', aliases: ['integral', 'jifen', 'jf'], name: '定积分', description: '带上下限与积分变量', latex: '\\int_{ {{lower}} }^{ {{upper}} } {{body}} \\, \\mathrm{d} {{variable}}', parameters: [p('lower', '下限', 'a', '积分区间的起点'), p('upper', '上限', 'b', '积分区间的终点'), p('body', '被积函数', 'f(x)', '需要积分的表达式'), p('variable', '积分变量', 'x', '微分对应的变量')], wrapTarget: 'body' },
  ...(['sin', 'cos', 'tan'] as const).map((command, i): Snippet => ({ id: command, command, aliases: [['zhengxian', 'zx'], ['yuxian', 'yx'], ['zhengqie', 'zq']][i], name: ['正弦函数', '余弦函数', '正切函数'][i], description: '插入三角函数及其参数', latex: `\\${command}\\left( {{argument}} \\right)`, parameters: [p('argument', '函数参数', 'x', '传入三角函数的角度或表达式')], wrapTarget: 'argument' })),
  ...(['alpha', 'beta', 'theta', 'pi'] as const).map((command, i): Snippet => ({ id: command, command, aliases: [['aerfa'], ['beita'], ['xita'], ['pai', 'yp']][i], name: ['阿尔法', '贝塔', '西塔', '圆周率'][i], description: '插入常用希腊字母', latex: `\\${command}`, parameters: [] })),
];
