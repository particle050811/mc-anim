// 调 py/anim_py/配音（python -m anim_py.配音 <动作> <请求.json>）：请求写临时文件，结果是 stdout 最后一行的 JSON，进度（stderr）直接给人看。
// 跑在项目 venv 里（uv run --project，版本按 uv.lock）：pypinyin 是项目依赖、钉 0.55.0，口型按拼音拆音素，换版本可能改嘴（第 6、7 章的口型是 0.55.0 算的）。
// 复核要 torch，在 voice-review 组里，只有复核时才带 --group 装上。
import spawn from 'cross-spawn';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../环境/配置.ts';
import { codeRoot } from '../环境/路径.ts';

/** 和 pyproject.toml 的 pypinyin 钉的版本一样（测试核对） */
export const pypinyinVersion = '0.55.0';
export const reviewGroup = 'voice-review';

export const voicePyCommand = (action: string, requestFile: string, groups: readonly string[] = []) => [
  'uv', 'run', '-q', '--frozen', '--project', codeRoot(), ...groups.flatMap((g) => ['--group', g]), 'python', '-m', 'anim_py.配音', action, requestFile,
];

export const runVoicePy = <T>(action: string, request: unknown, groups: readonly string[] = []): Promise<T> =>
  new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-voice-'));
    const f = path.join(dir, '请求.json');
    fs.writeFileSync(f, JSON.stringify(request));
    const cmd = voicePyCommand(action, f, groups);
    const env: NodeJS.ProcessEnv = { ...process.env, PYTHONPATH: path.join(codeRoot(), 'py'), PYTHONIOENCODING: 'utf-8', ANIM_FFMPEG: config('ffmpeg'), ANIM_FFPROBE: config('ffprobe') };
    delete env.VIRTUAL_ENV; // 外面激活的别的 venv 不管（uv 会对着它打警告）
    const child = spawn(cmd[0]!, cmd.slice(1), { env, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (d: string) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => {
      fs.rmSync(dir, { recursive: true, force: true });
      if (code !== 0) return reject(new Error(`anim_py.配音 ${action} 失败（退出码 ${code}）${out.trim() ? '：' + out.trim().slice(-500) : ''}`));
      try {
        resolve(JSON.parse(out.trim().split('\n').at(-1)!) as T);
      } catch {
        reject(new Error(`anim_py.配音 ${action} 的输出不是 JSON：${out.slice(-500)}`));
      }
    });
  });
