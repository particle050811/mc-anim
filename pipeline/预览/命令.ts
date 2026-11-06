import { createRequire } from 'node:module';
import path from 'node:path';
import type { 命令 } from '../cli/命令.ts';
import { 缺的注册目录, 缺目录提示 } from '../段框架/注册目录.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 代码根, 相对代码根 } from '../环境/路径.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import { 前台跑 } from '../环境/子进程.ts';
import { 新建预览目录 } from './预览.ts';
import { 清理小结, 规划默认清理, 执行清理, 预览保留天数 } from './清理.ts';
import { 数据根 } from '../环境/配置.ts';
import { 全部段 } from '../清单/清单.ts';
import { 读作品资产锁 } from '../资产/资产锁.ts';
import { 补字节并报 } from '../资产/随仓库.ts';
import { 备好私有配乐, 缺配乐提示 } from '../资产/私有配乐.ts';
import { 渲前跑cues } from '../段框架/自动.ts';
import { 全表环境 } from '../渲/地形注入.ts';

/** Remotion CLI 的 js 入口：用 node 直接跑，不经 npx（Windows 上 npx 是 .cmd） */
const remotion入口 = () => {
  const 包 = createRequire(path.join(代码根(), 'package.json')).resolve('@remotion/cli/package.json');
  return path.join(path.dirname(包), 'remotion-cli.js');
};

export const 预览命令: Record<string, 命令> = {
  preview: {
    用法: `preview new <主题> | preview 清理 [--执行] [--天 ${预览保留天数}]`,
    说明:
      'new：在主检出的 预览/ 下建 <UTC 月日-时分>-<主题>/，打印路径；主题以「工作-」开头的是中间稿，建在数据根 run/草稿/ 下。每次 new 先顺手清理一遍。' +
      '清理：预览里超过天数的夹只留文字（说明、表格）挪进数据根 archive/预览/，图、视频、声音删掉，Git 管的文件按路径引用的照留；archive/预览/ 里的只留文字；草稿删按日期起名、超过 cache gc 草稿天数的。默认只打印',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 开关: ['--执行'], 值: ['--天'] });
      if (p.位置[0] === '清理' && p.位置.length === 1) {
        const 天数 = p.值['--天'] === undefined ? 预览保留天数 : Number(p.值['--天']);
        if (!Number.isFinite(天数) || 天数 < 0) throw new 用法错误('--天 要非负的数');
        const { 计划, 草稿 } = 规划默认清理(Date.now(), 天数);
        for (const x of 计划) console.log(`${x.归档到 ? '归档' : '瘦身'}  ${x.名}：留 ${x.留.length} 个文字，删 ${x.删.length} 个（${(x.删.reduce((n, f) => n + f.大小, 0) / 1024 / 1024).toFixed(0)} MB）`);
        for (const d of 草稿) console.log(`删草稿  ${d.名}（${(d.大小 / 1024 / 1024).toFixed(0)} MB）`);
        if (!计划.length && !草稿.length) return console.log('没有要清理的');
        if (!p.开关.has('--执行')) return console.log('只打印了；加 --执行 才动手');
        console.log(清理小结(执行清理(计划, 草稿)));
        return;
      }
      if (p.位置[0] !== 'new' || p.位置.length !== 2 || p.开关.size || Object.keys(p.值).length) throw new 用法错误('要 anim preview new <主题> 或 anim preview 清理 [--执行] [--天 N]');
      // 清理出错不挡建预览
      try {
        const { 计划, 草稿 } = 规划默认清理();
        const 小结 = 清理小结(执行清理(计划, 草稿));
        if (小结) console.error(`预览清理：${小结}`);
      } catch (e) {
        console.error(`!! 预览清理没做成（预览照建）：${(e as Error).message}`);
      }
      const dir = 新建预览目录(p.位置[1]!);
      记录.产物.push(dir);
      console.log(dir);
    },
  },
  studio: {
    用法: 'studio [<remotion studio 的参数…>]',
    说明: '开 Remotion Studio 在浏览器里预览所选作品（入口 <作品根>/index.ts，打包规则读 remotion.config.ts），参数原样转给 remotion studio',
    不记录: true,
    透传: true,
    // remotion.config.ts 在 Remotion CLI 进程里求值，靠 ANIM_WORK 知道是哪部作品（资产锁、求解入口按它取）。
    // 随仓库的字节、私有配乐（缺了换静音）先在这边备好，和 anim film 打包前一样（渲/渲.ts 的 打包）；段框架的段先对齐生成的声音文件（段框架/自动.ts）。
    // 开着 Studio 时改了 段.ts 的声音不会自动重生成，要手跑 anim cues。一个页面看全部段，地形版本传全表（渲/地形注入.ts），登记了新版本要重开
    跑: async (args) => {
      const 根 = 作品根();
      const 缺目录 = 缺的注册目录(根);
      if (缺目录.length) throw new Error(缺目录.map((d) => 缺目录提示(相对代码根(根), d)).join('\n'));
      for (const [k, x] of (await 渲前跑cues()).失败) console.error(`!! ${k} 的 anim cues 没跑通，Studio 里这段会报错：${x}`);
      补字节并报(根, 数据根());
      for (const x of 备好私有配乐(await 全部段(), 读作品资产锁(根), 数据根())) console.error(`!! ${缺配乐提示(x)}`);
      return 前台跑([process.execPath, remotion入口(), 'studio', 相对代码根(path.join(根, 'index.ts')), ...args], { cwd: 代码根(), env: { ...process.env, ...全表环境(), ANIM_WORK: 作品名() } });
    },
  },
};
