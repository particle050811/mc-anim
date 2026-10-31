#!/usr/bin/env python3
# 交替对比：对比.py <输出目录> <轮数> <帧 a-b> <段> <变体…>（变体写 ANIM_X 的字母，空用 0 代表）。每轮每个变体跑一遍 bench，存 framemd5 和计时，mkv 用完就删。归因实验用，不合并。
import json, os, subprocess, sys, time, shutil, csv
out, 轮, 帧, 段, *变体 = sys.argv[1:]
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
os.makedirs(out, exist_ok=True)
tsv = os.path.join(out, '结果.tsv')
new = not os.path.exists(tsv)
f = open(tsv, 'a', newline='')
w = csv.writer(f, delimiter='\t')
if new: w.writerow(['轮','变体','总秒','首帧秒','出帧秒','收尾秒','每帧中位','P90','负载1分','md5文件'])
for r in range(1, int(轮)+1):
    for v in 变体:
        x = '' if v == '0' else v
        d = os.path.join(out, f'mkv-{v}-{r}')
        js = os.path.join(out, f'{v}-{r}.json')
        env = dict(os.environ, ANIM_Z='0', ANIM_ZE=json.dumps({'ANIM_X': x}))
        p = subprocess.run([os.path.join(root,'anim'),'bench',段,'--帧',帧,'--留输出',d,'--输出',js], cwd=root, env=env, capture_output=True, text=True)
        if p.returncode != 0:
            print(p.stderr[-2000:]); sys.exit(1)
        res = json.load(open(js))['轮'][0]
        mkv = res['输出']
        md5 = os.path.join(out, f'{v}-{r}.framemd5')
        subprocess.run(['ffmpeg','-v','error','-y','-i',mkv,'-map','0:v','-f','framemd5',md5],check=True)
        shutil.rmtree(d)
        load = os.getloadavg()[0]
        w.writerow([r,v,res['总秒'],res['首帧秒'],res['出帧秒'],res['收尾秒'],res['每帧中位毫秒'],res['每帧P90毫秒'],round(load,2),os.path.basename(md5)]); f.flush()
        print(r, v, res['总秒'], res['每帧中位毫秒'], res['每帧P90毫秒'], '负载', round(load,2), flush=True)
