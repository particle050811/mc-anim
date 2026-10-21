// sr edit-package <交付目录> [--拆音效] [--重做画面] [--不导入]；sr jianying export <包> | readback <包或调整文件> [--不拉]
import type { 命令 } from '../../cli/命令.ts';
import { 用法错误, 解析参数 } from '../../cli/参数.ts';
import { 出剪辑包 } from './剪辑包.ts';
import { 找包, 导入剪映, 读回调整 } from './剪映.ts';

export const 剪映命令: Record<string, 命令> = {
  'edit-package': {
    用法: 'edit-package <交付目录> [--拆音效] [--重做画面] [--不导入]',
    说明: '照一次 sr film 的交付出剪辑包（交付目录/剪辑包/：不带字幕的 2K 每帧关键帧画面、每句 AI 配音、字幕、配乐和音效），出完写进剪映草稿；--拆音效 照段.ts 的 cue 一声一个片段',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 开关: ['--拆音效', '--重做画面', '--不导入'] });
      if (p.位置.length !== 1) throw new 用法错误('要给一个交付目录（sr film 出的，或 交付/ 下的文件夹名）');
      await 出剪辑包(p.位置[0]!, { 拆音效: p.开关.has('--拆音效'), 重做画面: p.开关.has('--重做画面'), 不导入: p.开关.has('--不导入'), 记录 });
    },
  },
  jianying: {
    用法: 'jianying export <剪辑包或交付目录> | jianying readback <剪辑包、交付目录或 调整-*.json> [--不拉]',
    说明: 'export：按剪辑包的 清单.json 重建剪映草稿（剪映开着这个草稿就先让它退出）；readback：从剪映草稿拉一份 调整-*.json，和清单比出谁挪了多少、注释和录音',
    跑: async (args) => {
      const p = 解析参数(args, { 开关: ['--不拉'] });
      const [动作, 路径] = p.位置;
      if (p.位置.length !== 2 || (动作 !== 'export' && 动作 !== 'readback')) throw new 用法错误('jianying export <包> 或 jianying readback <包或调整文件>');
      if (动作 === 'export') {
        if (p.开关.has('--不拉')) throw new 用法错误('--不拉 只给 readback 用');
        await 导入剪映(找包(路径!));
      } else {
        await 读回调整(找包(路径!), p.开关.has('--不拉'));
      }
    },
  },
};
