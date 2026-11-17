// anim trial list：打印调试、试看开关的登记表（engine/core/调试开关.ts），试看名字、「关」的项、调试环境变量都在这一处列全。
import type { Command } from '../cli/命令.ts';
import { UsageError } from '../cli/参数.ts';
import { formatSwitchTable } from './试看表.ts';

export const trialCommands: Record<string, Command> = {
  trial: {
    usage: 'trial list',
    note: '列出全部试看参数（REMOTION_ANIM_TRIAL 的键）、「关」能关的项、页面认的调试环境变量：管什么、改不改画面、谁认（still、film 试看模式、bench）、值的格式、落点文件、还在哪条分支上。登记表在 engine/core/调试开关.ts，新名字先登记（anim check 的 debug 规则两头查）',
    noRecord: true,
    跑: async (args) => {
      if (args.length !== 1 || args[0] !== 'list') throw new UsageError('要 anim trial list');
      console.log(formatSwitchTable());
    },
  },
};
