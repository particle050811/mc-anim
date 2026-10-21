// 7-1-1 黑暗的声音：整场一张事件表（../7-1/声音.tsx），取落在本段的那一截，听者是本段镜头。台词配音按 ../7-1/时间线.ts 的 台词 开口时刻挂在 段声音 里。
import React from 'react';
import { SegmentSound } from '../../../world/地点/古城4x/7-1/声音.tsx';
import * as choreo from './编排.ts';

export const Sound: React.FC = () => <SegmentSound segId={choreo.号} camera={choreo.camera} />;
