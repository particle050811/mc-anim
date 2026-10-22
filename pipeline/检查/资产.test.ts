import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 基础, 跑, 造仓库 } from './测试夹具.ts';
import { SPDX合法, 包清单, 通配 } from './规则/资产.ts';

const 表 = (...条: Record<string, string>[]) =>
  条.map((e) => ['[["资产"]]', ...Object.entries(e).map(([k, v]) => `${k === 'id' ? k : `"${k}"`} = "${v}"`)].join('\n')).join('\n\n');
const 条 = (id: string, 可见性 = '公开', 许可 = 'MIT') => ({ id, 类别: id.split('/')[0]!, 来源: '手工:测试', 许可, 可见性 });
const 锁条 = (sha: string, 库 = 'store', 大小 = 3) => ({ sha256: sha, 后缀: '.png', 大小, 库 });
const sha = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');

/** 数据根：store/<前2>/<sha> 放字节、terrain/<名>/<版本>/ 放地形包 */
const 造数据根 = (字节: Record<string, string>, 地形: Record<string, string>) => {
  const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-检查数据根-'));
  for (const [库, 内容] of Object.entries(字节)) {
    const h = sha(内容);
    fs.mkdirSync(path.join(根, 库, h.slice(0, 2)), { recursive: true });
    fs.writeFileSync(path.join(根, 库, h.slice(0, 2), h), 内容);
  }
  for (const [p, 内容] of Object.entries(地形)) {
    fs.mkdirSync(path.dirname(path.join(根, 'terrain', p)), { recursive: true });
    fs.writeFileSync(path.join(根, 'terrain', p), 内容);
  }
  return 根;
};

describe('资产', () => {
  it('合规样例放行：代码 asset: 引公开资产、私有配音只走 cue、角色包引用都对上、许可待定只记数', async () => {
    const 根 = 造仓库(基础(), {
      'assets/registry/贴图.toml': 表(条('贴图/甲'), 条('贴图/李樱-脸', '公开', 'LicenseRef-待定')),
      'assets/registry/配音.toml': 表(条('配音/甲', '私有', 'LicenseRef-用户保留')),
      'assets/资产锁.json': JSON.stringify({ '贴图/甲': 锁条('a'.repeat(64)), '贴图/李樱-脸': 锁条('b'.repeat(64)), '配音/甲': 锁条('c'.repeat(64), '私有') }),
      '作品/应力转动/段/7-甲/段.ts':
        "import { 定义段 } from '@engine/段/段定义.ts';\nexport default 定义段({ 场: '7-场一', 帧数: 10, fps: 24, 宽: 4, 高: 4, 地形: [], 声音: [{ 帧: 0, 资产: '配音/甲' }] });\n",
      'assets/kits/李樱.toml': [
        '"角色" = "李樱"',
        '[["基准"]]',
        '"用途" = "脸"',
        '"资产" = "贴图/李樱-脸"',
        '[["资产组"]]',
        '"用途" = "全部贴图"',
        '"匹配" = ["贴图/李樱-*"]',
        '"文字源" = ["作品/应力转动/旧名.tsv"]',
        '[["代码"]]',
        '"新位置" = "库/角色/李樱.tsx"',
      ].join('\n'),
    });
    const { 违规, 报 } = await 跑('资产', 根);
    expect(违规).toEqual([]);
    expect(报.信息).toContain('1 件许可待定（见 assets/待确认.md）');
    expect(报.待迁移.map((q) => q.文本)).toEqual(['角色包 李樱 的代码 库/角色/李樱.tsx 还没搬']);
  });

  it('私有资产 import 块顶上标了「待迁移（私有资产）」的算待迁移，没标的、隔了别的行的照拦', async () => {
    const 根 = 造仓库(基础(), {
      'assets/registry/贴图.toml': 表(条('贴图/甲'), 条('贴图/私', '私有'), 条('贴图/私二', '私有')),
      'assets/资产锁.json': JSON.stringify({ '贴图/甲': 锁条('a'.repeat(64)), '贴图/私': 锁条('d'.repeat(64), '私有'), '贴图/私二': 锁条('e'.repeat(64), '私有') }),
      '作品/应力转动/段/7-甲/画面.tsx': [
        '// 待迁移（私有资产）：M5 改走 cue',
        "import 图 from 'asset:贴图/甲';",
        "import 私 from 'asset:贴图/私';",
        '// 别的说明',
        "import 私二 from 'asset:贴图/私二';",
        'export default () => <img src={图 + 私 + 私二} />;',
        '',
      ].join('\n'),
    });
    const { 违规, 报 } = await 跑('资产', 根);
    expect(报.待迁移.map((q) => q.文本)).toContain('作品/应力转动/段/7-甲/画面.tsx 还把私有资产 asset:贴图/私 打进包里（M5 改走 cue）');
    expect(违规.join('\n')).toMatch(/公开构建的闭包里不能有私有资产：作品\/应力转动\/段\/7-甲\/画面.tsx import 了 asset:贴图\/私二/);
    expect(违规.join('\n')).not.toMatch(/import 了 asset:贴图\/私（/);
  });

  it('没登记、私有进画面、许可不合规、锁和表对不上、库放错、角色包对不上都拦', async () => {
    const 根 = 造仓库(基础(), {
      'assets/registry/贴图.toml': 表(条('贴图/甲'), 条('贴图/乙', '公开', 'MIT 或 GPL'), 条('贴图/私', '私有')),
      'assets/资产锁.json': JSON.stringify({ '贴图/甲': 锁条('a'.repeat(64)), '贴图/私': 锁条('d'.repeat(64)), '贴图/孤': 锁条('e'.repeat(64)) }),
      '作品/应力转动/段/7-甲/画面.tsx': "import 图 from 'asset:贴图/甲';\nimport 私 from 'asset:贴图/私';\nimport 无 from 'asset:贴图/没登记';\nexport default () => <img src={图 + 私 + 无} />;\n",
      '作品/应力转动/段/7-甲/段.ts': "import { 定义段 } from '@engine/段/段定义.ts';\nexport default 定义段({ 场: '7-场一', 帧数: 10, fps: 24, 宽: 4, 高: 4, 地形: ['没登记的包'] });\n",
      'assets/kits/九胡.toml': ['"角色" = "九胡"', '[["资产组"]]', '"用途" = "模型"', '"匹配" = ["模型/九胡-*"]', '"文字源" = ["docs/没有.md"]'].join('\n'),
    });
    const v = (await 跑('资产', 根)).违规.join('\n');
    expect(v).toMatch(/「贴图\/乙」的许可「MIT 或 GPL」不是 SPDX 表达式/);
    expect(v).toMatch(/「贴图\/乙」登记了但不在资产锁里/);
    expect(v).toMatch(/「贴图\/私」可见性是 私有，资产锁里却在 store 库/);
    expect(v).toMatch(/资产锁里的「贴图\/孤」没在资产表登记/);
    expect(v).toMatch(/作品\/应力转动\/段\/7-甲\/画面.tsx asset:引用的「贴图\/没登记」没在资产表登记/);
    expect(v).toMatch(/公开构建的闭包里不能有私有资产：作品\/应力转动\/段\/7-甲\/画面.tsx import 了 asset:贴图\/私/);
    expect(v).toMatch(/7-甲 用的地形包「没登记的包」没在 assets\/地形版本.json 登记/);
    expect(v).toMatch(/角色包 九胡「模型」的匹配 模型\/九胡-\* 一件也没对上/);
    expect(v).toMatch(/角色包 九胡「模型」的文字源 docs\/没有.md 不在仓库里/);
  });

  it('--深：库里字节和地形包按 sha 核对，对得上放行、改过就拦', async () => {
    const 数据根 = 造数据根({ store: 'abc' }, { '古城/v1/a.bin': '1', '古城/v1/子/b.bin': '22' });
    try {
      const 清单 = await 包清单(path.join(数据根, 'terrain', '古城', 'v1'));
      expect(清单.文件数).toBe(2);
      const 仓库 = () =>
        造仓库(基础(), {
          'assets/资产锁.json': JSON.stringify({ '贴图/甲': 锁条(sha('abc')) }),
          'assets/地形版本.json': JSON.stringify({ 包: { 古城: { 版本: 'v1', ...清单, 许可: 'LicenseRef-用户保留', 可见性: '私有' } } }),
        });
      const 好 = await 跑('资产', 仓库(), { 深: true, 数据根 });
      expect(好.违规).toEqual([]);
      expect(好.报.信息.at(-1)).toMatch(/深查：1 个库对象、1 个地形包/);

      const h = sha('abc');
      const f = path.join(数据根, 'store', h.slice(0, 2), h);
      fs.writeFileSync(f, 'abd');
      fs.writeFileSync(path.join(数据根, 'terrain', '古城', 'v1', 'a.bin'), '9');
      const v = (await 跑('资产', 仓库(), { 深: true, 数据根 })).违规.join('\n');
      expect(v).toMatch(/「贴图\/甲」库里的字节 sha256 是 .{12}，资产锁记的是 ba7816bf8f01/);
      expect(v).toMatch(/地形包 古城\/v1 和 assets\/地形版本.json 记的不一致/);
    } finally {
      fs.rmSync(数据根, { recursive: true, force: true });
    }
  });

  it('取地形包的段（闭包里有 区段包位置.ts）写到的登记包名都要在 段.地形 里；不取地形的段写到了也不管', async () => {
    const 地形表 = JSON.stringify({ 包: { 主世界: { 版本: 'v1', 许可: 'MIT', 可见性: '发布' }, 暮色: { 版本: 'v2', 许可: 'MIT', 可见性: '发布' } } });
    const 文件 = (地形: string) => ({
      'assets/地形版本.json': 地形表,
      'engine/voxel/区段包位置.ts': "export const packDir = (名: string) => `terrain/${名}`;\n",
      '作品/应力转动/地点/名.ts': "export const 主世界名 = '主世界';\nexport const 暮色名 = '暮色';\n",
      '作品/应力转动/段/7-甲/段.ts': `import { 定义段 } from '@engine/段/段定义.ts';\nexport default 定义段({ 场: '7-场一', 帧数: 10, fps: 24, 宽: 4, 高: 4, 地形: ${地形} });\n`,
      '作品/应力转动/段/7-甲/画面.tsx':
        "import 图 from 'asset:贴图/甲';\nimport { packDir } from '@engine/voxel/区段包位置.ts';\nimport { 主世界名 } from '../../地点/名.ts';\nexport default () => <img src={图 + packDir(主世界名)} />;\n",
    });
    expect((await 跑('资产', 造仓库(基础(), 文件('["主世界"]')))).违规.filter((x) => x.includes('地形')).join('\n')).toMatch(/7-甲 的闭包会取地形包.*写到了 暮色/);
    expect((await 跑('资产', 造仓库(基础(), 文件('["主世界", "暮色"]')))).违规).toEqual([]);
    const 不取 = 文件('[]');
    不取['作品/应力转动/段/7-甲/画面.tsx'] = "import 图 from 'asset:贴图/甲';\nimport { 主世界名 } from '../../地点/名.ts';\nexport default () => <img src={图 + 主世界名} />;\n";
    expect((await 跑('资产', 造仓库(基础(), 不取))).违规).toEqual([]);
  });

  it('SPDX 表达式和角色包通配', () => {
    for (const ok of ['MIT', 'CC-BY-4.0', 'LicenseRef-用户保留', 'GPL-2.0-only WITH Classpath-exception-2.0', '(MIT OR Apache-2.0) AND CC0-1.0']) expect(SPDX合法(ok)).toBe(true);
    for (const bad of ['', 'MIT OR', '(MIT', 'MIT GPL', 'MIT 或 GPL', 'AND']) expect(SPDX合法(bad)).toBe(false);
    expect(通配('模型/李樱-*').test('模型/李樱-手/左')).toBe(true);
    expect(通配('贴图/?').test('贴图/甲')).toBe(true);
    expect(通配('贴图/?').test('贴图/甲乙')).toBe(false);
  });
});
