import { useLayoutEffect, useRef } from 'react';

/** Publishes the height of the header (CSS variable --header-height) to place the card and the scroll. */
export function useHeaderHeight() {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty('--header-height', `${element.offsetHeight}px`));
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--header-height');
    };
  }, []);
  return ref;
}
