// Photon 大气的组件（React、R3F、Remotion 的钩子）和散射表、云噪声的载入；算法、共用 uniform、状态都在 大气.ts（纯计算，单测能直接导入）。
// 许可同 大气.ts（Photon Shaders License Agreement，全文见 engine/light/大气/Photon-LICENSE.txt）。
import { useThree } from '@react-three/fiber';
import React, { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import * as THREE from 'three';
import { useWriter, newWriteSlot } from '../core/写入者.ts';
import { applyAtmosphere, applyCloudOnly, atmoSwitchOff, atmosphere, disableAtmosphere, type CloudTextures } from './大气.ts';
import scatteringBin from 'asset:数据/大气/散射';
import noiseBin from 'asset:数据/大气/噪声';
import worleyBubblyBin from 'asset:数据/大气/沃利-泡';
import worleySwirleyBin from 'asset:数据/大气/沃利-卷';

// ---------- 散射表（32 μs × 64 μ × 32 ν × RGB，半精度；Photon 的 Rec.2020 工作色彩空间） ----------
let lut: Float32Array | null = null;
let lutLoading: Promise<Float32Array> | null = null;
const loadLut = () =>
  (lutLoading ??= fetch(scatteringBin)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const h = new Uint16Array(buf);
      const f = new Float32Array(h.length);
      for (let i = 0; i < h.length; i++) f[i] = THREE.DataUtils.fromHalfFloat(h[i]);
      lut = f;
      return f;
    }));

// 云的噪声（Photon image/ 下的原件）：noise.png 512² RGBA（转成了不带预乘的原始字节）、worley_bubbly / worley_swirley 64³ 单通道；Photon 的 .mcmeta 是线性过滤、平铺
let cloudTexLoading: Promise<CloudTextures> | null = null;
const fetchBytes = (url: string) => fetch(url).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b));
const loadCloudTextures = () =>
  (cloudTexLoading ??= Promise.all([fetchBytes(noiseBin), fetchBytes(worleyBubblyBin), fetchBytes(worleySwirleyBin)]).then(([n, wb, ws]) => {
    const noise = new THREE.DataTexture(n, 512, 512, THREE.RGBAFormat, THREE.UnsignedByteType);
    const worley = (d: Uint8Array) => {
      const t = new THREE.Data3DTexture(d, 64, 64, 64);
      t.format = THREE.RedFormat;
      t.wrapR = THREE.RepeatWrapping;
      return t;
    };
    const out = { noise: noise, worleyBubbly: worley(wb), worleySwirley: worley(ws) };
    for (const t of [out.noise, out.worleyBubbly, out.worleySwirley]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      t.unpackAlignment = 1;
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
    }
    return out;
  }));

// 全开（Atmosphere）和只开云（CloudOnlyAtmosphere）共用一个槽，切点两边可以是不同的一种：接手的组件自己把另一种的开关关掉，不等旧画布卸载
const atmosphereSlot = newWriteSlot();

// 放进画布里打开：sun = 场景坐标指向太阳；far = 地形远端（米，边界雾在这里融进天色）。卸载时关
export const Atmosphere: React.FC<{ sun: [number, number, number]; far: number; enabled?: boolean }> = ({ sun, far, enabled = true }) => {
  useWriter(atmosphereSlot, disableAtmosphere);
  atmosphere.cloudsOnly = false;
  atmosphere.cloudLight = null;
  const advance = useThree((s) => s.advance);
  const [data, setData] = useState(atmosphere.clouds && lut);
  const [release] = useState(() => {
    if (atmosphere.clouds && lut) return () => {};
    const handle = delayRender('大气散射表和云的噪声');
    let done = false;
    return () => {
      if (!done) continueRender(handle);
      done = true;
    };
  });
  useEffect(() => {
    if (!data)
      Promise.all([loadLut(), loadCloudTextures()]).then(([l, c]) => {
        atmosphere.clouds = c;
        setData(l);
      }, (e) => cancelRender(e));
  }, [data]);
  if (data) applyAtmosphere(data, sun, far);
  // 地下保留已经认可的大气后期时仍需准备散射表，但场景本身继续用地下雾。
  if (!enabled) atmoSwitchOff();
  useEffect(() => {
    if (!data) return;
    advance(performance.now());
    release();
  }, [data, advance, release]);
  return null;
};

// 只开 Photon 的云（暮色森林，用户 10-15 定「Photon 云 + 暮色光照」）：天、雾、灯都还是那个世界自己的（atmoP 不开，材质的雾、穹顶不换），
// 云远处融进的天色图按 skyAt（场景坐标的方向 → 线性颜色）展开，日光 light、天光 ambient 是线性颜色。key：天色、光变了就换一个（同一个 key 只展开一次）
export const CloudOnlyAtmosphere: React.FC<{ sun: [number, number, number]; skyAt: (d: number[]) => number[]; light: number[]; ambient: number[]; skyKey: string }> = ({ sun, skyAt, light, ambient, skyKey }) => {
  useWriter(atmosphereSlot, disableAtmosphere);
  const advance = useThree((s) => s.advance);
  const [ready, setReady] = useState(atmosphere.clouds !== null);
  const [release] = useState(() => {
    if (atmosphere.clouds) return () => {};
    const handle = delayRender('云的噪声');
    let done = false;
    return () => {
      if (!done) continueRender(handle);
      done = true;
    };
  });
  useEffect(() => {
    if (!ready) loadCloudTextures().then((c) => ((atmosphere.clouds = c), setReady(true)), (e) => cancelRender(e));
  }, [ready]);
  applyCloudOnly({ sun, skyAt, light, ambient, skyKey });
  useEffect(() => {
    if (!ready) return;
    advance(performance.now());
    release();
  }, [ready, advance, release]);
  return null;
};
