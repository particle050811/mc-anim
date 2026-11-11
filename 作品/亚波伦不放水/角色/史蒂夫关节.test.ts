// 史蒂夫的关节：膝是 0 时根矩阵和库里原版那套一模一样；蹲腿角让脚底在髋正下方；髋跟着膝弯往下沉；盔甲块怎么跟关节。
import { describe, expect, it, vi } from 'vitest';
import { stevePose, steveRootMatrix } from '@库/角色/史蒂夫.tsx';
import { 关节, 关节根矩阵, 网格分节, 腿伸, 蹲腿角, 髋高 } from './史蒂夫关节.ts';

// 库里的史蒂夫一 import 就要模型和皮肤的字节；这里只算姿势，给个空模型和 1×1 的图
vi.mock('asset:模型/角色/巨人', () => ({ default: { models: { 宽: { texW: 64, texH: 64, parts: [] } } } }));
vi.mock('asset:贴图/角色/巨人/史蒂夫', () => ({ default: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==' }));

describe('史蒂夫关节', () => {
  it('膝是 0 时根矩阵同 steveRootMatrix（腿怎么摆、前倾、贴不贴地都一样）', () => {
    for (const 改 of [{}, { legR: 40, legL: -40, ground: 1 }, { legR: 40, legL: -40, ground: 0.5, pitch: -12 }, { legR: -70, legL: -70, ground: 1 }]) {
      const pose = { ...stevePose([3, 4, 5], 30), ...改 };
      const [甲, 乙] = [关节根矩阵(pose).elements, steveRootMatrix(pose).elements];
      甲.forEach((v, i) => expect(v).toBeCloseTo(乙[i]!, 9));
    }
  });

  it('蹲腿角：大腿抬到这个角，脚底中心在髋正下方；膝越弯髋越低', () => {
    let 前高 = 12;
    for (const 膝 of [30, 60, 90, 120]) {
      const 腿 = 蹲腿角(膝);
      expect(腿伸(腿, 膝).前).toBeCloseTo(0, 9);
      const 高 = 髋高({ ...stevePose([0, 0, 0], 0), legR: 腿, legL: 腿, kneeR: 膝, kneeL: 膝, ground: 1 });
      expect(高).toBeLessThan(前高);
      前高 = 高;
    }
  });

  it('盔甲块跟关节：跨过关节的正方盒折，斜的、只探过一点的整块跟上半节', () => {
    const 盒 = (低: number, 高: number, n: number[] = [0, 0, 1]) => [低, 高, 低, 高].flatMap((y, i) => [i < 2 ? -2 : 2, y, 3, 0, 0, ...n]);
    expect(网格分节(盒(-2.7, 11.3), 关节.膝.切)).toBe('弯');
    expect(网格分节(盒(-2, 5), 关节.肘.切)).toBe('上');
    expect(网格分节(盒(-5, 10, [0, 0.6, 0.8]), 关节.肘.切)).toBe('上');
    expect(网格分节(盒(7, 12.5), 关节.膝.切)).toBe('下');
  });
});
