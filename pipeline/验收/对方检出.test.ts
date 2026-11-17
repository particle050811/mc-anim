// anim still --vs 认对方检出。
import { describe, expect, it } from 'vitest';
import { checkoutLabel, parseWorktreeList } from './对方检出.ts';

describe('--vs 认检出', () => {
  it('git worktree list --porcelain 拆成目录和分支；文件夹名里 / 换掉', () => {
    const list = parseWorktreeList('worktree /a/mc-anim\nHEAD 1\nbranch refs/heads/main\n\nworktree /a/wt/x\nHEAD 2\ndetached\n\nworktree /a/wt/实验\nHEAD 3\nbranch refs/heads/实验/分级\n');
    expect(list).toEqual([{ dir: '/a/mc-anim', branch: 'main' }, { dir: '/a/wt/x', branch: null }, { dir: '/a/wt/实验', branch: '实验/分级' }]);
    expect(checkoutLabel('实验/分级', '/a/wt/实验')).toBe('实验_分级');
    expect(checkoutLabel(null, '/a/wt/x')).toBe('x');
  });
});
