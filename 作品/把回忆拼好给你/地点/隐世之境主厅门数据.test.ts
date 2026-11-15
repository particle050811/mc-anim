import { describe, expect, it } from 'vitest';
import { mainHallDoors, openDoorOpening } from './隐世之境主厅门数据.ts';

// 光从正西水平照进西门（往 +x 走）
const dirEast = [1, 0, 0];

describe('开着的门洞', () => {
  const westDoor = mainHallDoors.westDoor;
  it('开到底就是门洞本身，关着全挡住', () => {
    expect(openDoorOpening(westDoor, 1, dirEast)).toBe(westDoor.opening);
    expect(openDoorOpening(westDoor, 0, dirEast)).toBeNull();
  });
  it('开一半：门扇外沿转到 45°，挡住门轴（北）那一截', () => {
    const opening = openDoorOpening(westDoor, 0.5, dirEast)!;
    // 门扇外沿两个角绕轴 (6.09375, −10.09375) 转 45°，最南的那个（外侧那面的角）落在 y ≈ −10.80
    expect(opening.a[1]).toBeCloseTo(-10.801, 3);
    expect(opening.b).toEqual(westDoor.opening.b);
    expect(opening.a[0]).toBe(7);
  });
  it('开得越大门缝越宽', () => {
    const doorWidth = (openAmount: number) => {
      const opening = openDoorOpening(westDoor, openAmount, dirEast);
      return opening ? opening.a[1] - opening.b[1] : 0;
    };
    expect(doorWidth(0.3)).toBeLessThan(doorWidth(0.6));
    expect(doorWidth(0.6)).toBeLessThan(doorWidth(1));
  });
  it('北门两扇往两边开，门缝在中间', () => {
    const northDoor = mainHallDoors.northDoor;
    const dirSouth = [0, -1, 0];
    const opening = openDoorOpening(northDoor, 0.5, dirSouth)!;
    expect(opening.a[0]).toBeGreaterThan(northDoor.opening.a[0]);
    expect(opening.b[0]).toBeLessThan(northDoor.opening.b[0]);
    expect(opening.a[0]).toBeLessThan(opening.b[0]);
  });
});
