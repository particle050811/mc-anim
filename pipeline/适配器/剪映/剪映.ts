// anim jianying export|readback 调 py/anim_py/剪辑微调/ 的 导入剪映.py、读取调整.py；剪映、草稿目录、解密程序的位置取 anim 的配置。
// 剪映存过的草稿是密文，读它（读回、导入前存旧草稿里的调整）要用剪映解密.cpp（clang++ 编、dlopen 剪映自己的库）；导入时解不开就存一份原文件照样写。
import fs from 'node:fs';
import path from 'node:path';
import { 交付根, 配置, 剪映解密程序 } from '../../环境/配置.ts';
import { 代码根 } from '../../环境/路径.ts';
import { 跑 } from '../../环境/子进程.ts';

/** 给交付目录（或 交付/ 下的文件夹名）也行：里面的 剪辑包/ */
export const 找包 = (arg: string) => {
  const p = fs.existsSync(arg) ? path.resolve(arg) : path.join(交付根(), arg);
  if (!fs.existsSync(p)) throw new Error(`没有 ${arg}（也不在 ${交付根()} 下）`);
  if (fs.statSync(p).isFile()) return p;
  if (fs.existsSync(path.join(p, '清单.json'))) return p;
  if (fs.existsSync(path.join(p, '剪辑包', '清单.json'))) return path.join(p, '剪辑包');
  throw new Error(`${p} 不是剪辑包（没有 清单.json），先 anim edit-package <交付目录>`);
};

const 剪映参数 = () => ['--草稿根', 配置('剪映草稿'), '--剪映', 配置('剪映'), '--解密程序', 剪映解密程序()];
const 跑py = (模块: string, args: string[]) =>
  跑(['uv', 'run', '-q', '--no-project', 'python', '-m', `anim_py.剪辑微调.${模块}`, ...args, ...剪映参数()], {
    env: { ...process.env, PYTHONPATH: path.join(代码根(), 'py'), ANIM_FFMPEG: 配置('ffmpeg'), ANIM_FFPROBE: 配置('ffprobe') },
  });

export const 导入剪映 = (包: string) => 跑py('导入剪映', [包]);
export const 读回调整 = (路径: string, 不拉: boolean) => 跑py('读取调整', [路径, ...(不拉 ? ['--不拉'] : [])]);
