// sr assets add <id> <文件>：把一件已在资产表登记的资产按 sha 放进 store/（私有的进 私有/），写进资产锁。
// 从旧项目批量导入走 M2 的导入工具；这里只管单件（自制的、新生成的）。
import fs from 'node:fs';
import path from 'node:path';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 库名, 读资产表 } from './资产表.ts';
import { 入库, 写资产锁, 读资产锁 } from './资产锁.ts';

export const 资产命令: Record<string, 命令> = {
  assets: {
    用法: 'assets add <id> <文件> [--替换]',
    说明: '一件资产入库（按 sha 放进 store/ 或 私有/）并写资产锁',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 开关: ['--替换'] });
      const [子, id, 文件] = p.位置;
      if (子 !== 'add' || !id || !文件 || p.位置.length !== 3) throw new 用法错误('要 sr assets add <id> <文件>');
      const 表 = 读资产表();
      const 条目 = 表.条目.get(id);
      if (!条目) throw new Error(`资产表里没有「${id}」，先在 assets/registry/<类>.toml 里写好 id、类别、来源、许可、可见性`);
      if (!fs.statSync(文件).isFile()) throw new Error(`${文件} 不是文件`);
      const 锁 = 读资产锁();
      const 新 = 入库(path.resolve(文件), 库名(条目.可见性));
      const 旧 = 锁[id];
      if (旧 && 旧.sha256 !== 新.sha256 && !p.开关.has('--替换')) {
        throw new Error(`「${id}」资产锁里已有另一份（sha ${旧.sha256.slice(0, 12)}），确实要换成新的加 --替换（旧字节留在库里）`);
      }
      锁[id] = 新;
      写资产锁(锁);
      记录.产物.push(`${id} → ${新.库}/${新.sha256}`);
      console.log(`${id}：${新.库}/${新.sha256.slice(0, 2)}/${新.sha256}（${新.大小} 字节，${新.后缀}）`);
    },
  },
};
