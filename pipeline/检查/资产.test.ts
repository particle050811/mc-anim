import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { base, runRule, makeRepo } from './测试夹具.ts';
import { isSpdxValid, packManifest, globToRegex } from './规则/资产.ts';

const makeAssetTable = (...rows: Record<string, string>[]) =>
  rows.map((e) => ['[["资产"]]', ...Object.entries(e).map(([k, v]) => `${k === 'id' ? k : `"${k}"`} = "${v}"`)].join('\n')).join('\n\n');
const assetRow = (id: string, visibility = '公开', license = 'MIT') => ({ id, 类别: id.split('/')[0]!, 来源: '手工:测试', 许可: license, 可见性: visibility });
const lockEntry = (sha: string, storage = 'store', byteSize = 3) => ({ sha256: sha, 后缀: '.png', 大小: byteSize, 库: storage });
const sha = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');

/** 数据根：store/<前2>/<sha> 放字节、terrain/<名>/<版本>/ 放地形包 */
const makeDataRoot = (bytesByLib: Record<string, string>, terrainFiles: Record<string, string>) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-检查数据根-'));
  for (const [storage, content] of Object.entries(bytesByLib)) {
    const h = sha(content);
    fs.mkdirSync(path.join(dataRoot, storage, h.slice(0, 2)), { recursive: true });
    fs.writeFileSync(path.join(dataRoot, storage, h.slice(0, 2), h), content);
  }
  for (const [p, content] of Object.entries(terrainFiles)) {
    fs.mkdirSync(path.dirname(path.join(dataRoot, 'terrain', p)), { recursive: true });
    fs.writeFileSync(path.join(dataRoot, 'terrain', p), content);
  }
  return dataRoot;
};

describe('资产', () => {
  it('音频条目的锁里没量过时长要报，量过的和非音频不报', async () => {
    const root = makeRepo(base(), {
      'assets/registry/音效.toml': makeAssetTable(assetRow('音效/没量'), assetRow('音效/量过'), assetRow('贴图/图')),
      'assets/资产锁.json': JSON.stringify({
        '音效/没量': { ...lockEntry('a'.repeat(64)), 后缀: '.wav' },
        '音效/量过': { ...lockEntry('b'.repeat(64)), 后缀: '.wav', 时长: 1.5 },
        '贴图/图': { ...lockEntry('c'.repeat(64)), 后缀: '.png' },
      }),
    });
    const { violations } = await runRule('assets', root);
    expect(violations.join('\n')).toMatch(/1 件音频的锁里没有时长、峰值、响度（如 音效\/没量）/);
  });

  it('wasm/区段解码.ts 改了没重编要报（生成文件记的源码 sha 对不上），对得上放行', async () => {
    const genSource = (sourceText: string) => `export const sourceSha256 = '${sha(sourceText)}';\nexport const wasmBase64 = '';\n`;
    const cleanResult = await runRule('assets', makeRepo(base(), { 'wasm/区段解码.ts': 'a\n', 'engine/voxel/区段解码器.生成.ts': genSource('a\n') }));
    expect(cleanResult.violations.filter((e) => e.includes('anim world decoder'))).toEqual([]);
    const badRun = await runRule('assets', makeRepo(base(), { 'wasm/区段解码.ts': 'b\n', 'engine/voxel/区段解码器.生成.ts': genSource('a\n') }));
    expect(badRun.violations.join('\n')).toMatch(/anim world decoder 重编/);
  });
  it('合规样例放行：代码 asset: 引公开资产、私有配音只走 cue、角色包引用都对上、许可待定只记数', async () => {
    const root = makeRepo(base(), {
      'assets/registry/贴图.toml': makeAssetTable(assetRow('贴图/甲'), assetRow('贴图/李樱-脸', '公开', 'LicenseRef-待定')),
      'assets/registry/配音.toml': makeAssetTable(assetRow('配音/甲', '私有', 'LicenseRef-用户保留')),
      'assets/资产锁.json': JSON.stringify({ '贴图/甲': lockEntry('a'.repeat(64)), '贴图/李樱-脸': lockEntry('b'.repeat(64)), '配音/甲': lockEntry('c'.repeat(64), '私有') }),
      '作品/应力转动/段/7-甲/段.ts':
        "import { defineSeg } from '@engine/段/段定义.ts';\nexport default defineSeg({ 场: '7-场一', 秒: 10, 宽: 4, 高: 4, 地形: [], 声音: [{ 秒: 0, 资产: '配音/甲' }] });\n",
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
    const { violations, report } = await runRule('assets', root);
    expect(violations).toEqual([]);
    expect(report.infoLines).toContain('1 件许可待定（见 assets/待确认.md）');
    expect(report.待迁移.map((q) => q.文本)).toEqual(['角色包 李樱 的代码 库/角色/李樱.tsx 还没搬']);
  });

  it('私有资产 import 块顶上标了「待迁移（私有资产）」的算待迁移，没标的、隔了别的行的照拦', async () => {
    const root = makeRepo(base(), {
      'assets/registry/贴图.toml': makeAssetTable(assetRow('贴图/甲'), assetRow('贴图/私', '私有'), assetRow('贴图/私二', '私有')),
      'assets/资产锁.json': JSON.stringify({ '贴图/甲': lockEntry('a'.repeat(64)), '贴图/私': lockEntry('d'.repeat(64), '私有'), '贴图/私二': lockEntry('e'.repeat(64), '私有') }),
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
    const { violations, report } = await runRule('assets', root);
    expect(report.待迁移.map((q) => q.文本)).toContain('作品/应力转动/段/7-甲/画面.tsx 还把私有资产 asset:贴图/私 打进包里（M5 改走 cue）');
    expect(violations.join('\n')).toMatch(/公开构建的闭包里不能有私有资产：作品\/应力转动\/段\/7-甲\/画面.tsx import 了 asset:贴图\/私二/);
    expect(violations.join('\n')).not.toMatch(/import 了 asset:贴图\/私（/);
  });

  it('没登记、私有进画面、许可不合规、锁和表对不上、库放错、角色包对不上都拦', async () => {
    const root = makeRepo(base(), {
      'assets/registry/贴图.toml': makeAssetTable(assetRow('贴图/甲'), assetRow('贴图/乙', '公开', 'MIT 或 GPL'), assetRow('贴图/私', '私有')),
      'assets/资产锁.json': JSON.stringify({ '贴图/甲': lockEntry('a'.repeat(64)), '贴图/私': lockEntry('d'.repeat(64)), '贴图/孤': lockEntry('e'.repeat(64)) }),
      '作品/应力转动/段/7-甲/画面.tsx': "import 图 from 'asset:贴图/甲';\nimport 私 from 'asset:贴图/私';\nimport 无 from 'asset:贴图/没登记';\nexport default () => <img src={图 + 私 + 无} />;\n",
      '作品/应力转动/段/7-甲/段.ts': "import { defineSeg } from '@engine/段/段定义.ts';\nexport default defineSeg({ 场: '7-场一', 秒: 10, 宽: 4, 高: 4, 地形: ['没登记的包'] });\n",
      'assets/kits/九胡.toml': ['"角色" = "九胡"', '[["资产组"]]', '"用途" = "模型"', '"匹配" = ["模型/九胡-*"]', '"文字源" = ["docs/没有.md"]'].join('\n'),
    });
    const v = (await runRule('assets', root)).violations.join('\n');
    expect(v).toMatch(/「贴图\/乙」的许可「MIT 或 GPL」不是 SPDX 表达式/);
    expect(v).toMatch(/「贴图\/乙」登记了但不在资产锁里/);
    expect(v).toMatch(/「贴图\/私」可见性是私有，资产锁里却在 store 库/);
    expect(v).toMatch(/资产锁里的「贴图\/孤」没在资产表登记/);
    expect(v).toMatch(/作品\/应力转动\/段\/7-甲\/画面.tsx asset:引用的「贴图\/没登记」没在资产表登记/);
    expect(v).toMatch(/公开构建的闭包里不能有私有资产：作品\/应力转动\/段\/7-甲\/画面.tsx import 了 asset:贴图\/私/);
    expect(v).toMatch(/7-甲 用的地形包「没登记的包」没在 assets\/地形版本.json 登记/);
    expect(v).toMatch(/角色包 九胡「模型」的匹配 模型\/九胡-\* 一件也没对上/);
    expect(v).toMatch(/角色包 九胡「模型」的文字源 docs\/没有.md 不在仓库里/);
  });

  it('--deep：库里字节和地形包按 sha 核对，对得上放行、改过就拦', async () => {
    const dataRoot = makeDataRoot({ store: 'abc' }, { '古城/v1/a.bin': '1', '古城/v1/子/b.bin': '22' });
    try {
      const manifest = await packManifest(path.join(dataRoot, 'terrain', '古城', 'v1'));
      expect(manifest.文件数).toBe(2);
      const repoRoot = () =>
        makeRepo(base(), {
          'assets/资产锁.json': JSON.stringify({ '贴图/甲': lockEntry(sha('abc')) }),
          'assets/地形版本.json': JSON.stringify({ 包: { 古城: { 版本: 'v1', ...manifest, 许可: 'LicenseRef-用户保留', 可见性: '私有' } } }),
        });
      const checkResult = await runRule('assets', repoRoot(), { depthCheck: true, dataRoot });
      expect(checkResult.violations).toEqual([]);
      expect(checkResult.report.infoLines.at(-1)).toMatch(/深查：1 个库对象、1 个地形包/);

      const h = sha('abc');
      const f = path.join(dataRoot, 'store', h.slice(0, 2), h);
      fs.writeFileSync(f, 'abd');
      fs.writeFileSync(path.join(dataRoot, 'terrain', '古城', 'v1', 'a.bin'), '9');
      const v = (await runRule('assets', repoRoot(), { depthCheck: true, dataRoot })).violations.join('\n');
      expect(v).toMatch(/「贴图\/甲」库里的字节 sha256 是 .{12}，资产锁记的是 ba7816bf8f01/);
      expect(v).toMatch(/地形包 古城\/v1 和 assets\/地形版本.json 记的不一致/);
    } finally {
      fs.rmSync(dataRoot, { recursive: true, force: true });
    }
  });

  it('取地形包的段（闭包里有 区段包位置.ts）写到的登记包名没声明，只提示不拦（真读到时页面报错）；不取地形的段写到了也不管', async () => {
    const terrainJsonText = JSON.stringify({ 包: { 主世界: { 版本: 'v1', 许可: 'MIT', 可见性: '发布' }, 暮色: { 版本: 'v2', 许可: 'MIT', 可见性: '发布' } } });
    const filesFor = (terrains: string) => ({
      'assets/地形版本.json': terrainJsonText,
      'engine/voxel/区段包位置.ts': "export const packDir = (名: string) => `terrain/${名}`;\n",
      '作品/应力转动/地点/名.ts': "export const 主世界名 = '主世界';\nexport const 暮色名 = '暮色';\n",
      '作品/应力转动/段/7-甲/段.ts': `import { defineSeg } from '@engine/段/段定义.ts';\nexport default defineSeg({ 场: '7-场一', 秒: 10, 宽: 4, 高: 4, 地形: ${terrains} });\n`,
      '作品/应力转动/段/7-甲/画面.tsx':
        "import 图 from 'asset:贴图/甲';\nimport { packDir } from '@engine/voxel/区段包位置.ts';\nimport { 主世界名 } from '../../地点/名.ts';\nexport default () => <img src={图 + packDir(主世界名)} />;\n",
    });
    const narrow = await runRule('assets', makeRepo(base(), filesFor('["主世界"]')));
    expect(narrow.violations).toEqual([]);
    expect(narrow.report.infoLines.join('\n')).toMatch(/7-甲 的闭包写到了 暮色/);
    const report = await runRule('assets', makeRepo(base(), filesFor('["主世界", "暮色"]')));
    expect(report.violations).toEqual([]);
    expect(report.report.infoLines.join('\n')).not.toMatch(/闭包写到了/);
    const notTaken = filesFor('[]');
    notTaken['作品/应力转动/段/7-甲/画面.tsx'] = "import 图 from 'asset:贴图/甲';\nimport { 主世界名 } from '../../地点/名.ts';\nexport default () => <img src={图 + 主世界名} />;\n";
    expect((await runRule('assets', makeRepo(base(), notTaken))).violations).toEqual([]);
  });

  it('SPDX 表达式和角色包通配', () => {
    for (const ok of ['MIT', 'CC-BY-4.0', 'LicenseRef-用户保留', 'GPL-2.0-only WITH Classpath-exception-2.0', '(MIT OR Apache-2.0) AND CC0-1.0']) expect(isSpdxValid(ok)).toBe(true);
    for (const bad of ['', 'MIT OR', '(MIT', 'MIT GPL', 'MIT 或 GPL', 'AND']) expect(isSpdxValid(bad)).toBe(false);
    expect(globToRegex('模型/李樱-*').test('模型/李樱-手/左')).toBe(true);
    expect(globToRegex('贴图/?').test('贴图/甲')).toBe(true);
    expect(globToRegex('贴图/?').test('贴图/甲乙')).toBe(false);
  });
});

/** 第二部作品 示例：一段 1-标题，画面 import 什么由参数定 */
const makeExample = (...imports: string[]) => ({
  '作品/示例/清单.ts': "export const manifest = [{ 键: '1-标题', 章: 1 }];\nexport const segDir = (键: string) => `段/${键}`;\n",
  '作品/示例/段/1-标题/段.ts': "import { defineSeg } from '@engine/段/段定义.ts';\nexport default defineSeg({ 场: '1-片头', 秒: 24, 宽: 640, 高: 360, 地形: [] });\n",
  '作品/示例/段/1-标题/画面.tsx': `${imports.map((id, i) => `import a${i} from 'asset:${id}';`).join('\n')}\nexport default () => <div>{${imports.map((_, i) => `a${i}`).join(' + ') || "''"}}</div>;\n`,
});

describe('作品资产表', () => {
  it('共用表锁并上作品的 资产表/、资产锁/：作品自己的 id 引得到，别的作品看不到它', async () => {
    const files = {
      ...makeExample('贴图/甲', '配乐/曲'),
      '作品/示例/资产表/配乐.toml': makeAssetTable(assetRow('配乐/曲')),
      '作品/示例/资产锁.json': JSON.stringify({ '配乐/曲': lockEntry('f'.repeat(64)) }),
    };
    expect((await runRule('assets', makeRepo(base(), files), { 作品: '示例' })).violations).toEqual([]);
    // 查 应力转动 时不读 示例 的表和锁：示例 引的 配乐/曲 不归它管，示例 表里的毛病也不报
    const badTable = { ...files, '作品/示例/资产表/配乐.toml': '[["资产"]]\nid = "配乐/曲"\n' };
    expect((await runRule('assets', makeRepo(base(), badTable), { 作品: '应力转动' })).violations).toEqual([]);
  });

  it('两侧都登记、两份锁都有、锁写错一侧、作品锁里没登记的、作品表缺字段都拦，报在作品那份文件上', async () => {
    const root = makeRepo(base(), makeExample('贴图/甲'), {
      '作品/示例/资产表/配乐.toml': [makeAssetTable(assetRow('贴图/甲'), assetRow('配乐/错侧'), assetRow('配乐/没入库')), '[["资产"]]\nid = "配乐/缺字段"'].join('\n\n'),
      'assets/资产锁.json': JSON.stringify({ '贴图/甲': lockEntry('a'.repeat(64)), '配乐/错侧': lockEntry('b'.repeat(64)) }),
      '作品/示例/资产锁.json': JSON.stringify({ '贴图/甲': lockEntry('a'.repeat(64)), '配乐/孤': lockEntry('c'.repeat(64)) }),
    });
    const v = (await runRule('assets', root, { 作品: '示例' })).violations;
    expect(v).toEqual(
      expect.arrayContaining([
        '作品/示例/资产表 配乐.toml 的「配乐/缺字段」：缺 类别',
        '作品/示例/资产表/配乐.toml 「贴图/甲」在 assets/registry/贴图.toml 和 作品/示例/资产表/配乐.toml 里都登记了（一个 id 只登记在一侧）',
        '作品/示例/资产锁 「贴图/甲」在 assets/资产锁 和 作品/示例/资产锁 里都有（一个 id 只写在登记它那一侧的锁里）',
        '作品/示例/资产表/配乐.toml 「配乐/没入库」登记了但不在资产锁里（入库：anim assets add 或导入工具）',
        'assets/资产锁 「配乐/错侧」登记在 作品/示例/资产表/配乐.toml，资产锁却写在 assets/资产锁（anim assets add 写进登记它那一侧，重跑一次就挪过去）',
        '作品/示例/资产锁 资产锁里的「配乐/孤」没在资产表登记（资产锁是工具生成的，先登记再入库）',
      ]),
    );
    // 写错一侧的只报一次（不再另报「登记了但不在资产锁里」）
    expect(v.filter((x) => x.includes('配乐/错侧'))).toHaveLength(1);
  });

  it('私有作品（被 .gitignore 挡住）目录里 import 私有资产不报；engine/、库/ 照拦；没挡的作品照拦', async () => {
    const privateFiles = {
      ...makeExample('配乐/私曲', '配音/甲'),
      '作品/示例/资产表/配乐.toml': makeAssetTable(assetRow('配乐/私曲', '私有', 'LicenseRef-用户保留')),
      '作品/示例/资产锁.json': JSON.stringify({ '配乐/私曲': lockEntry('d'.repeat(64), '私有') }),
      'assets/registry/配音.toml': makeAssetTable(assetRow('配音/甲', '私有', 'LicenseRef-用户保留')),
      'assets/资产锁.json': JSON.stringify({ '贴图/甲': lockEntry('a'.repeat(64)), '配音/甲': lockEntry('c'.repeat(64), '私有') }),
      '库/界面/某.tsx': "import 私 from 'asset:配音/甲';\nexport const 某 = () => <div>{私}</div>;\n",
    };
    const withGit = (gitignore: string) => {
      const root = makeRepo(base(), privateFiles, { '.gitignore': gitignore });
      execFileSync('git', ['-C', root, 'init', '-q'], { stdio: 'ignore' });
      return root;
    };
    const blocked = await runRule('assets', withGit('/作品/示例/\n'), { 作品: '示例' });
    expect(blocked.violations).toEqual(['库/界面/某.tsx 公开构建的闭包里不能有私有资产：库/界面/某.tsx import 了 asset:配音/甲（私有的走 cue，缺了按规矩降级或报错，不打进包）']);
    expect(blocked.report.跳过.join()).toMatch(/作品\/示例 被 .gitignore 挡住、是私有作品/);

    const notBlocked = (await runRule('assets', withGit('/作品/别的/\n'), { 作品: '示例' })).violations.join('\n');
    expect(notBlocked).toMatch(/作品\/示例\/段\/1-标题\/画面.tsx import 了 asset:配乐\/私曲/);
    expect(notBlocked).toMatch(/作品\/示例\/段\/1-标题\/画面.tsx import 了 asset:配音\/甲/);
  });
});

describe('随仓库发的字节', () => {
  // 7-甲 的画面 import 贴图/甲，cue 放私有配乐 配乐/私曲：字节/ 里该有且只有 贴图/甲 那一件
  const contentA = '甲的字节';
  const privateBytes = '私曲的字节';
  const bytesPosPath = (s: string) => `作品/应力转动/字节/${sha(s).slice(0, 2)}/${sha(s)}`;
  const makeAssetRepo = (...fileLayers: Record<string, string | null>[]) =>
    makeRepo(
      base(),
      {
        'assets/registry/配乐.toml': makeAssetTable(assetRow('配乐/私曲', '私有', 'LicenseRef-All-Rights-Reserved')),
        'assets/资产锁.json': JSON.stringify({ '贴图/甲': lockEntry(sha(contentA)), '配乐/私曲': lockEntry(sha(privateBytes), '私有') }),
        '作品/应力转动/段/7-甲/段.ts':
          "import { defineSeg } from '@engine/段/段定义.ts';\nexport default defineSeg({ 场: '7-场一', 秒: 10, 宽: 4, 高: 4, 地形: [], 声音: [{ 秒: 0, 资产: '配乐/私曲', 名: '歌', 长秒: 10 }] });\n",
        '作品/应力转动/随仓库.toml': '"段" = ["7"]',
        [bytesPosPath(contentA)]: contentA,
      },
      ...fileLayers,
    );

  it('字节/ 和集合一致放行，报件数；私有的不算', async () => {
    const r = await runRule('assets', makeAssetRepo());
    expect(r.violations).toEqual([]);
    expect(r.report.infoLines.join('\n')).toMatch(/随仓库：1 段要的 1 件字节（0.0 MB）都在 作品\/应力转动\/字节\/、sha 对；私有不带 1 件/);
  });

  it('缺的、改坏的、多余的、私有的、没有 随仓库.toml 的 字节/、表里写了不存在的段都拦', async () => {
    expect((await runRule('assets', makeAssetRepo({ [bytesPosPath(contentA)]: null }))).violations).toEqual(['作品/应力转动/字节 作品/应力转动/字节/ 缺 1 件：贴图/甲（anim assets vendor 照当前代码重写）']);
    expect((await runRule('assets', makeAssetRepo({ [bytesPosPath(contentA)]: '改过' }))).violations.join()).toMatch(/的内容 sha256 和文件名对不上/);
    const violationText = (await runRule('assets', makeAssetRepo({ [bytesPosPath(privateBytes)]: privateBytes, [bytesPosPath('别的')]: '别的' }))).violations.join('\n');
    expect(violationText).toMatch(/是私有资产「配乐\/私曲」的字节，不能随仓库发/);
    expect(violationText).toMatch(/多余：随仓库.toml 的段现在用不到/);
    expect((await runRule('assets', makeAssetRepo({ '作品/应力转动/随仓库.toml': null }))).violations.join()).toMatch(/有 作品\/应力转动\/字节\/ 却没有 随仓库.toml/);
    expect((await runRule('assets', makeAssetRepo({ '作品/应力转动/随仓库.toml': '"段" = ["8"]' }))).violations.join()).toMatch(/「8」没对上清单里的段/);
  });
});
