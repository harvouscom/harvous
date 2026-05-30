import { useEffect, useState } from 'react';

/** Desktop-like input: fine pointer + hover (keyboard shortcuts are meaningful). */
const HARDWARE_KEYBOARD_MQ = '(hover: hover) and (pointer: fine)';

function readHardwareKeyboard(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia(HARDWARE_KEYBOARD_MQ).matches;
}

/** True when the primary input is mouse/trackpad + keyboard (not touch-first mobile). */
export function useHardwareKeyboard(): boolean {
  const [hasHardwareKeyboard, setHasHardwareKeyboard] = useState(readHardwareKeyboard);

  useEffect(() => {
    const mq = window.matchMedia(HARDWARE_KEYBOARD_MQ);
    const onChange = () => setHasHardwareKeyboard(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return hasHardwareKeyboard;
}
