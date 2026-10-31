#!/usr/bin/env python3
# 比.py <目录>：所有 framemd5 和第一个 0 变体比，报每个文件不同的帧数。
import glob, os, sys
d = sys.argv[1]
def rd(f): return [l.strip().split(',')[-1].strip() for l in open(f) if not l.startswith('#')]
fs = sorted(glob.glob(os.path.join(d,'*.framemd5')))
base = [f for f in fs if os.path.basename(f).startswith('0-')][0]
b = rd(base)
print('基准', os.path.basename(base), len(b), '帧')
for f in fs:
    x = rd(f)
    diff = [i for i,(p,q) in enumerate(zip(b,x)) if p!=q]
    print(os.path.basename(f).ljust(24), len(x), '帧 不同', len(diff), (diff[:10] if diff else ''))
