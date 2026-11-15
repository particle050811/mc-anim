import { describe, expect, it } from 'vitest';
import { checkTables, coreWords, parseGlossary, type Group, type Inputs } from './核表.ts';

const g = (id: string, kind: string, extra: Partial<Group> = {}): Group => {
  const file = id.split('#')[0]!;
  const name = id.split('#')[1]!.split('.').pop()!.replace(/~\d+$/, '').replace(/@\d+$/, '');
  return { id, name, kind, decl: { file, line: 1, col: 1 }, ...extra };
};

const glossary = parseGlossary(['段\tsegment|seg\t领域', '区段\tsection\t领域', '帧\tframe\t通用', '李樱\tliYing\t专名', '她\t-\t上下文'].join('\n'));

const run = (groups: Group[], table: string[], extra: Partial<Inputs> = {}) => {
  const keys = new Map(groups.map((x, i) => [`01-${String(i + 1).padStart(4, '0')}`, x.id]));
  const inp: Inputs = {
    groups: new Map(groups.map((x) => [x.id, x])),
    keys,
    outputs: [{ file: '批01-页1.tsv', text: table.join('\n'), expected: [...keys.keys()] }],
    rules: new Map(),
    glossary,
    ...extra,
  };
  return checkTables(inp).issues.map((i) => `${i.level} ${i.type} ${i.key || i.name}`);
};

describe('核表', () => {
  it('缺行、重复、认不出的行号、列数不对', () => {
    const gs = [g('a.ts#甲', '变量'), g('a.ts#乙', '变量')];
    const out = run(gs, ['01-0001\tfirstPart', '01-0001\tfirstPart', '01-0099\tghost', '01-0003']);
    expect(out).toEqual(expect.arrayContaining(['错 缺行 01-0002', '错 多余 01-0001', '错 多余 01-0099', '错 格式 01-0003']));
  });

  it('规则.tsv 定了的不该再交', () => {
    const gs = [g('a.ts#声0', '变量')];
    expect(run(gs, ['01-0001\tsoundZero'], { rules: new Map([['a.ts#声0', 'sound0']]) })).toContain('错 多余 01-0001');
  });

  it('非法标识符、保留字（属性上只警告）、严格模式不能绑定的名字', () => {
    const gs = [g('a.ts#甲', '变量'), g('a.ts#乙', '局部变量'), g('a.ts#型.丙', '属性'), g('a.ts#丁', '参数')];
    const out = run(gs, ['01-0001\tfirst-part', '01-0002\tclass', '01-0003\tdefault', '01-0004\targuments']);
    expect(out).toEqual(expect.arrayContaining(['错 非法标识符 01-0001', '错 关键字 01-0002', '警告 关键字 01-0003', '错 关键字 01-0004']));
  });

  it('黑名单形状；类型参数单字母放行；中文没数字的序号后缀只警告；vec3 这类不算', () => {
    const gs = [g('a.ts#她', '局部变量'), g('a.ts#物', '变量'), g('a.ts#数据二', '变量'), g('a.ts#f.型', '类型参数'), g('a.ts#头', '变量'), g('a.ts#转', '函数'), g('a.ts#用', '局部变量')];
    const out = run(gs, ['01-0001\tshe', '01-0002\tx1', '01-0003\tdata2', '01-0004\tT', '01-0005\theadPart2', '01-0006\ttoVec3', '01-0007\ta']);
    expect(out).toEqual(expect.arrayContaining(['错 黑名单 01-0001', '错 黑名单 01-0002', '错 黑名单 01-0003', '警告 序号后缀 01-0005', '错 黑名单 01-0007']));
    expect(out.filter((s) => / 01-000[46]$/.test(s))).toEqual([]);
  });

  it('大小写：类型要 PascalCase，函数要 camelCase', () => {
    const gs = [g('a.ts#型', '类型'), g('a.ts#算', '函数')];
    expect(run(gs, ['01-0001\tshotPlan', '01-0002\tComputeShot'])).toEqual(['警告 大小写 01-0001', '警告 大小写 01-0002']);
  });

  it('撞名：模块顶层和同类型属性报错，别的文件不算，函数里只警告，遮住顶层的警告', () => {
    const gs = [
      g('a.ts#甲', '变量'),
      g('a.ts#乙', '函数'),
      g('b.ts#丙', '变量'),
      g('a.ts#型.丁', '属性'),
      g('a.ts#型.戊', '属性'),
      g('a.ts#算.己', '局部变量'),
      g('a.ts#算.庚', '局部变量'),
    ];
    const out = run(gs, ['01-0001\tshotPlan', '01-0002\tshotPlan', '01-0003\tshotPlan', '01-0004\twidthPx', '01-0005\twidthPx', '01-0006\tstep', '01-0007\tstep']);
    expect(out).toEqual(
      expect.arrayContaining(['错 撞名 01-0001', '错 撞名 01-0002', '错 撞名 01-0004', '错 撞名 01-0005', '警告 可能撞名 01-0006', '警告 可能撞名 01-0007']),
    );
    expect(out.some((s) => s.endsWith('01-0003'))).toBe(false);
    const shadow = run([g('a.ts#甲', '变量'), g('a.ts#算.乙', '局部变量')], ['01-0001\tshotPlan', '01-0002\tshotPlan']);
    expect(shadow).toEqual(['警告 遮蔽 01-0002']);
  });

  it('同一中文名、同一个声明的多份（~2）拼成同名不算撞', () => {
    const gs = [g('a.ts#一', '局部变量'), g('a.ts#一~2', '局部变量')];
    expect(run(gs, ['01-0001\tfirstRun', '01-0002\tfirstRun'])).toEqual([]);
  });

  it('对照表：最长匹配，整名不对报错，复合词警告；专名分大小写', () => {
    expect(coreWords('区段长', glossary).map((e) => e.zh)).toEqual(['区段']);
    expect(coreWords('帧号', glossary)).toEqual([]);
    const gs = [g('a.ts#段', '变量'), g('a.ts#段长', '变量'), g('a.ts#区段', '变量'), g('a.ts#李樱位', '变量'), g('a.ts#帧', '变量')];
    const out = run(gs, ['01-0001\tpiece', '01-0002\tpieceLength', '01-0003\tsection', '01-0004\tliyingPos', '01-0005\tframe']);
    expect(out).toEqual(['错 对照表 01-0001', '警告 对照表 01-0002', '警告 对照表 01-0004']);
  });

  it('一词多译：领域词的几个译法混用、同一中文名拼法不一，各汇总一行', () => {
    const gs = [g('a.ts#段窗口', '变量'), g('b.ts#段键', '变量'), g('c.ts#机位表', '变量'), g('d.ts#机位表', '变量')];
    const out = run(gs, ['01-0001\tsegWindow', '01-0002\tsegmentKey', '01-0003\trigTable', '01-0004\tcameraTable']);
    expect(out).toEqual(['警告 一词多译 段', '警告 一词多译 机位表']);
  });

  it('全局名：遮住全局函数、全局类型的警告', () => {
    const gs = [g('a.ts#取', '函数'), g('a.ts#事', '类型')];
    expect(run(gs, ['01-0001\tfetch', '01-0002\tEvent'])).toEqual(['警告 全局名 01-0001', '警告 全局名 01-0002']);
  });

  it('Python：关键字报错，函数要 snake_case', () => {
    const gs = [g('x.py#类', '局部变量'), g('x.py#算帧', '函数')];
    const out = run(gs, ['01-0001\tclass', '01-0002\tcountFrames']);
    expect(out).toEqual(expect.arrayContaining(['错 关键字 01-0001', '警告 大小写 01-0002']));
  });
});
