// 冻结粗高度（anim world freeze）：把登记的那版地形包的 包.json 里的原点和粗高度图拷进 assets/冻结粗高度/<包>.json（为什么冻结见 engine/voxel/冻结粗高度.ts）。
// 旧项目 工具/导入/更新冻结粗高度.ts 搬来。冻结文件被编排 import，写了就让用它的段过期，所以：内容（版本、粗高度指纹、原点）一样时一个字节都不写；
// 不一样时默认只报告，加 --写 才写。粗高度变了，航线、巡航高度跟着变，写完要用静帧核对航线、重看配乐卡点。
import fs from 'node:fs';
import path from 'node:path';
import { 代码根 } from '../环境/路径.ts';
import { 载入体素库 } from './体素库.ts';
import { 版本目录, 读地形表 } from './版本.ts';

export const 冻结目录 = () => path.join(代码根(), 'assets', '冻结粗高度');
export const 已冻结的包 = () => (fs.existsSync(冻结目录()) ? fs.readdirSync(冻结目录()).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length)).sort() : []);

export type 冻结结果 = { 包: string; 版本: string; 指纹: string; 原: { 版本: string; 指纹: string } | null; 一样: boolean; 写了: boolean; 文件: string };

export const 冻结 = async (包们: string[], o: { 写: boolean }): Promise<冻结结果[]> => {
  const 库 = await 载入体素库();
  const 表 = 读地形表().包;
  const out: 冻结结果[] = [];
  for (const 包 of 包们.length ? 包们 : 已冻结的包()) {
    const 版本 = 表[包]?.版本;
    if (!版本) throw new Error(`assets/地形版本.json 没登记包 ${包}`);
    const 包json = path.join(版本目录(包, 版本), '包.json');
    if (!fs.existsSync(包json)) throw new Error(`没有 ${包json}：anim assets pull 拉地形包，或 anim world bake 烘`);
    const info = JSON.parse(fs.readFileSync(包json, 'utf8'));
    const 指纹 = 库.区段包.coarseHeightFingerprint(库.区段包.decodeCoarseHeight(info));
    const 文件 = path.join(冻结目录(), `${包}.json`);
    const 原 = fs.existsSync(文件) ? (JSON.parse(fs.readFileSync(文件, 'utf8')) as { 版本: string; 指纹: string; 原点: number[] }) : null;
    const 一样 = !!原 && 原.版本 === 版本 && 原.指纹 === 指纹 && JSON.stringify(原.原点) === JSON.stringify(info.原点);
    let 写了 = false;
    if (!一样 && o.写) {
      const 文 = { 说明: 'anim world freeze 从登记的那版区段包的 包.json 拷的原点和粗高度图，别手改', 包, 版本, 指纹, 维度: info.维度, 原点: info.原点, 粗高度: info.粗高度 };
      fs.mkdirSync(冻结目录(), { recursive: true });
      fs.writeFileSync(文件, JSON.stringify(文) + '\n');
      写了 = true;
    }
    out.push({ 包, 版本, 指纹, 原: 原 && { 版本: 原.版本, 指纹: 原.指纹 }, 一样, 写了, 文件 });
  }
  return out;
};
