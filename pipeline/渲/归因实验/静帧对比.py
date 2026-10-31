#!/usr/bin/env python3
# 交替量 anim still 现状和批量（ANIM_STILL_批=1）。静帧对比.py <输出目录> <轮数> <段:名:帧,帧,帧>…。PNG 挪到 <输出>/<名>/<模式>-<轮>/，结果写 结果.tsv。归因实验用，不合并。
import csv, os, re, shutil, subprocess, sys, time, hashlib
out, 轮, *cases = sys.argv[1:]
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
os.makedirs(out, exist_ok=True)
tsv = os.path.join(out, '结果.tsv')
new = not os.path.exists(tsv)
f = open(tsv, 'a', newline='')
w = csv.writer(f, delimiter='\t')
if new: w.writerow(['例','段','帧','轮','模式','墙钟秒','出帧秒','负载1分','sha前16'])
for r in range(1, int(轮)+1):
    for c in cases:
        段, 名, 帧 = c.split(':')
        帧们 = 帧.split(',')
        # 每例内部先后交替：奇数轮先现状，偶数轮先批量
        for 模式 in (['现状','批量'] if r % 2 else ['批量','现状']):
            dst = os.path.join(out, 名, f'{模式}-{r}')
            if os.path.exists(os.path.join(dst, '.好')): continue
            env = dict(os.environ)
            if 模式 == '批量': env['ANIM_STILL_批'] = '1'
            主题 = f'工作-静帧比{int(time.time())}'
            t = time.time()
            p = subprocess.run([os.path.join(root,'anim'),'still',段,*帧们,'--到预览',主题], cwd=root, env=env, capture_output=True, text=True)
            秒 = time.time() - t
            if p.returncode != 0:
                print(p.stdout[-1500:], p.stderr[-1500:], flush=True); sys.exit(1)
            m = re.search(r'静帧在 (.+)', p.stdout)
            出帧 = re.search(r'出帧 ([0-9.]+)', p.stdout)
            d = m.group(1).strip()
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if os.path.exists(dst): shutil.rmtree(dst)
            shutil.move(d, dst)
            shas = []
            for x in sorted(os.listdir(dst)):
                if x.endswith('.png'): shas.append(hashlib.sha256(open(os.path.join(dst,x),'rb').read()).hexdigest()[:16])
            open(os.path.join(dst,'.好'),'w').close()
            load = os.getloadavg()[0]
            w.writerow([名,段,帧,r,模式,round(秒,1),出帧.group(1) if 出帧 else '',round(load,2),','.join(shas)]); f.flush()
            print(r, 名, 模式, round(秒,1), 出帧.group(1) if 出帧 else '', '负载', round(load,2), flush=True)
