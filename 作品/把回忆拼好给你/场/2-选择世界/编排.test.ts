import { describe, expect, it } from 'vitest';
import { 画幅, 段窗口, 正片事件 } from '../../分镜.ts';
import { 图标边 } from '../../界面/实例图标.ts';
import { 光标, 取景中心, 尺, 界面, 碎片, 钻入 } from './参数.ts';
import { 上次游玩字, 光标在, 图标框, 指着在, 框光标亮, 行字, 选中在, 钻入取景, 钻入进度, 钻入透, 碎块们, 碎块在, 片尾白光 } from './编排.ts';

const 鼓点 = 正片事件.开场鼓点.帧;

describe('存档那一项的字（原版 WorldListEntry、SimpleDateFormat zh_CN 短格式）', () => {
  it('第二行是文件夹名 + 上次游玩时间：月日不补零、十二小时制、上午下午在前', () => {
    expect(行字[1]).toBe('新的世界 (2025/8/31 下午10:47)');
    expect(上次游玩字({ 年: 2025, 月: 8, 日: 1, 时: 0, 分: 5 })).toBe('2025/8/1 上午12:05');
    expect(上次游玩字({ 年: 2025, 月: 8, 日: 1, 时: 12, 分: 0 })).toBe('2025/8/1 下午12:00');
  });
  it('第三行是模式和版本', () => {
    expect(行字[2]).toBe('生存模式, 版本： 1.20.1');
  });
});

describe('第 0 镜：光标、指着、选中', () => {
  it('第一帧没有光标、没选中、搜索框拿着焦点「_」亮着（和片尾最后一帧同构图，能接回开头）', () => {
    expect(光标在(0)).toBeNull();
    expect(指着在(0)).toBe(0);
    expect(选中在(0)).toBe(false);
    expect(框光标亮(0)).toBe(true);
  });
  it('搜索框光标照原版 6 刻亮、6 刻灭', () => {
    const 亮们 = Array.from({ length: 48 }, (_, f) => 框光标亮(f));
    expect(亮们.filter(Boolean).length).toBeGreaterThan(20);
    expect(亮们.filter(Boolean).length).toBeLessThan(28);
    expect(框光标亮(Math.ceil((6 * 24) / 20))).toBe(false);
  });
  it('光标到了停在图标上（蓝的播放箭头），鼓点那一帧点下去：选中、光标还在、不再蒙灰；下一帧光标没了', () => {
    expect(光标在(正片事件.开场光标到.帧)).toEqual(光标.停);
    expect(指着在(正片事件.开场光标到.帧)).toBe(2);
    expect(光标在(鼓点)).toEqual(光标.停);
    expect(选中在(鼓点)).toBe(true);
    expect(指着在(鼓点)).toBe(0);
    expect(光标在(鼓点 + 1)).toBeNull();
  });
  it('光标一路先擦过那一项的字（灰箭头）再到图标', () => {
    const 路 = Array.from({ length: 正片事件.开场光标到.帧 - 正片事件.开场光标入.帧 + 1 }, (_, k) => 指着在(正片事件.开场光标入.帧 + k));
    expect(路.includes(1)).toBe(true);
    expect(路.indexOf(1)).toBeLessThan(路.indexOf(2));
  });
  it('光标停的地方在图标里、箭头尖落在半个界面像素上', () => {
    expect(光标.停.x).toBeGreaterThanOrEqual(图标框.x);
    expect(光标.停.x).toBeLessThan(图标框.x + 图标框.边);
    expect(光标.停.y).toBeGreaterThanOrEqual(图标框.y);
    expect(光标.停.y).toBeLessThan(图标框.y + 图标框.边);
    for (let f = 正片事件.开场光标入.帧; f <= 鼓点; f++) {
      const c = 光标在(f)!;
      expect(Number.isInteger(c.x * 2) && Number.isInteger(c.y * 2)).toBe(true);
    }
  });
});

describe('取景', () => {
  it('图标、三行字、选中框的左边和上下边在画面里；画面上沿切在搜索框黑底里（垫在歌词后面）；标题、底下的按钮不进画', () => {
    const 半宽 = 画幅.宽 / 尺, 半高 = 画幅.高 / 尺;
    const 左 = 取景中心.x - 半宽, 右 = 取景中心.x + 半宽, 上 = 取景中心.y - 半高, 下 = 取景中心.y + 半高;
    expect(界面.选中框.左).toBeGreaterThanOrEqual(左);
    expect(界面.选中框.上).toBeGreaterThanOrEqual(上);
    expect(界面.选中框.下).toBeLessThanOrEqual(下);
    // 第二行最长：Unifont 汉字步进 9、ASCII 不超过 6，40 个以内的字放得下
    expect(界面.字x + 160).toBeLessThanOrEqual(右);
    expect(上).toBeGreaterThanOrEqual(界面.搜索框.y);
    expect(上).toBeLessThan(界面.搜索框.y + 界面.搜索框.高);
    // 原版标题在 y 8，底下按钮从 y 高 − 52 起
    expect(上).toBeGreaterThan(8 + 9);
    expect(下).toBeLessThan(界面.高 - 52);
  });
});

describe('钻进图标', () => {
  it('最后一帧有界面的画面：图标铺满画面、照片全透，下一帧去掉界面不跳', () => {
    const 末 = 鼓点 + 钻入.帧 - 1;
    const { p, q } = 钻入进度(末);
    expect(p).toBe(1);
    expect(钻入透(q)).toBe(1);
    const t = 钻入取景(q);
    expect(图标框.边 * t.尺).toBeGreaterThanOrEqual(画幅.宽 * 2);
    expect(图标框.边 * t.尺).toBeGreaterThanOrEqual(画幅.高 * 2);
    expect(t.中心.x).toBeCloseTo(图标框.x + 图标框.边 / 2);
    expect(t.中心.y).toBeCloseTo(图标框.y + 图标框.边 / 2);
  });
  it('鼓点那一帧还是平常的取景（接 2-选择世界 最后一帧）', () => {
    const t = 钻入取景(钻入进度(鼓点).q);
    expect(t.尺).toBe(尺);
    expect(t.中心).toEqual(取景中心);
  });
});

describe('片尾碎片', () => {
  const 回色 = 正片事件.片尾回色.帧 - 正片事件.片尾白光.帧;
  it('片尾从片尾白光起（= 2-合照 的止）', () => {
    expect(段窗口('2-拼回').起帧).toBe(正片事件.片尾白光.帧);
  });
  it('16 块碎片正好铺满图标，一格一块', () => {
    const 块数 = 图标边 / 碎片.碎块边;
    expect(碎块们.length).toBe(块数 * 块数);
    expect(碎块们.length).toBe(16);
    expect(new Set(碎块们.map((b) => `${b.i},${b.j}`)).size).toBe(碎块们.length);
  });
  it('第一帧整屏纯白、一块碎片都还没出来（接 2-合照 的闪白）', () => {
    expect(片尾白光(0, 回色)).toBe(1);
    for (const b of 碎块们) expect(碎块在(b, 0)).toBeNull();
  });
  it('回色前一帧全部到位，回色那一帧没有白光', () => {
    for (const b of 碎块们) expect(碎块在(b, 回色 - 1)?.到).toBe(true);
    expect(片尾白光(回色, 回色)).toBe(0);
  });
});
