// 用法：node 分类.mjs <a.cpuprofile> <b…>：把 AO 各遍的采样按用途分类（毫秒/帧），多份取中位。归因实验用，不合并。
import fs from 'node:fs';
const 文件 = process.argv.slice(2);
const 全 = new Map();
const 汇 = (k, 第, v) => { if (!全.has(k)) 全.set(k, 文件.map(() => 0)); 全.get(k)[第] += v; };
const 中 = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
文件.forEach((f, 第) => {
  const pf = JSON.parse(fs.readFileSync(f, 'utf8'));
  const 帧数 = JSON.parse(fs.readFileSync(f.replace('.cpuprofile', '.帧.json'))).帧数;
  const nodes = new Map(pf.nodes.map((n) => [n.id, { ...n, self: 0 }]));
  for (const n of nodes.values()) for (const k of n.children ?? []) nodes.get(k).parent = n;
  pf.samples.forEach((id, i) => { nodes.get(id).self += (pf.timeDeltas[i] ?? 0) / 1000 / 帧数; });
  for (const n of nodes.values()) {
    if (!n.self) continue;
    const 链 = [];
    for (let x = n; x; x = x.parent) 链.push(x.callFrame.functionName);
    const 有 = (s) => 链.includes(s);
    const 遍i = 链.findIndex((s) => /^AO(第|水面|收集)/.test(s));
    const 遍 = 遍i >= 0 ? 链[遍i] : null;
    const fn = n.callFrame.functionName;
    const 原生 = !n.callFrame.url && !fn.startsWith('(');
    if (!遍) {
      const 顶 = 有('advance') ? 'advance 内、AO 遍外' : fn.startsWith('(') ? fn : 有('VoxelWorld') ? 'VoxelWorld 渲染' : /worker.onmessage/.test(链.join()) ? 'worker.onmessage（收区段、网格）' : '其它页面 JS';
      汇(`[页面] ${顶}`, 第, n.self);
      continue;
    }
    let 类;
    const 阴影 = 有('WebGLShadowMap.render');
    if (原生) {
      if (/^create(Buffer|VertexArray)$|^bufferData$|^bufferSubData$|^bindVertexArray$|^drawElements$|^drawArrays$/.test(fn)) 类 = `GL ${fn}`;
      else if (/^uniform/.test(fn)) 类 = 'GL uniform*';
      else if (/^(enable|disable)VertexAttribArray$|^vertexAttrib|^bindBuffer$/.test(fn)) 类 = 'GL 设置顶点属性、bindBuffer';
      else 类 = 'GL 其它';
    } else if (有('updateMatrixWorld') ) 类 = 'JS 矩阵更新 updateMatrixWorld';
    else if (有('projectObject')) 类 = 链.slice(0, 链.indexOf('projectObject')).some((s) => s === 'update') ? 'JS projectObject → objects.update' : 'JS projectObject 自身（视锥、算 z、入表）';
    else if (链.slice(0, 遍i).includes('sort')) 类 = 'JS 排序';
    else if (有('WebGLRenderer.renderBufferDirect')) 类 = 'JS renderBufferDirect（setup、needsUpdate、VAO 配置）';
    else if (有('setProgram')) 类 = 'JS setProgram（取程序、传 uniform）';
    else if (阴影 && fn === 'renderObject' ) 类 = 'JS 阴影 renderObject（遍历、视锥、算矩阵）';
    else if (有('renderObject')) 类 = 'JS renderObject（矩阵、灯光、状态）';
    else 类 = 'JS 其它';
    汇(`[${遍}] ${阴影 ? '阴影 ' : ''}${类}`, 第, n.self);
    汇(`[合计] ${类}`, 第, n.self);
    汇(`[遍和] ${遍}`, 第, n.self);
  }
});
const 行 = [...全.entries()].map(([k, a]) => [k, 中(a), Math.min(...a), Math.max(...a)]);
行.sort((x, y) => x[0].split(']')[0].localeCompare(y[0].split(']')[0]) || y[1] - x[1]);
for (const [k, m, lo, hi] of 行) if (m >= 0.3) console.log(k.padEnd(64), m.toFixed(1).padStart(7), `[${lo.toFixed(1)}～${hi.toFixed(1)}]`);
