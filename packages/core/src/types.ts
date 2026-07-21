export interface AnimationDef {
  row: number;
  frames: number;
  fps: number;
}

export interface CharacterPack {
  id: string;
  displayName: string;
  spritesheet: string;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, AnimationDef>;
}

export type DeviceVisibility = 'desktop' | 'mobile' | 'both';

export type PanelStyle =
  | 'reddit'
  | 'notepad'
  | 'facebook'
  | 'orkut'
  | 'discord'
  | 'twitter'
  | 'whatsapp'
  | 'msn'
  | 'instagram'
  | 'tumblr'
  | 'telegram';

/** Card flutuante com texto e imagem opcional. */
export interface JeremiasCard {
  style: PanelStyle;
  title: string;
  body: string;
  /** URL da imagem exibida dentro do card. */
  image?: string;
  imageAlt?: string;
  author?: string;
  timeAgo?: string;
  subreddit?: string;
  flair?: string;
  upvotes?: number;
  comments?: number;
  likes?: number;
  channel?: string;
  scrap?: string;
  /** Handle @usuario (twitter, instagram, etc.). */
  handle?: string;
}

/** @deprecated Use JeremiasCard */
export type PanelNote = JeremiasCard;

export interface JeremiasSpeedConfig {
  walk?: number;
  run?: number;
  charge?: number;
  fly?: number;
}

export interface JeremiasBehaviorConfig {
  /** Nível de caos (0–1). */
  aggression?: number;
  /** Seletores CSS dos elementos que o pato pode arrastar. */
  targets?: string[];
  /** Permite arrastar itens para fora da viewport. */
  allowOffscreenDrag?: boolean;
  /** Chance (0–1) de destino fora da tela quando allowOffscreenDrag está ativo. */
  offscreenDragChance?: number;
  /** Permite roubar/esconder o cursor do usuário. */
  stealCursor?: boolean;
  /** Em quais dispositivos o pato aparece. */
  device?: DeviceVisibility;
  /** Largura máxima (px) considerada mobile. */
  mobileBreakpoint?: number;
}

export interface JeremiasTasksConfig {
  wander?: boolean;
  chaseCursor?: boolean;
  /** Perseguir e arrastar o cursor (requer stealCursor). */
  dragCursor?: boolean;
  grabTarget?: boolean;
  /** Mostrar cards flutuantes. */
  showCards?: boolean;
  /** @deprecated Use showCards */
  bringNote?: boolean;
}

/** @deprecated Use JeremiasTasksConfig */
export type TaskFlags = JeremiasTasksConfig;

export interface JeremiasRenderConfig {
  /** Escala de desenho do sprite. */
  scale?: number;
  /** z-index da camada JEREMIAS (host + sprite) — acima da página e dos cards. */
  layerZIndex?: number;
  /** z-index dos cards dentro da camada JEREMIAS — abaixo do pato por padrão. */
  panelZIndex?: number;
}

export interface JeremiasConfig {
  character: CharacterPack;
  /** Cards personalizados (texto + imagem opcional). */
  cards?: (string | JeremiasCard)[];
  /** @deprecated Use cards */
  notes?: (string | JeremiasCard)[];
  behavior?: JeremiasBehaviorConfig;
  tasks?: JeremiasTasksConfig;
  speed?: JeremiasSpeedConfig;
  render?: JeremiasRenderConfig;
  mount?: HTMLElement;
  dismissible?: boolean;
  onDismiss?: () => void;

  /** @deprecated Use behavior.aggression */
  aggression?: number;
  /** @deprecated Use behavior.targets */
  targets?: string[];
}

export type JeremiasTaskId =
  | 'wander'
  | 'chaseCursor'
  | 'dragCursor'
  | 'grabTarget'
  | 'bringNote';

export interface Vec2 {
  x: number;
  y: number;
}

export interface JeremiasInstance {
  destroy: () => void;
  setAggression: (value: number) => void;
  /** Corre até o elemento e o arrasta pela página. Aceita seletor CSS ou HTMLElement. */
  grabElement: (target: string | HTMLElement) => void;
}
