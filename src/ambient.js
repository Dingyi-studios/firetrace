import { animationRate, replayRate } from './operations.js';

export const windLineCount = 240;
export const windPlaybackMultiplier = 16;
const clockRate = replayRate / animationRate * windPlaybackMultiplier;

// The shader's 0.37 phase coefficient makes this wrap exactly seamless.
export const windClockAt = (wallMilliseconds) => (wallMilliseconds / 1000 * clockRate) % 1000;
export const windAnimating = (state) => state.layers.wind.on && state.layers.wind.opacity > 0 && state.feed !== 'full';
