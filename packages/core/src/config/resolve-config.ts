import { resolveCards } from '../cards/resolve-cards';
import type {
  JeremiasBehaviorConfig,
  JeremiasCard,
  JeremiasConfig,
  JeremiasRenderConfig,
  JeremiasSpeedConfig,
  JeremiasTasksConfig,
} from '../types';
import { clamp } from '../utils';
import { DEFAULT_BEHAVIOR, DEFAULT_RENDER, DEFAULT_SPEED, DEFAULT_TASKS } from './defaults';

export interface ResolvedJeremiasConfig {
  character: JeremiasConfig['character'];
  cards: JeremiasCard[];
  behavior: Required<JeremiasBehaviorConfig>;
  tasks: Required<JeremiasTasksConfig>;
  speed: Required<JeremiasSpeedConfig>;
  render: Required<JeremiasRenderConfig>;
  mount: HTMLElement;
  dismissible: boolean;
  onDismiss?: () => void;
}

export function resolveJeremiasConfig(config: JeremiasConfig): ResolvedJeremiasConfig {
  const targets = config.behavior?.targets ?? config.targets ?? [];
  const cardsInput = config.cards ?? config.notes;
  const stealCursor = config.behavior?.stealCursor ?? DEFAULT_BEHAVIOR.stealCursor;
  const showCards =
    config.tasks?.showCards ??
    config.tasks?.bringNote ??
    DEFAULT_TASKS.showCards;

  const tasks: Required<JeremiasTasksConfig> = {
    ...DEFAULT_TASKS,
    ...config.tasks,
    showCards,
    bringNote: showCards,
    grabTarget: config.tasks?.grabTarget ?? targets.length > 0,
    dragCursor:
      config.tasks?.dragCursor !== undefined
        ? config.tasks.dragCursor && stealCursor
        : stealCursor,
  };

  return {
    character: config.character,
    cards: resolveCards(cardsInput),
    behavior: {
      ...DEFAULT_BEHAVIOR,
      ...config.behavior,
      targets,
      aggression: clamp(
        config.behavior?.aggression ?? config.aggression ?? DEFAULT_BEHAVIOR.aggression,
        0,
        1,
      ),
      stealCursor,
    },
    tasks,
    speed: { ...DEFAULT_SPEED, ...config.speed },
    render: { ...DEFAULT_RENDER, ...config.render },
    mount: config.mount ?? document.body,
    dismissible: config.dismissible ?? true,
    onDismiss: config.onDismiss,
  };
}
