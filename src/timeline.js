import { clamp } from './data.js';

export const seekEase = (value) => { const t = clamp(value); return t * t * t * (10 + t * (-15 + 6 * t)); };
export const seekDuration = (from, to) => clamp(1.5 + Math.abs(to - from) * .045, 1.5, 5.4);
