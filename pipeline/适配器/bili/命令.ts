// anim bili 导入 <json> | anim bili 分析：B 站创作中心数据（浏览器里跑 取数.js 下载的包）收进数据根，对本地交付出分析报告。
import fs from 'node:fs';
import path from 'node:path';
import type { 命令 } from '../../cli/命令.ts';
import { 用法错误, 解析参数 } from '../../cli/参数.ts';
import { 交付根 } from '../../环境/配置.ts';
import { 新建预览目录 } from '../../预览/预览.ts';
import { 导入, 最新数据, 解析 } from './数据.ts';
import { 图页, 说明, type 对上 } from './报告.ts';
import { 对交付, 按段统计, 段区间们, 读交付们, 默认开头窗 } from './时间轴.ts';

export const bili命令: Record<string, 命令> = {
  bili: {
    用法: 'bili 导入 <json> | bili 分析 [--开头窗 <秒>]',
    说明: '导入：把浏览器里 pipeline/适配器/bili/取数.js 下载的包挪进数据根 平台/bilibili/<UTC>/；分析：读最新一份，按标题和时长对到本作品的交付，出 预览/<UTC>-B站数据分析/（封标指标、开头时段和同账号其他稿件比、窗后按段的在场流失、建议；--开头窗 默认 40 秒）',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 值: ['--开头窗'] });
      const [动作, 文件] = p.位置;
      if (动作 === '导入') {
        if (p.位置.length !== 2) throw new 用法错误('要给浏览器下载的 bili-数据-*.json');
        const { 目标, 包 } = 导入(path.resolve(文件!));
        记录.产物.push(目标);
        console.log(`${目标}（${包.稿件.length} 个稿件，${包.请求数} 次请求${包.停于风控 ? `，取数中途遇风控停了：${包.停于风控}` : ''}）`);
        return;
      }
      if (动作 !== '分析' || p.位置.length !== 1) throw new 用法错误('bili 导入 <json> 或 bili 分析 [--开头窗 <秒>]');
      const 开头窗 = p.值['--开头窗'] === undefined ? 默认开头窗 : Number(p.值['--开头窗']);
      if (!Number.isFinite(开头窗) || 开头窗 < 0) throw new 用法错误('--开头窗 要给非负的秒数');
      const { f, 包 } = 最新数据();
      const 稿们 = 解析(包);
      const 交付们 = 读交付们(交付根());
      const 对上们: 对上[] = [];
      for (const 稿 of 稿们) {
        const 交 = 对交付(稿, 交付们);
        if (!交) continue;
        对上们.push({ 稿, 交付名: path.basename(交.目录), 交付完成: 交.m.完成, 开头窗, 段: 按段统计(段区间们(交.m), 稿.留存, 稿.弹幕秒, 开头窗) });
      }
      const dir = 新建预览目录('B站数据分析');
      const 图 = new Map<string, string>();
      对上们.forEach((x, i) => {
        const 名 = `${String(i + 1).padStart(2, '0')}-${x.稿.bvid}-留存与弹幕.html`;
        fs.writeFileSync(path.join(dir, 名), 图页(x), 'utf8');
        图.set(x.稿.bvid, 名);
      });
      fs.writeFileSync(path.join(dir, '00-说明.md'), 说明(稿们, 对上们, { 取于: 包.取于, 请求数: 包.请求数, 文件: f }, 图), 'utf8');
      记录.产物.push(dir);
      console.log(`${dir}\n${稿们.length} 个稿件，对上交付 ${对上们.length} 个：${对上们.map((x) => `${x.稿.标题} ↔ ${x.交付名}`).join('；') || '无'}`);
    },
  },
};
