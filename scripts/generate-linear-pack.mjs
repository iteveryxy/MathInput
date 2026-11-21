import { mkdir, writeFile } from 'node:fs/promises';
const p=(id,name,defaultValue)=>({id,name,description:name,defaultValue});
const s=(command,name,aliases,latex,parameters=[],wrapTarget)=>({id:command,command,aliases,name,description:`${name}，参数按列表顺序编辑`,latex,parameters,...(wrapTarget?{wrapTarget,preferSelection:true}:{})});
const cells=n=>Array.from({length:n*n},(_,i)=>p(String.fromCharCode(97+i),`第 ${Math.floor(i/n)+1} 行第 ${i%n+1} 列`,String.fromCharCode(97+i)));
const matrix=(environment,n)=>`\\begin{${environment}}`+Array.from({length:n},(_,r)=>Array.from({length:n},(_,c)=>`{{${String.fromCharCode(97+r*n+c)}}}`).join('&')).join('\\\\')+`\\end{${environment}}`;
const snippets=[
  s('mat2','二阶矩阵',['juzhen2','jz2'],matrix('pmatrix',2),cells(2)),
  s('mat3','三阶矩阵',['juzhen3','jz3'],matrix('pmatrix',3),cells(3)),
  s('det2','二阶行列式',['hanglieshi2','hls2'],matrix('vmatrix',2),cells(2)),
  s('det3','三阶行列式',['hanglieshi3','hls3'],matrix('vmatrix',3),cells(3)),
  s('bmat2','方括号矩阵',['fangkuohaojuzhen'],matrix('bmatrix',2),cells(2)),
  {...s('blockmat','分块矩阵',['fenkuaijuzhen','fkjz'],'\\left[\\begin{array}{c|c}{{a}}&{{b}}\\\\{{c}}&{{d}}\\end{array}\\right]',[p('a','左上块','A'),p('b','右上块','B'),p('c','左下块','C'),p('d','右下块','D')]),description:'使用竖向分隔和四个可编辑矩阵块；当前 MathLive 不支持横向 hline 分隔。'},
  s('rowvec','行向量',['hangxiangliang'],'\\begin{pmatrix}{{a}}&{{b}}&{{c}}\\end{pmatrix}',[p('a','第一分量','a'),p('b','第二分量','b'),p('c','第三分量','c')]),
  s('colvec','列向量',['liexiangliang'],'\\begin{pmatrix}{{a}}\\\\{{b}}\\\\{{c}}\\end{pmatrix}',[p('a','第一分量','a'),p('b','第二分量','b'),p('c','第三分量','c')]),
  s('transpose','转置',['trans','zhuanzhi','zz'],'\\left( {{matrix}} \\right)^{T}',[p('matrix','被转置的表达式','A')],'matrix'),
  s('inverse','逆矩阵',['inv','nijuzhen','njz'],'\\left( {{matrix}} \\right)^{-1}',[p('matrix','可逆矩阵或表达式','A')],'matrix'),
  s('adjugate','伴随矩阵',['bansui','bsjz'],'\\left( {{matrix}} \\right)^{*}',[p('matrix','矩阵','A')],'matrix'),
  s('trace','矩阵的迹',['tr','ji'],'\\operatorname{tr}\\left( {{matrix}} \\right)',[p('matrix','方阵','A')],'matrix'),
  s('rank','矩阵的秩',['zhi','juzhenzhi'],'\\operatorname{rank}\\left( {{matrix}} \\right)',[p('matrix','矩阵','A')],'matrix'),
  s('identity','单位矩阵',['danweijuzhen','dwjz'],'I_{ {{order}} }',[p('order','阶数','n')]),
  s('zeromat','零矩阵',['lingjuzhen','ljz'],'O'),
  s('matprod','矩阵乘积',['juzhenchengji'],'{{left}}\\,{{right}}',[p('left','左矩阵','A'),p('right','右矩阵','B')]),
  s('syst2','线性方程组',['fangchengzu','xxfcz'],'\\begin{cases}{{first}}\\\\{{second}}\\end{cases}',[p('first','第一条方程','x+y=1'),p('second','第二条方程','2x-y=0')]),
  s('eigeneq','特征值方程',['tezhengzhi','tzz'],'\\det\\left( {{matrix}}-{{value}} I \\right)=0',[p('matrix','方阵','A'),p('value','特征值','\\lambda')]),
  s('charpoly','特征多项式',['tezhengduoxiangshi'],'p(t)=\\det\\left( {{matrix}}-tI \\right)',[p('matrix','方阵','A')]),
  s('quadform','二次型',['ercixing','ecx'],'x^{T}{{matrix}}x',[p('matrix','二次型的矩阵','A')]),
  s('innerprod','内积',['neiji','nj'],'\\left\\langle {{left}},{{right}} \\right\\rangle',[p('left','左向量','u'),p('right','右向量','v')]),
  s('lincomb','向量组线性组合',['xianxingzuhe','xxzh'],'{{combination}}',[p('combination','线性组合表达式','c_1v_1+c_2v_2+\\cdots+c_nv_n')]),
  s('similarity','矩阵相似关系',['xiangsi','xs'],'{{matrix}}=P^{-1}{{similar}}P',[p('matrix','原矩阵','A'),p('similar','相似矩阵','B')]),
  s('orthogonal','正交矩阵关系',['zhengjiao','zj'],'{{relation}}',[p('relation','正交关系','Q^{T}Q=I')]),
  s('vector','向量箭头',['xiangliang','xl'],'\\overrightarrow{ {{vector}} }',[p('vector','向量或表达式','v')],'vector'),
  s('norm','范数',['fanshu'],'\\left\\lVert {{vector}} \\right\\rVert',[p('vector','向量或表达式','v')],'vector'),
  s('determinant','行列式运算',['det','hanglieshi'],'\\det\\left( {{matrix}} \\right)',[p('matrix','矩阵或表达式','A')],'matrix'),
];
const pack={schemaVersion:1,id:'linear-algebra',name:'线性代数',version:'1.0.0',author:'Math Input',description:'离线矩阵、行列式、矩阵运算及线性代数常用表达式。所有参数均使用同一 Prompt 运行机制。',snippets};
await mkdir('src/packs/examples',{recursive:true});
await writeFile('src/packs/examples/linear-algebra.mathpack.json',JSON.stringify(pack,null,2)+'\n','utf8');
console.log(`Generated ${snippets.length} linear algebra templates`);
