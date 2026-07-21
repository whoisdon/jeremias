import type {
  JeremiasBehaviorConfig,
  JeremiasRenderConfig,
  JeremiasSpeedConfig,
  JeremiasTasksConfig,
} from '../types';

export const DEFAULT_SPEED: Required<JeremiasSpeedConfig> = {
  walk: 95,
  run: 210,
  charge: 360,
  fly: 520,
};

export const DEFAULT_RENDER: Required<JeremiasRenderConfig> = {
  scale: 1.38,
  /** Camada JEREMIAS inteira acima da página. */
  layerZIndex: 2147483647,
  /** Cards dentro da camada — sempre abaixo do sprite do pato. */
  panelZIndex: 1,
};

export const DEFAULT_BEHAVIOR: Required<Omit<JeremiasBehaviorConfig, never>> = {
  aggression: 0.65,
  targets: [],
  allowOffscreenDrag: true,
  offscreenDragChance: 0.55,
  stealCursor: true,
  device: 'both',
  mobileBreakpoint: 768,
};

export const DEFAULT_TASKS: Required<JeremiasTasksConfig> = {
  wander: true,
  chaseCursor: true,
  dragCursor: true,
  grabTarget: false,
  showCards: true,
  bringNote: true,
};
