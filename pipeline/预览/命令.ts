import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 新建预览目录 } from './预览.ts';

export const 预览命令: Record<string, 命令> = {
  preview: {
    用法: 'preview new <主题>',
    说明: '在主检出的 预览/ 下建 <UTC 月日-时分>-<主题>/，打印路径',
    跑: async (args, 记录) => {
      const p = 解析参数(args, {});
      if (p.位置[0] !== 'new' || p.位置.length !== 2) throw new 用法错误('要 sr preview new <主题>');
      const dir = 新建预览目录(p.位置[1]!);
      记录.产物.push(dir);
      console.log(dir);
    },
  },
};
