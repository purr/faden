import { cubicOut } from 'svelte/easing';

const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// duration for svelte transitions: zero when the system asks for reduced motion
export const t = (ms: number) => (reduce ? 0 : ms);

// the easing every svelte transition uses, close to the css --ease curve
export const ease = cubicOut;
