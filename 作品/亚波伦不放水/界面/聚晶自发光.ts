import type { Png } from '@engine/model/贴图.ts';

const chargeCache = new WeakMap<Png, Map<number, Png>>();

export const chargeIcon = (icon: Png, charge: number): Png => {
  const level = Math.round(Math.max(0, Math.min(1, charge)) * 24);
  if (!level) return icon;
  const variants = chargeCache.get(icon) ?? new Map<number, Png>();
  const cached = variants.get(level);
  if (cached) return cached;
  const pixels = icon.px.slice();
  const strength = level / 24;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (!pixels[offset + 3]) continue;
    const peak = Math.max(pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!);
    const lift = strength * (0.25 + 0.47 * peak / 255);
    for (let channel = 0; channel < 3; channel++) {
      const value = pixels[offset + channel]!;
      const hueWeight = 0.40 + 0.60 * (value + 32) / (peak + 32);
      pixels[offset + channel] = Math.round(value + (255 - value) * lift * hueWeight);
    }
  }
  const lit = { w: icon.w, h: icon.h, px: pixels };
  variants.set(level, lit);
  chargeCache.set(icon, variants);
  return lit;
};
