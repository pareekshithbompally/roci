import type React from 'react';

/** A menu or popover grows out of the control that opened it. Radix aims its grow point at the content's edge, which is off
 *  the control once the content has been slid along to fit the screen; so as its opening starts, the point is moved to the
 *  control's centre (its trigger names the content in `aria-controls`). Measured on the positioned wrapper, which is not
 *  scaled. */
export function popFromTrigger(event: React.AnimationEvent<HTMLElement>): void {
  const content = event.currentTarget;
  if (event.target !== content || !content.id) return;
  const trigger = document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(content.id)}"]`);
  const frame = content.parentElement?.getBoundingClientRect();
  if (!trigger || !frame) return;
  const at = trigger.getBoundingClientRect();
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);
  const x = clamp(at.left + at.width / 2 - frame.left, frame.width);
  const y = clamp(at.top + at.height / 2 - frame.top, frame.height);
  content.style.transformOrigin = `${x}px ${y}px`;
}
