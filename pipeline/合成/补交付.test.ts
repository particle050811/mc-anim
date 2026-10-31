// 补声音的源核对：补出来的文件解钉后是交付唯一的来源，源要是出片时那一份（v2 比字节 sha，v1 比改于不晚于 manifest）。数据根是临时目录。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-补交付测试-'));
process.env.ANIM_DATA = 数据根;
const { 母版是出片时的, 出片时声音 } = await import('./补交付.ts');

afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

const 母 = path.join(数据根, 'cache', '母版', '作品甲', '6-甲', 'aaaaaaaaaaaaaaaa.mkv');
fs.mkdirSync(path.dirname(母), { recursive: true });
fs.writeFileSync(母, '母版字节');
const 字节sha = crypto.createHash('sha256').update('母版字节').digest('hex');
const 段 = { 编号: null, 键: '6-甲', 指纹: 'a'.repeat(64), 帧数: 1, 全片起帧: 0, 母版: 母, 声音: null, 字节sha: null };
const 改于 = fs.statSync(母).mtimeMs;

describe('补声音的源核对', () => {
  it('v1：母版改于不晚于 manifest 才算出片时那份', async () => {
    expect(await 母版是出片时的(段, { 作品: '作品甲', 改于: 改于 + 1000 })).toBe(true);
    expect(await 母版是出片时的(段, { 作品: '作品甲', 改于: 改于 - 1000 })).toBe(false);
    expect(await 出片时声音(段, { 作品: '作品甲', 改于: 改于 + 1000 })).toBe(母);
    expect(await 出片时声音(段, { 作品: '作品甲', 改于: 改于 - 1000 })).toBeNull();
  });

  it('v2：比 manifest 记的母版字节 sha，改于不管', async () => {
    expect(await 母版是出片时的({ ...段, 字节sha }, { 作品: '作品甲', 改于: 0 })).toBe(true);
    expect(await 母版是出片时的({ ...段, 字节sha: 'f'.repeat(64) }, { 作品: '作品甲', 改于: 改于 + 1000 })).toBe(false);
    expect(await 母版是出片时的({ ...段, 母版: 母 + '.不在' }, { 作品: '作品甲', 改于: 改于 + 1000 })).toBe(false);
  });
});
