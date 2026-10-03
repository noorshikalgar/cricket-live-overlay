import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(Flip, SplitText);

export { gsap, Flip, SplitText };
