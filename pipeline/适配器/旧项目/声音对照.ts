// 声音 cue 对照：照各段 段.ts 的声音 cue 和 story/台词.toml 现算台词落点、字幕表、SRT、音效清单、同步表，逐行和基线 _表（旧项目 7d077904 导出）比。
// 旧名（台词 id、段号、Composition、旧文件路径）按 docs/旧名.tsv 和资产表的 旧路径 换成新的再比；不渲染、不读母版。
// 用法：node pipeline/适配器/旧项目/声音对照.ts。新算的表和逐条差异写到 <数据根>/基线/_声音对照/；
// 台词落点、字幕表、SRT、音效清单有一条对不上就退出码 1。同步表旧的只有第 6 章、是从旧代码常数扒的，只按 ±1 帧配对列出差异，不拦。
import fs from 'node:fs';
import path from 'node:path';
import { 数据路径 } from '../../环境/配置.ts';
import { 代码根 } from '../../环境/路径.ts';
import { 全部段 } from '../../清单/清单.ts';
import { 读资产表 } from '../../资产/资产表.ts';
import { 字节路径, 读资产锁, 解析资产 } from '../../资产/资产锁.ts';
import { 时长秒 } from '../../渲/探测.ts';
import { 读单声道 } from '../../合成/音频.ts';
import { 排字幕, 字幕表tsv, srt } from '../../合成/字幕.ts';
import { 上一段于, 同步表行, 开口表, 算台词落点, 读台词表, 读音效起音 } from '../../合成/台词落点.ts';
import { 段的清单, type 清单条 } from '../剪映/音效清单.ts';

const 旧表 = 数据路径('基线', '_表');
const 出 = 数据路径('基线', '_声音对照');
const 读 = (p: string) => fs.readFileSync(path.join(旧表, p), 'utf8');
const 读json = <T>(p: string) => JSON.parse(读(p)) as T;

// 旧名
const 旧名行 = fs.readFileSync(path.join(代码根(), 'docs', '旧名.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t'));
const 新台词 = new Map(旧名行.filter((r) => r[0] === '台词').map((r) => [r[1]!, r[2]!]));
const 新段键 = new Map(旧名行.filter((r) => r[0] === 'Composition').map((r) => [r[1]!, r[2]!]));
const 旧段清单 = 读json<{ 段: { id: string; Composition: string }[] }>('段清单.json').段;
const 段号到键 = new Map(旧段清单.map((s) => [s.id, 新段键.get(s.Composition)!]));
const 换台词 = (id: string) => 新台词.get(id) ?? `（旧名表没有 ${id}）`;
const 换段 = (段号: string) => 段号到键.get(段号) ?? `（段清单没有 ${段号}）`;
const 旧路径id = new Map([...读资产表().条目.values()].flatMap((e) => (e.旧路径 ? [[e.旧路径, e.id] as const] : [])));
const 资产名 = (旧文件: string) => 旧路径id.get(path.posix.normalize(`参考模型库/src/${旧文件}`)) ?? `（资产表没有 ${旧文件}）`;

const 锁 = 读资产锁();
const 段们 = (await 全部段()).filter((s) => s.章 !== '核对');
const fps = 段们[0]!.段.fps;
let 累计 = 0;
const 截们 = 段们.map((s) => {
  const r = { 段: s, 全片起帧: 累计 };
  累计 += s.段.帧数;
  return r;
});
const 总帧数 = 累计;
const 表 = 读台词表();
const 上一段 = 上一段于(段们);
fs.mkdirSync(出, { recursive: true });
const 差: string[] = [];
const 记 = (类: string, 说: string) => 差.push(`${类}\t${说}`);
const 近 = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;

// 拼接表：段长、全片起帧
const 旧拼 = 读('拼接表.tsv').trim().split('\n').slice(1).map((l) => l.split('\t'));
if (旧拼.length !== 截们.length) 记('拼接表', `旧 ${旧拼.length} 段，新 ${截们.length} 段`);
旧拼.forEach((r, i) => {
  const c = 截们[i];
  if (!c || 新段键.get(r[1]!) !== c.段.键 || Number(r[3]) !== c.段.段.帧数 || Number(r[4]) !== c.全片起帧) 记('拼接表', `第 ${i + 1} 段：旧 ${r.join(' ')}，新 ${c?.段.键} ${c?.段.段.帧数} ${c?.全片起帧}`);
});

// 台词落点
const 落点们 = 算台词落点(截们, 表, (id) => 解析资产(id, 锁).文件, 上一段);
const 起帧于 = new Map(截们.map((c) => [c.段.键, c.全片起帧]));
type 旧落点 = { id: string; 段: string; 起帧: number; 字: string; 角色: string; 位置: string; 接上段: boolean; 屏们: { 字: string; 分句: unknown }[] };
const 旧落点们 = 读json<旧落点[]>('台词落点.json');
if (旧落点们.length !== 落点们.length) 记('台词落点', `旧 ${旧落点们.length} 条，新 ${落点们.length} 条`);
旧落点们.forEach((o, i) => {
  const n = 落点们[i];
  const 新 = n && [n.id, n.段, n.字, n.角色, n.位置, !!n.接上段, JSON.stringify(n.屏们.map((p) => [p.字, p.分句]))];
  const 旧 = [换台词(o.id), 换段(o.段), o.字, o.角色, o.位置, o.接上段, JSON.stringify(o.屏们.map((p) => [p.字, p.分句]))];
  if (!新 || JSON.stringify(新) !== JSON.stringify(旧) || !近(n.文件头帧 - 起帧于.get(n.段)!, o.起帧)) {
    记('台词落点', `第 ${i + 1} 条：旧 ${旧.slice(0, 2).join(' ')} 起帧 ${o.起帧}，新 ${新?.slice(0, 2).join(' ')} 起帧 ${n ? n.文件头帧 - 起帧于.get(n.段)! : '—'}`);
  }
});
fs.writeFileSync(path.join(出, '台词落点.json'), JSON.stringify(落点们.map((a) => ({ ...a, 文件: path.basename(a.文件) })), null, 1) + '\n');

// 字幕表、SRT：新表的 id、段 是新名，旧表换成新名再逐行比
const 声音缓存 = new Map<string, Float32Array>();
const 字幕 = 排字幕(落点们, 总帧数, fps, (f) => 声音缓存.get(f) ?? 声音缓存.set(f, 读单声道(f)).get(f)!);
const 新字幕表 = 字幕表tsv(字幕.屏们, fps, 字幕.接着放们);
const 新srt = srt(字幕.屏们, fps);
fs.writeFileSync(path.join(出, '字幕表.tsv'), 新字幕表);
fs.writeFileSync(path.join(出, '字幕.srt'), 新srt);
const 旧字幕行 = 读('字幕表.tsv').split('\n').map((l, i) => {
  if (i === 0 || !l) return l;
  const r = l.split('\t');
  return [换台词(r[0]!), r[1], 换段(r[2]!), ...r.slice(3)].join('\t');
});
const 新字幕行 = 新字幕表.split('\n');
for (let i = 0; i < Math.max(旧字幕行.length, 新字幕行.length); i++) if (旧字幕行[i] !== 新字幕行[i]) 记('字幕表', `第 ${i + 1} 行：旧「${旧字幕行[i] ?? ''}」新「${新字幕行[i] ?? ''}」`);
const 旧srt = 读('字幕.srt').split('\n');
const 新srt行 = 新srt.split('\n');
for (let i = 0; i < Math.max(旧srt.length, 新srt行.length); i++) if (旧srt[i] !== 新srt行[i]) 记('SRT', `第 ${i + 1} 行：旧「${旧srt[i] ?? ''}」新「${新srt行[i] ?? ''}」`);

// 音效清单：逐段三份清单逐条全字段比，增益逐帧
const 台词配音 = new Map(表.flatMap((t) => (t.配音 ? [[t.id, t.配音] as const] : [])));
const 开口 = 开口表(表);
const 帧数缓存 = new Map<string, number>();
const 文件帧数 = (f: string) => 帧数缓存.get(f) ?? 帧数缓存.set(f, 时长秒(f) * fps).get(f)!;
const 库路径 = (f: string) => path.relative(数据路径(), f);
const 库文件 = (id: string) => (锁[id] ? 库路径(字节路径(锁[id])) : `（资产锁没有 ${id}）`);
const 清单行 = ['段\t类\t名\t档\t文件\t起帧（段内）\t全片起帧\t帧数\t入点秒\t速率\t循环\t首帧增益\t末帧增益'];
let 声数 = 0;
for (const c of 截们) {
  const s = c.段;
  const comp = [...新段键].find(([, v]) => v === s.键)?.[0];
  const 新 = 段的清单(s, (id) => 解析资产(id, 锁).文件, 文件帧数, 台词配音, 开口, 上一段(s.键));
  for (const 类 of ['台词清单', '音效清单', '配乐清单'] as const) {
    const 旧们 = comp ? (JSON.parse(fs.readFileSync(path.join(旧表, '声音清单', 类, `${comp}.json`), 'utf8')) as 清单条[]) : [];
    const 新们 = 新[类];
    声数 += 新们.length;
    for (const x of 新们) {
      清单行.push([s.键, 类.slice(0, 2), x.名, x.档 ?? '', x.文件, x.起帧, c.全片起帧 + x.起帧, x.帧数, x.入点秒, x.速率, x.循环 ? 'True' : 'False', x.增益[0], x.增益.at(-1)].join('\t'));
    }
    if (旧们.length !== 新们.length) 记('音效清单', `${s.键} ${类}：旧 ${旧们.length} 条，新 ${新们.length} 条`);
    旧们.forEach((o, i) => {
      const n = 新们[i];
      const 旧id = 资产名(o.文件);
      const 毛病 = !n
        ? ['新的没有']
        : [
            (类 === '台词清单' ? 换台词(o.名) : o.名) !== n.名 && `名 ${o.名}→${n.名}`,
            (o.档 ?? '') !== (n.档 ?? '') && `档 ${o.档}→${n.档}`,
            库文件(旧id) !== n.文件 && `文件 ${o.文件}（${旧id}）→${n.文件}`,
            o.起帧 !== n.起帧 && `起帧 ${o.起帧}→${n.起帧}`,
            o.帧数 !== n.帧数 && `帧数 ${o.帧数}→${n.帧数}`,
            !近(o.入点秒, n.入点秒, 1e-9) && `入点秒 ${o.入点秒}→${n.入点秒}`,
            o.速率 !== n.速率 && `速率 ${o.速率}→${n.速率}`,
            o.循环 !== n.循环 && `循环 ${o.循环}→${n.循环}`,
            (o.增益.length !== n.增益.length || o.增益.some((g, f) => !近(g, n.增益[f]!, 1e-12))) && '增益曲线',
          ].filter(Boolean);
      if (毛病.length) 记('音效清单', `${s.键} ${类} 第 ${i + 1} 条（${o.名}）：${毛病.join('；')}`);
    });
  }
}
fs.writeFileSync(path.join(出, '音效清单.tsv'), 清单行.join('\n') + '\n');

// 同步表：按 段、声音、±1 帧配对（旧的只有第 6 章，事件帧是旧代码里扒的常数）
const 新行们 = 同步表行(截们, fps, 读音效起音());
fs.writeFileSync(path.join(出, '同步表.tsv'), ['段\t全局时间\t帧\t段内帧\t事件\t声音', ...新行们.map((r) => r.行)].join('\n') + '\n');
const 旧名文件 = new Map([...旧路径id].map(([p, id]) => [id, path.basename(p)]));
const 新同步 = 新行们.map((r) => {
  const x = r.行.split('\t');
  const 声 = x[5]!;
  return { 段: x[0]!, 帧: r.帧, 声: 声.includes('/') ? (旧名文件.get(声) ?? 声) : 声, 用: false };
});
const 同步差: string[] = ['类\t段\t帧\t事件\t声音\t说明'];
let 配上 = 0;
const 旧同步 = 读('同步表.tsv').trim().split('\n').slice(1).map((l) => l.split('\t'));
for (const r of 旧同步) {
  const 段 = 换段(r[0]!);
  const 声 = r[4]!.startsWith('台词 ') ? 换台词(r[4]!.slice(3).replace(/（开口）$/, '')) : r[5]!.replace(/（.*）$/, ''); // 旧表有的文件名后面带注
  if (r[2] === '') {
    同步差.push(`旧有、不在成片\t${段}\t${r[3]}（段内）\t${r[4]}\t${r[5]}\t旧表这一行没换成全片帧：${r[7]}`);
    continue;
  }
  const g = Number(r[2]);
  const 候 = 新同步.filter((n) => !n.用 && n.段 === 段 && n.声 === 声 && Math.abs(n.帧 - g) <= 1.0001).sort((a, b) => Math.abs(a.帧 - g) - Math.abs(b.帧 - g))[0];
  if (候) {
    候.用 = true;
    配上++;
  } else 同步差.push(`旧有新没有\t${段}\t${g}\t${r[4]}\t${r[5]}\t${r[6]}`);
}
const 新多 = 新同步.filter((n) => !n.用);
for (const n of 新多) 同步差.push(`新有旧没有\t${n.段}\t${n.帧.toFixed(1)}\t\t${n.声}\t${n.段.startsWith('7-') ? '旧同步表只有第 6 章' : ''}`);
fs.writeFileSync(path.join(出, '同步表差异.tsv'), 同步差.join('\n') + '\n');

fs.writeFileSync(path.join(出, '差异.tsv'), ['类\t说明', ...差].join('\n') + '\n');
const 第六章新多 = 新多.filter((n) => n.段.startsWith('6-')).length;
console.log(`台词落点 ${落点们.length} 条、字幕 ${字幕.屏们.length} 屏、音效清单 ${声数} 条（${截们.length} 段）`);
console.log(`同步表：旧 ${旧同步.length} 行、新 ${新同步.length} 行；配上 ${配上}，旧有新没有 ${同步差.filter((l) => l.startsWith('旧有')).length}，第 6 章新有旧没有 ${第六章新多}，第 7 章 ${新多.length - 第六章新多}（明细 同步表差异.tsv）`);
if (差.length) {
  console.log(`对不上 ${差.length} 条（${出}/差异.tsv）：\n${差.slice(0, 40).join('\n')}`);
  process.exitCode = 1;
} else console.log(`台词落点、字幕表、SRT、音效清单和基线逐条一致（旧名换成新名后）；产物在 ${出}`);
