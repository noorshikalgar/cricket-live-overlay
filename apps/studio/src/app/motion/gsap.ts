import { isDevMode } from '@angular/core';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(Flip, SplitText);

// dev-only handle for debugging motion from the browser console (e.g. __gsap.ticker.useRAF(false)
// to keep animations running in a background tab); not present in production builds
if (isDevMode()) (globalThis as { __gsap?: typeof gsap }).__gsap = gsap;

export { gsap, Flip, SplitText };
