import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { 资产cue } from '@engine/段/段定义.ts';
import 段 from './段/1-一如既往/段.ts';
import { 句们 } from './配乐/网格.ts';
import { 原声增益, 原声淡入秒, 咔哒增益, 咔哒声 } from './场/1-隐世之境一楼/参数.ts';
import { 串们, 事件, 排段, 正片事件, 正片事件分串, 段内事件帧, 段时钟, 段窗口, 第几句, fps, 旧帧 } from './分镜.ts';
import { 回帧们, 帧数于, 窗帧 } from './声音/回帧.ts';

describe('分镜：从网格常数推帧号', () => {
  it('验证片：段起 2485、驯服 2563、微笑 3177、咔哒 3279、段止 3360（60 fps）', () => {
    const w = 段窗口('1-一如既往');
    expect(w.起帧).toBe(2485);
    expect(w.止帧).toBe(3360);
    expect(w.帧数).toBe(875);
    expect(事件.驯服.帧).toBe(2563);
    expect(事件.微笑推镜.帧).toBe(3177);
    expect(事件.咔哒定格.帧).toBe(3279);
    const 内 = 段内事件帧('1-一如既往');
    expect([内.驯服, 内.微笑推镜, 内.咔哒定格]).toEqual([78, 692, 794]);
  });

  it('段.ts 的帧数、场窗口和原声入点都取自分镜', () => {
    const 钟 = 段时钟('1-一如既往');
    expect(帧数于(段)).toBe(875);
    expect(窗帧(段)).toEqual({ 起帧: 2485, 止帧: 3360 });
    expect(钟.原声).toEqual({ 秒: 0, 长秒: 875 / 60, 入点秒: 2485 / 60 });
  });

  it('段.ts 的原声 cue：帧、帧数、入点取自分镜，增益逐帧，开头淡入到场参数的固定增益', () => {
    const cue = 回帧们(段).find((c) => c.资产 === '配乐/把回忆拼好给你-无男声DJ');
    expect(cue).toMatchObject({ 帧: 0, 帧数: 875, 入点秒: 2485 / 60, 名: '原声' });
    const 增益 = cue!.增益 as readonly number[];
    expect(增益).toHaveLength(875);
    // 第 0 帧算已经走了 1/24 秒，淡入一共这么多帧（含到满那一帧）
    const 原声淡入帧 = Math.round((原声淡入秒 - 旧帧(1)) * fps) + 1;
    const 淡入 = 增益.slice(0, 原声淡入帧);
    for (let f = 1; f < 淡入.length; f++) expect(淡入[f]).toBeGreaterThan(淡入[f - 1]!);
    expect(淡入[0]).toBeGreaterThan(0);
    expect(new Set(增益.slice(原声淡入帧 - 1))).toEqual(new Set([原声增益]));
  });

  it('段.ts 的咔哒 cue：从分镜的咔哒定格往前提起音秒，主音离定格那一帧不到半帧；放满文件、不过段尾，增益取场参数', () => {
    const cue = 回帧们(段).find((c) => c.资产 === '音效/车万女仆/item.camera_use');
    const 定格 = 段内事件帧('1-一如既往').咔哒定格;
    // 起音 0.13 秒 = 7.8 帧取整 8 帧，文件 0.88 秒 = 52.8 帧放满 53 帧（24 fps 时 3 帧、22 帧）
    expect(cue).toMatchObject({ 帧: 定格 - 8, 帧数: 53, 增益: 咔哒增益, 名: '咔哒' });
    // 起放帧按起音秒四舍五入到帧（同 2-合照 的咔哒）：主音离定格那一帧不到半帧，60 fps 早 0.2 帧（24 fps 时晚 0.12 帧）
    expect(Math.abs(cue!.帧 + 咔哒声.起音秒 * fps - 定格)).toBeLessThanOrEqual(0.5);
    expect(cue!.帧数 / fps).toBeGreaterThanOrEqual(咔哒声.时长秒);
    expect(cue!.帧 + cue!.帧数).toBeLessThanOrEqual(帧数于(段));
  });

  it('段起落在第 12 句止和第 13 句前导音之间的换气里', () => {
    const 起秒 = 段窗口('1-一如既往').起帧 / fps;
    expect(起秒).toBeGreaterThan(第几句(12).止);
    expect(起秒).toBeLessThan(第几句(13).前导!);
  });

  it('各串的段窗口首尾相接、不重叠', () => {
    for (const 串 of 串们) {
      for (let i = 1; i < 串.length; i++) expect(串[i]!.起帧).toBe(串[i - 1]!.止帧);
      for (const w of 串) expect(w.止帧).toBeGreaterThan(w.起帧);
    }
  });

  it('事件表按时间排', () => {
    for (const 表 of [事件, 正片事件]) {
      const 帧们 = Object.values(表).map((e) => e.帧);
      expect(帧们).toEqual([...帧们].sort((a, b) => a - b));
    }
  });

  it('正片第 15 句：加入游戏 2908（合屏到位后半拍）、对视（封面帧）3010，对视时那行聊天约 34 刻，还满亮（原版 180 刻后才淡）', () => {
    expect(正片事件.第15句加入游戏.帧).toBe(2908);
    expect(正片事件.第15句对视.帧).toBe(3010);
    const 刻 = ((正片事件.第15句对视.帧 - 正片事件.第15句加入游戏.帧) / fps) * 20;
    expect(Math.round(刻)).toBe(34);
  });

  it('正片事件按时间排：每串的文件里各自按时间排，事件名各串不重', () => {
    for (const 表 of 正片事件分串) {
      const 帧们 = Object.values(表).map((e) => e.帧);
      expect(帧们).toEqual([...帧们].sort((a, b) => a - b));
    }
    expect(正片事件分串.reduce((n, 表) => n + Object.keys(表).length, 0)).toBe(Object.keys(正片事件).length);
  });

  it('渲染代码不引汇总的 分镜.ts，只引 分镜/时间.ts 和用得到的那几串（引了改哪一句都让全片过期，用户 11-06 定按句拆）', () => {
    const 根 = import.meta.dirname;
    const 引汇总: string[] = [];
    const 走 = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (e.name !== 'node_modules') 走(p);
        } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts') && p !== path.join(根, '分镜.ts')) {
          for (const m of fs.readFileSync(p, 'utf8').matchAll(/from\s+'([^']+)'/g))
            if (path.resolve(d, m[1]!) === path.join(根, '分镜.ts')) 引汇总.push(path.relative(根, p));
        }
      }
    };
    走(根);
    expect(引汇总).toEqual([]);
  });

  it('第 8 句的几拍和依据里写的秒数差不到 0.01 秒（晴定提早、苦力怕冒头挪后，见依据；后面几拍同三稿）', () => {
    const 三稿 = { 第8句晴定: 25.99, 挂照片: 26.53, 苦力怕冒头: 26.85, 她看见苦力怕: 27.38, 哈气: 27.8, 苦力怕逃: 28.23 } as const;
    for (const [名, 秒] of Object.entries(三稿)) expect(Math.abs(正片事件[名 as keyof typeof 三稿].秒 - 秒)).toBeLessThan(0.01);
    expect(正片事件.哈气.帧).toBe(1668);
  });

  it('第 13 句五拍（风吹日历、生长二～四、日历到一）落在三稿的秒数上（差不到半帧）', () => {
    const 拍们 = [正片事件.风吹日历, 正片事件.生长二, 正片事件.生长三, 正片事件.生长四, 正片事件.日历到一];
    [42.72, 43.14, 43.57, 44.0, 44.42].forEach((秒, i) => expect(Math.abs(拍们[i]!.秒 - 秒)).toBeLessThan(0.5 / fps));
    expect(拍们.map((e) => e.帧)).toEqual([2563, 2589, 2614, 2640, 2665]);
    expect(正片事件.分屏起.秒).toBe(第几句(13).前导);
  });

  it('网格的 15 句按序、起止不反', () => {
    expect(句们.map((s) => s.序)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    for (const s of 句们) {
      expect(s.止).toBeGreaterThan(s.起);
      if (s.前导 !== undefined) expect(s.前导).toBeLessThan(s.起);
    }
  });
});

describe('排段', () => {
  const 时长 = 10;
  it('后一段不写起就接上一段，按帧数或时刻定止', () => {
    const r = 排段({
      名: '甲',
      时长,
      段们: [
        { 键: '1-一', 起: { 秒: 1 }, 止: { 帧数: 2 * fps }, 依据: '' },
        { 键: '1-二', 止: { 小节: 4 }, 依据: '' },
        { 键: '1-三', 止: '放完', 依据: '' },
      ],
    });
    expect(r.map((w) => [w.起帧, w.止帧])).toEqual([
      [fps, 3 * fps],
      [3 * fps, Math.round((0.107 + 0.42611 * 16) * fps)],
      [Math.round((0.107 + 0.42611 * 16) * fps), 10 * fps],
    ]);
  });

  it('中间空了、重叠了、第一段没写起、超出原声都报错', () => {
    const 段们 = (起二: number) => [
      { 键: '1-一', 起: { 秒: 1 }, 止: { 帧数: fps }, 依据: '' },
      { 键: '1-二', 起: { 秒: 起二 }, 止: { 帧数: fps }, 依据: '' },
    ];
    expect(() => 排段({ 名: '甲', 时长, 段们: 段们(2.5) })).toThrow(/中间空了/);
    expect(() => 排段({ 名: '甲', 时长, 段们: 段们(1.5) })).toThrow(/重叠了/);
    expect(() => 排段({ 名: '甲', 时长, 段们: 段们(2) })).not.toThrow();
    expect(() => 排段({ 名: '甲', 时长, 段们: [{ 键: '1-一', 止: { 帧数: fps }, 依据: '' }] })).toThrow(/要写 起/);
    expect(() => 排段({ 名: '甲', 时长, 段们: [{ 键: '1-一', 起: { 秒: 9 }, 止: { 帧数: 2 * fps }, 依据: '' }] })).toThrow(/超出原声/);
  });

  it('接成环报错', () => {
    const 表 = { 甲: { 在: { 接: '乙', 加秒: 1 }, 依据: '' }, 乙: { 在: { 接: '甲', 加秒: 1 }, 依据: '' } };
    expect(() => 排段({ 名: '环', 时长, 段们: [{ 键: '1-一', 起: { 接: '甲', 加秒: 0 }, 止: '放完', 依据: '' }] }, 表)).toThrow(/环/);
  });
});
