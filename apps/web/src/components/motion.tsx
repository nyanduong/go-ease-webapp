import { useEffect, useRef, type ReactNode } from 'react';

// Animate presentation only: no delayed navigation, timers that block input or business state.
// Changing the OS preference cancels in-flight motion immediately.
export function MotionRegion({
  children,
  className = '',
  motionKey = '',
  stagger = false,
}: {
  children: ReactNode;
  className?: string;
  motionKey?: string;
  stagger?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current,
      preference = matchMedia('(prefers-reduced-motion: reduce)');
    if (!node || preference.matches || !node.animate) return;
    const elements = stagger ? Array.from(node.children) : [node];
    const animations = elements.map((element, index) =>
      element.animate(
        [
          { opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          duration: 240,
          delay: stagger ? Math.min(index, 5) * 35 : 0,
          easing: 'cubic-bezier(.2,.8,.2,1)',
          fill: 'backwards',
        },
      ),
    );
    const cancel = () => animations.forEach((animation) => animation.cancel());
    preference.addEventListener('change', cancel);
    return () => {
      cancel();
      preference.removeEventListener('change', cancel);
    };
  }, [motionKey, stagger]);
  return (
    <div ref={ref} className={className} data-motion-region>
      {children}
    </div>
  );
}
