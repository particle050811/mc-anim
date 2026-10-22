// anim verify [<选择器…>] [--渲] [--对基线] [--到预览 <主题>]：指纹和认可记录不一样的段抽帧比，超过阈值就要 accept；
//   --对基线：不看认可记录，直接和数据根 基线/<旧段号>/ 的旧项目基线比（迁移验收用，旧段号查 作品/应力转动/旧名.tsv）。
//   变了的帧出 旧|新|差 的并排图进预览（没给 --到预览 就新开一个「验收不过」）。
// anim verify accept <段> --理由 <…> [--渲]：把现在的母版记成认可版，写 作品/应力转动/认可/<平台>/<段键>.toml（进 Git）。
// 一律按视频级的母版比；抽帧解码过放行闸，缺母版加 --渲 时渲染过渲染闸。
import fs from 'node:fs';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 提交状态 } from '../环境/路径.ts';
import { 全部段, 选段, type 段信息 } from '../清单/清单.ts';
import { 母版路径 } from '../渲/母版.ts';
import { 渲染参数 } from '../渲/设置.ts';
import { 渲染母版 } from '../渲/渲.ts';
import { 算段指纹 } from '../指纹/指纹.ts';
import { 过放行闸 } from '../闸/闸.ts';
import { 新建预览目录 } from '../预览/预览.ts';
import { utc时间, type 运行记录 } from '../运行记录/记录.ts';
import { 基线参照, 基线目录, 旧段号 } from './基线.ts';
import { 读阈值 } from './比较.ts';
import { 本平台, 读认可, 写认可, 认可文件 } from './认可.ts';
import { 扫母版, 变了, type 扫描结果 } from './验收.ts';

const 级别 = '视频' as const;

/** 每段现在的指纹和母版；缺母版时 --渲 就渲，不渲就记下 */
const 备母版 = async (段们: 段信息[], 渲: boolean, 记录: 运行记录) => {
  const 参数 = 渲染参数(级别);
  const r = await Promise.all(段们.map(async (s) => ({ 段: s, 指纹: (await 算段指纹(s, 参数)).指纹 })));
  const 缺 = r.filter((x) => !fs.existsSync(母版路径(x.段.键, x.指纹)));
  if (缺.length && 渲) await 渲染母版(缺.map((x) => x.段), 级别, { 记录 });
  return r.map((x) => ({ ...x, 母版: 母版路径(x.段.键, x.指纹), 有: fs.existsSync(母版路径(x.段.键, x.指纹)) }));
};

const 验: 命令 = {
  用法: 'verify [<选择器…>] [--渲] [--对基线] [--到预览 <主题>]；verify accept <段> --理由 <…> [--渲]',
  说明: '指纹变了的段抽帧和认可版比（--对基线 和旧项目基线比），超过阈值就要 anim verify accept',
  跑: async (args, 记录) => {
    if (args[0] === 'accept') return 认.跑(args.slice(1), 记录);
    const p = 解析参数(args, { 值: ['--到预览'], 开关: ['--渲', '--对基线'] });
    const 对基线 = p.开关.has('--对基线');
    const 段们 = p.位置.length ? await 选段(p.位置) : await 全部段();
    const 阈 = 读阈值();
    const 备 = await 备母版(段们, p.开关.has('--渲'), 记录);
    const 预览 = { 目录: null as string | null };
    const 取预览 = () => (预览.目录 ??= 新建预览目录(p.值['--到预览'] ?? '验收不过'));
    let 不过 = 0;
    const 报 = (键: string, 比的: string, r: 扫描结果) => {
      const 帧变 = r.帧结论.filter((f) => f.结论 === '变了');
      const 容差内 = r.帧结论.filter((f) => f.结论 === '容差内').length;
      if (!变了(r)) {
        console.log(`✓ ${键}：和${比的}比在阈值内（${r.比法}；${容差内} 帧有微小差别；声音${r.音频结论}${r.音频说明 ? `，${r.音频说明}` : ''}）`);
        return;
      }
      不过++;
      const 项 = [r.尺寸变了, ...帧变.slice(0, 8).map((f) => `第 ${f.帧} 帧：${f.说明 ?? '变了'}`), 帧变.length > 8 ? `另 ${帧变.length - 8} 帧` : undefined, r.音频结论 === '变了' ? `声音：${r.音频说明}` : undefined];
      记录.记('错误', `${键}：和${比的}比变了（${r.比法}）\n    ${项.filter(Boolean).join('\n    ')}`);
    };
    await 过放行闸(async () => {
      for (const x of 备) {
        const 键 = x.段.键;
        const 认可 = 读认可(认可文件(键));
        if (!x.有) {
          不过++;
          记录.记('错误', `${键}：没有现在指纹 ${x.指纹.slice(0, 16)} 的母版（anim render ${键}，或加 --渲）`);
          continue;
        }
        if (对基线) {
          const 旧号 = 旧段号(键);
          const 目录 = 旧号 ? 基线目录(旧号) : null;
          if (!目录 || !fs.existsSync(目录)) {
            不过++;
            记录.记('错误', `${键}：没有基线（${旧号 ? `${目录} 不在` : '作品/应力转动/旧名.tsv 里没有它的旧段号'}）`);
            continue;
          }
          const r = await 扫母版(x.母版, { 参照: await 基线参照(目录), 阈值: 阈, fps: x.段.段.fps, 预览: { 目录: 取预览, 前缀: 键 } });
          报(键, `基线 ${旧号}`, r);
          continue;
        }
        if (!认可) {
          不过++;
          记录.记('错误', `${键}：还没认可过（看过母版后 anim verify accept ${键} --理由 …）`);
          continue;
        }
        if (认可.指纹 === x.指纹) {
          console.log(`✓ ${键}：指纹和认可版一样`);
          continue;
        }
        const r = await 扫母版(x.母版, { 认可, 旧母版: 母版路径(键, 认可.指纹), 阈值: 阈, fps: x.段.段.fps, 预览: { 目录: 取预览, 前缀: 键 } });
        报(键, `认可版（${认可.指纹.slice(0, 16)}，${认可.认可于}）`, r);
      }
    });
    if (预览.目录) {
      记录.产物.push(预览.目录);
      console.log(`变了的帧（旧|新|差 并排）在 ${预览.目录}`);
    }
    console.log(不过 ? `\n${不过} 段没过：缺母版的先渲；变了的看过画面、确认是要的改动，再 anim verify accept <段> --理由 …` : `\n${段们.length} 段都过了`);
    return 不过 ? 1 : 0;
  },
};

const 认: 命令 = {
  用法: 'verify accept <段> --理由 <…> [--渲]',
  说明: '把现在的母版记成认可版（写 作品/应力转动/认可/<平台>/<段键>.toml）',
  跑: async (args, 记录) => {
    const p = 解析参数(args, { 值: ['--理由'], 开关: ['--渲'] });
    if (p.位置.length !== 1) throw new 用法错误('一次认可一段：anim verify accept <段> --理由 …');
    const 理由 = p.值['--理由']?.trim();
    if (!理由) throw new 用法错误('要写 --理由（这次画面为什么变、谁看过）');
    const 段们 = await 选段(p.位置);
    if (段们.length !== 1) throw new 用法错误(`「${p.位置[0]}」对上了 ${段们.length} 段，一次只认可一段`);
    const [x] = await 备母版(段们, p.开关.has('--渲'), 记录);
    if (!x!.有) throw new Error(`${x!.段.键} 没有现在指纹 ${x!.指纹.slice(0, 16)} 的母版：先 anim render ${x!.段.键}，或加 --渲`);
    const file = 认可文件(x!.段.键);
    const 旧 = 读认可(file);
    const r = await 过放行闸(() => 扫母版(x!.母版));
    const 提交 = 提交状态();
    写认可(file, {
      段: x!.段.键,
      指纹: x!.指纹,
      平台: 本平台(),
      渲染级别: 级别,
      认可于: utc时间(),
      提交: 提交 ? `${提交.提交}${提交.有改动 ? '+未提交改动' : ''}` : '不在 git 里',
      理由,
      上一版指纹: 旧?.指纹 ?? null,
      ...r.签名,
    });
    记录.产物.push(file);
    console.log(`已认可 ${x!.段.键}（${x!.指纹.slice(0, 16)}，${r.签名.帧.length} 帧签名）→ ${file}\n记得把它和这次的改动一起提交`);
  },
};

export const 验收命令: Record<string, 命令> = { verify: 验 };
