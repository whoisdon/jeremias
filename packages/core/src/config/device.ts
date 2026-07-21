import type { DeviceVisibility } from '../types';

export function isDeviceVisible(
  device: DeviceVisibility,
  mobileBreakpoint: number,
): boolean {
  if (typeof window === 'undefined') return false;
  if (device === 'both') return true;

  const isMobile =
    window.matchMedia(`(max-width: ${mobileBreakpoint}px)`).matches ||
    ('ontouchstart' in window && window.innerWidth <= mobileBreakpoint);

  return device === 'mobile' ? isMobile : !isMobile;
}
