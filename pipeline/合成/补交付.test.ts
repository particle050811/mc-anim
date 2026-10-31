// 补声音的源核对：补出来的文件解钉后是交付唯一的来源，源要是出片时那一份（v2 比字节 sha，v1 比改于不晚于 manifest）。数据根是临时目录。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-补交付测试-'));
process.env.ANIM_DATA = 数据根;
const { 母版是出片时的, 出片时声音, 出片时画面 } = await import('./补交付.ts');
const { 段签目录 } = await import('../环境/配置.ts');

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

  describe('母版转存 CRF12 以后', () => {
    const sha = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
    const 键 = '6-乙';
    const 指纹 = 'b'.repeat(64);
    const dir = path.join(数据根, 'cache', '母版', '作品甲', 键);
    const 原 = path.join(dir, 'bbbbbbbbbbbbbbbb.mkv');
    const 压 = path.join(dir, 'bbbbbbbbbbbbbbbb.crf12.mkv');
    const 乙 = { ...段, 键, 指纹, 母版: 原 };
    const 片 = { 作品: '作品甲', 改于: Date.now() + 1000 };
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(压, 'CRF12字节');

    it('出片时读的就是 CRF12：CRF1 不在也算，画面、声音都读它', async () => {
      const s = { ...乙, 字节sha: sha('CRF12字节') };
      expect(await 出片时画面(s, 片)).toBe(压);
      expect(await 出片时声音(s, 片)).toBe(压);
    });

    it('出片时读的是 CRF1、现在只剩 CRF12：画面不算（像素变了），段签记着转自那份 CRF1 的声音算（PCM 原样拷）', async () => {
      const s = { ...乙, 字节sha: sha('CRF1字节') };
      expect(await 出片时画面(s, 片)).toBeNull();
      expect(await 出片时声音(s, 片)).toBeNull(); // 没有段签证明它转自出片时那份
      const 签目录 = 段签目录(键, 指纹, '作品甲');
      fs.mkdirSync(签目录, { recursive: true });
      fs.writeFileSync(path.join(签目录, '抽样.mkv'), '');
      const st = fs.statSync(压);
      fs.writeFileSync(path.join(签目录, '签.json'), JSON.stringify({
        版本: 1, 作品: '作品甲', 段: 键, 指纹, 声音: null, 抽样: { 文件: '抽样.mkv' },
        母版: { 字节sha: sha('CRF12字节'), 大小: st.size, 改于: st.mtimeMs, 转码自: { 字节sha: sha('CRF1字节'), 大小: 8, 改于: 1 } },
      }));
      expect(await 出片时画面(s, 片)).toBeNull();
      expect(await 出片时声音(s, 片)).toBe(压);
      expect(await 出片时声音({ ...乙, 字节sha: sha('别的 CRF1') }, 片)).toBeNull();
    });
  });
});
