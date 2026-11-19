import { bindShellProbe } from '@engine/model/衣物包络.ts';
import { GirlYaBoLunCreature } from './娘化亚波伦.tsx';

export const castingSkirtProbe = () => bindShellProbe(GirlYaBoLunCreature.getModel(), {
  referenceBone: 'DownBody', shellRoot: 'Skirt', innerRoot: 'Leg', rays: 48,
  heights: Array.from({ length: 45 }, (_, index) => 0.75 - index * 0.5), closedAbove: -12,
});
