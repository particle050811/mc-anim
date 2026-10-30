// 调 py/anim_py/配音（python -m anim_py.配音 <动作> <请求.json>）：请求写临时文件，结果是 stdout 最后一行的 JSON，进度（stderr）直接给人看。
// 用 uv 临时环境跑，不进项目 venv；pypinyin 钉版本：口型按拼音拆音素，换版本可能改嘴（第 6、7 章的口型是 0.55.0 算的，旧项目 qwen-aligner 的 venv）。
import spawn from 'cross-spawn';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { 配置 } from '../环境/配置.ts';
import { 代码根 } from '../环境/路径.ts';

export const pypinyin版本 = '0.55.0';

export const 配音py命令 = (动作: string, 请求文件: string) => [
  'uv', 'run', '-q', '--no-project', '--with', `pypinyin==${pypinyin版本}`, 'python', '-m', 'anim_py.配音', 动作, 请求文件,
];

export const 跑配音py = <T>(动作: string, 请求: unknown): Promise<T> =>
  new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-voice-'));
    const f = path.join(dir, '请求.json');
    fs.writeFileSync(f, JSON.stringify(请求));
    const cmd = 配音py命令(动作, f);
    const env = { ...process.env, PYTHONPATH: path.join(代码根(), 'py'), PYTHONIOENCODING: 'utf-8', ANIM_FFMPEG: 配置('ffmpeg'), ANIM_FFPROBE: 配置('ffprobe') };
    const child = spawn(cmd[0]!, cmd.slice(1), { env, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (d: string) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => {
      fs.rmSync(dir, { recursive: true, force: true });
      if (code !== 0) return reject(new Error(`anim_py.配音 ${动作} 失败（退出码 ${code}）${out.trim() ? '：' + out.trim().slice(-500) : ''}`));
      try {
        resolve(JSON.parse(out.trim().split('\n').at(-1)!) as T);
      } catch {
        reject(new Error(`anim_py.配音 ${动作} 的输出不是 JSON：${out.slice(-500)}`));
      }
    });
  });
