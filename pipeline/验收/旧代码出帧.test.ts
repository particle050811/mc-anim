// 认指纹的旧那一边：旧切片是哪个提交渲的（.指纹.json 的 renderCommit 优先，再翻运行记录；沿用来的找原渲；dirty 不认），
// 和旧检出里 verify frames 的接法（读它打的基准记录、指纹和 PNG，读完删记录；缺帧报错）。假的 anim 脚本代替旧检出，不开浏览器。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-旧代码出帧测试-'));
process.env.ANIM_DATA = dataRoot;

const { findRunRecordCommit, findRenderSource, renderOldFrames } = await import('./旧代码出帧.ts');
const { writeFingerprint } = await import('../渲/母版.ts');
const { masterDir } = await import('../环境/作品数据.ts');
type SegStamp = import('./段签.ts').SegStamp;

const work = '测试作品';
const segKey = '核对-旧代码出帧';
const fp = (c: string) => c.repeat(64);
const runDir = path.join(dataRoot, '运行记录');
fs.mkdirSync(runDir, { recursive: true });
const writeRun = (name: string, artifacts: string[], code: { commit: string; dirty: boolean }) => fs.writeFileSync(path.join(runDir, name), JSON.stringify({ code, artifacts }));
const slice = (f: string) => path.join(dataRoot, 'cache', '母版', work, segKey, `${f.slice(0, 16)}.mp4`);
const stamp = (derivedAt: string, reuse?: { origRender: string }) => ({ derivedAt, ...(reuse ? { reuse } : {}) }) as unknown as SegStamp;

afterAll(() => fs.rmSync(dataRoot, { recursive: true, force: true }));

describe('旧切片是哪个提交渲的', () => {
  writeRun('20261117-100000-film-1.json', [slice(fp('a'))], { commit: '早一次', dirty: false });
  writeRun('20261117-110000-film-2.json', [slice(fp('a'))], { commit: '写出它的那次', dirty: false });
  writeRun('20261117-110500-reuse-3.json', [slice(fp('a'))], { commit: '认指纹的不算', dirty: false });
  writeRun('20261117-120000-film-4.json', [slice(fp('a'))], { commit: '段签之后的不算', dirty: false });
  writeRun('20261117-110000-film-5.json', [slice(fp('b'))], { commit: '带改动渲的', dirty: true });

  it('运行记录：开始不晚于段签派生时刻的 film 里最晚一条，reuse 的不算', () => {
    expect(findRunRecordCommit(work, segKey, fp('a'), '2026-11-17T11:20:00.000Z', runDir)).toMatchObject({ commit: '写出它的那次', file: '20261117-110000-film-2.json' });
    expect(findRunRecordCommit(work, segKey, fp('c'), '2026-11-17T23:00:00.000Z', runDir)).toBeNull();
  });

  it('.指纹.json 记了就用它；沿用来的找原渲那份；带未提交改动渲的不认；都查不到说原因', () => {
    expect(findRenderSource(segKey, { fingerprint: fp('a'), segStamp: stamp('2026-11-17T11:20:00.000Z') }, work, runDir).source).toEqual({ commit: '写出它的那次', fingerprint: fp('a'), via: '运行记录 20261117-110000-film-2.json' });
    // 沿用来的切片（d 沿用 a）：按原渲 a 找，旧代码要算出 a
    expect(findRenderSource(segKey, { fingerprint: fp('d'), segStamp: stamp('2026-11-17T11:20:00.000Z', { origRender: fp('a') }) }, work, runDir).source).toMatchObject({ commit: '写出它的那次', fingerprint: fp('a') });
    expect(findRenderSource(segKey, { fingerprint: fp('b'), segStamp: stamp('2026-11-17T11:20:00.000Z') }, work, runDir).why).toContain('未提交改动');
    expect(findRenderSource(segKey, { fingerprint: fp('c'), segStamp: stamp('2026-11-17T11:20:00.000Z') }, work, runDir).why).toContain('查不到');
    writeFingerprint({ segment: segKey, fingerprint: fp('d') } as never, masterDir(segKey, work), { commit: '记下的源头', dirty: false });
    expect(findRenderSource(segKey, { fingerprint: fp('d'), segStamp: stamp('2026-11-17T11:20:00.000Z', { origRender: fp('a') }) }, work, runDir).source).toEqual({ commit: '记下的源头', fingerprint: fp('a'), via: '指纹记录' });
  });
});

describe.skipIf(process.platform === 'win32')('旧检出里的 verify frames', () => {
  /** 假的旧检出：anim verify frames <段> --frames … --save <名> --keep-images <目录>，照真的一样写 tsv 和 PNG、打「✓ 段：n 帧 → tsv」；SKIP 的帧不出 */
  const fakeCheckout = (fingerprint: string, skipFrame = -1) => {
    const dir = fs.mkdtempSync(path.join(dataRoot, '旧检出-'));
    const script = `#!/bin/sh
seg="$5"; frames="$7"; name="$9"; images="\${11}"
rec="${dataRoot}/run/逐帧校验/${work}/$name"; mkdir -p "$rec" "$images"
{ printf '# 段\\t%s\\n# 段帧数\\t48\\n# 指纹\\t%s\\n# 提交\\t旧提交\\n帧\\tsha256\\t字节\\n' "$seg" "${fingerprint}"
  for f in $(echo "$frames" | tr ',' ' '); do
    [ "$f" = "${skipFrame}" ] && continue
    printf '%s\\t%s\\t1\\n' "$f" "${'0'.repeat(64)}"; printf '%s' "$f" > "$images/$seg-第$(printf '%04d' "$f")帧.png"
  done; } > "$rec/$seg.tsv"
echo "✓ \${seg}：2 帧 → $rec/$seg.tsv"
`;
    fs.writeFileSync(path.join(dir, 'anim'), script, { mode: 0o755 });
    return dir;
  };

  it('读回旧代码算的指纹和每帧 PNG，基准记录读完就删', async () => {
    const images = path.join(dataRoot, '图甲');
    const r = (await renderOldFrames(fakeCheckout(fp('e')), work, [segKey], [0, 47], images)).get(segKey)!;
    expect(r.fingerprint).toBe(fp('e'));
    expect(fs.readFileSync(r.png.get(47)!, 'utf8')).toBe('47');
    expect(fs.readdirSync(path.join(dataRoot, 'run', '逐帧校验', work))).toEqual([]);
  });

  it('旧代码少出一帧报错', async () => {
    await expect(renderOldFrames(fakeCheckout(fp('e'), 47), work, [segKey], [0, 47], path.join(dataRoot, '图乙'))).rejects.toThrow('1/2 帧');
  });
});
