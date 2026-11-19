// anim impact [--vs <检出|分支|提交>] [--at <检出|分支|提交>] [<段选择器…>] [--json]：改动影响面（用户 11-19 要像单元测试那样防「顾头不顾尾」），做法见 docs/时间轴.md「anim impact」。
import type { Command } from '../cli/命令.ts';
import { parseArgs } from '../cli/参数.ts';
import { workName, workRoot } from '../环境/作品.ts';
import { codeRoot } from '../环境/路径.ts';
import { selectSegs } from '../清单/清单.ts';
import { filmProfile } from '../渲/设置.ts';
import { compareSnapshots, formatImpact } from './影响面.ts';
import { loadSnapshot, resolveOther, selfSideLabel, workRootIn, type OtherSide } from './影响面源.ts';

export const impactCommands: Record<string, Command> = {
  impact: {
    usage: 'impact [--vs <检出|分支|提交>] [--at <检出|分支|提交>] [<段选择器…>] [--json]',
    note: '改动影响面：在本检出和 --vs（默认 main；检出用它工作区的文件，认不出再当 git 提交、git archive 到临时目录）上各算一遍全片快照（段长和成片起止、每一截声音、镜头切点、动作体检的逐帧动作轨），按段内时间对齐比较，先报段长变了导致后面整体平移多少，再按段列平移以外真变了的：声音增删、挪了多少秒、入点、增益、被截断状态，切镜，各镜各轨最大偏移和出现区间（小于 1e-4 格不算）。不渲染；两边都在本进程按各自的代码根打包加载，用本检出的算法算。--at 换掉新的那一边（默认本检出），比如 --vs e98e94cc^ --at e98e94cc 看那一次提交改了什么。段选择器只筛列哪些段。--json 打整份比较结果',
    跑: async (args) => {
      const p = parseArgs(args, { value: ['--vs', '--at'], toggles: ['--json'] });
      const keys = p.位置.length ? (await selectSegs(p.位置)).filter((s) => s.章 !== '核对').map((s) => s.key) : undefined;
      const sides: OtherSide[] = [];
      try {
        const other = resolveOther(p.value['--vs'] ?? 'main');
        sides.push(other);
        const self: OtherSide = p.value['--at'] ? resolveOther(p.value['--at']) : { dir: codeRoot(), label: selfSideLabel(), cleanup: () => {} };
        sides.push(self);
        const work = workName();
        const fps = filmProfile().fps;
        const snapshot = (side: OtherSide, role: string) => {
          console.error(`== 算${role} ${side.label} 的快照（${side.dir}）`);
          return loadSnapshot({ root: side.dir, workRoot: workRootIn(side.dir, workRoot()), work, label: side.label });
        };
        const oldSnap = await snapshot(other, '旧的一边');
        const newSnap = await snapshot(self, '新的一边');
        const report = compareSnapshots(oldSnap, newSnap, { work, fps });
        if (p.toggles.has('--json')) console.log(JSON.stringify(keys ? { ...report, segments: report.segments.filter((s) => keys.includes(s.key)) } : report, null, 2));
        else for (const line of formatImpact(report, { keys })) console.log(line);
      } finally {
        for (const s of sides) s.cleanup();
      }
    },
  },
};
