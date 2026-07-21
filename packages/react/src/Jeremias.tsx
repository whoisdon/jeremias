'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import {
  createJeremias,
  DEFAULT_RENDER,
  type JeremiasConfig,
  type JeremiasInstance,
} from '@jeremias/core';

export type JeremiasProps = JeremiasConfig & {
  className?: string;
  enabled?: boolean;
};

export const Jeremias = forwardRef<JeremiasInstance, JeremiasProps>(function Jeremias(
  {
    enabled = true,
    className,
    mount: mountProp,
    onDismiss,
    character,
    cards,
    notes,
    behavior,
    tasks,
    speed,
    render,
    aggression,
    targets,
    dismissible,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<JeremiasInstance | null>(null);
  const configKey = useMemo(
    () =>
      JSON.stringify({
        characterId: character.id,
        cards,
        notes,
        behavior,
        tasks,
        speed,
        render,
        aggression,
        targets,
        dismissible,
      }),
    [character.id, cards, notes, behavior, tasks, speed, render, aggression, targets, dismissible],
  );

  useImperativeHandle(
    ref,
    () => ({
      destroy: () => instanceRef.current?.destroy(),
      setAggression: (value: number) => instanceRef.current?.setAggression(value),
      grabElement: (target: string | HTMLElement) => instanceRef.current?.grabElement(target),
    }),
    [],
  );

  useEffect(() => {
    if (!enabled) return;

    const mount = mountProp ?? hostRef.current ?? document.body;
    const instance = createJeremias({
      character,
      cards,
      notes,
      behavior,
      tasks,
      speed,
      render,
      aggression,
      targets,
      dismissible,
      mount,
      onDismiss,
    });
    instanceRef.current = instance;

    return () => {
      instance.destroy();
      instanceRef.current = null;
    };
  }, [
    enabled,
    mountProp,
    onDismiss,
    configKey,
    character,
    cards,
    notes,
    behavior,
    tasks,
    speed,
    render,
    aggression,
    targets,
    dismissible,
  ]);

  if (mountProp) return null;

  return (
    <div
      ref={hostRef}
      className={className}
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: render?.layerZIndex ?? DEFAULT_RENDER.layerZIndex,
      }}
    />
  );
});

export { createJeremias };
