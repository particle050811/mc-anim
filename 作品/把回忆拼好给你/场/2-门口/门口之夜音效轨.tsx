// 第 9–11 句的音效轨：段.ts 里有哪几个 门口之夜音效资产 的 cue，就放哪几条（音效轨 见到没有 cue 的资产会报错，所以按段挑）。
import type React from 'react';
import type { 段定义 } from '@engine/段/段定义.ts';
import { 音效轨 } from '../../声音/音效轨.tsx';
import { 门口之夜音效资产 } from './门口之夜声音.ts';
import 种树苗 from 'asset:音效/把回忆拼好给你/block.cherry_sapling.place.1';
import 插牌子 from 'asset:音效/block.wood.place.1';
import 发射 from 'asset:音效/把回忆拼好给你/entity.firework_rocket.launch';
import 炸 from 'asset:音效/把回忆拼好给你/entity.firework_rocket.blast';
import 大炸 from 'asset:音效/把回忆拼好给你/entity.firework_rocket.large_blast';
import 噼啪 from 'asset:音效/把回忆拼好给你/entity.firework_rocket.twinkle';
import 咔哒 from 'asset:音效/车万女仆/item.camera_use';

const 地址: Record<keyof typeof 门口之夜音效资产, string> = { 种树苗, 插牌子, 发射, 炸, 大炸, 噼啪, 咔哒 };

export const 门口之夜音效轨: React.FC<{ 段: 段定义 }> = ({ 段 }) => {
  const 有 = new Set((段.声音 ?? []).map((c) => ('资产' in c ? c.资产 : '')));
  return (
    <>
      {(Object.keys(门口之夜音效资产) as (keyof typeof 门口之夜音效资产)[])
        .filter((k) => 有.has(门口之夜音效资产[k]))
        .map((k) => (
          <音效轨 key={k} src={地址[k]} 资产={门口之夜音效资产[k]} 段={段} />
        ))}
    </>
  );
};
