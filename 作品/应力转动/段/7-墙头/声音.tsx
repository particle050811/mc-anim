// 7-3-1 墙头的声音：整场一张事件表（../7-3/声音.tsx），取落在本段的那一截，听者是本段镜头。
import React from 'react';
import { SegmentSound } from '../../场/7-墙头追逐/7-3/声音.tsx';
import * as choreo from '../../场/7-墙头追逐/7-3-1/编排.ts';

export const Sound: React.FC = () => <SegmentSound segId={choreo.号} camera={choreo.camera} shotOf={choreo.镜号} />;
