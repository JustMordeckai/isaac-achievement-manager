import { useEffect, useRef } from 'react';

/** When the card closes, the focus goes back to the achievement that opened it. */
export function useReturnFocus(selectedId: number | null): void {
  const previous = useRef(selectedId);
  useEffect(() => {
    const last = previous.current;
    previous.current = selectedId;
    if (last !== null && selectedId === null) document.getElementById(`ach-${last}`)?.focus();
  }, [selectedId]);
}
