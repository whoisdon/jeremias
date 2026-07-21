import type { JeremiasCard, PanelStyle } from './types';
import { typeIntoField } from './cards/typewriter';
import { clamp, pickRandom, randomRange } from './utils';

export interface FloatingPanelOptions {
  title?: string;
  width?: number;
  height?: number;
  onClose?: () => void;
}

export interface OverlayPanelHandlers {
  onPanelClose?: (panel: HTMLDivElement) => void;
  onUserPanelDragStart?: (panel: HTMLDivElement) => void;
}

const PANEL_SIZE: Record<PanelStyle, { width: number; height: number }> = {
  reddit: { width: 380, height: 300 },
  notepad: { width: 300, height: 220 },
  facebook: { width: 360, height: 290 },
  orkut: { width: 340, height: 310 },
  discord: { width: 400, height: 270 },
  twitter: { width: 360, height: 280 },
  whatsapp: { width: 340, height: 300 },
  msn: { width: 320, height: 260 },
  instagram: { width: 340, height: 360 },
  tumblr: { width: 360, height: 320 },
  telegram: { width: 360, height: 270 },
};

const PANEL_ICONS: Record<PanelStyle, string> = {
  reddit: '🔶',
  notepad: '📝',
  facebook: 'f',
  orkut: '💕',
  discord: '💬',
  twitter: '𝕏',
  whatsapp: '📱',
  msn: '🦋',
  instagram: '📷',
  tumblr: 't',
  telegram: '✈',
};

const PANEL_VIEWPORT_PAD = 12;
/** Espaço reservado para o botão "Dismiss JEREMIAS" no canto inferior. */
const PANEL_BOTTOM_RESERVE = 52;

export class OverlayLayer {
  readonly root: HTMLDivElement;
  private panels = new Set<HTMLElement>();
  private notepadCount = 0;
  private topPanelZ = 0;
  private readonly panelZIndex: number;
  private readonly handlers: OverlayPanelHandlers;

  constructor(parent: HTMLElement, panelZIndex: number, handlers: OverlayPanelHandlers = {}) {
    this.panelZIndex = panelZIndex;
    this.handlers = handlers;
    this.root = document.createElement('div');
    this.root.className = 'jeremias-overlay-layer';
    this.root.style.cssText = [
      'position:fixed',
      'inset:0',
      'pointer-events:none',
      `z-index:${panelZIndex}`,
    ].join(';');
    parent.appendChild(this.root);
  }

  createPanel(note: JeremiasCard, options: FloatingPanelOptions): HTMLDivElement {
    const size = PANEL_SIZE[note.style];
    const title = options.title ?? this.panelTitle(note);
    const panel = this.createWindowShell(note.style, {
      ...options,
      title,
      width: options.width ?? size.width,
      height: options.height ?? size.height,
    });

    const client = panel.querySelector('.jeremias-panel-client');
    if (!client) return panel;

    switch (note.style) {
      case 'reddit':
        client.appendChild(this.buildRedditPost(note));
        break;
      case 'notepad':
        client.appendChild(this.buildNotepadBody(note));
        break;
      case 'facebook':
        client.appendChild(this.buildFacebookPost(note));
        break;
      case 'orkut':
        client.appendChild(this.buildOrkutScrap(note));
        break;
      case 'discord':
        client.appendChild(this.buildDiscordMessage(note));
        break;
      case 'twitter':
        client.appendChild(this.buildTwitterPost(note));
        break;
      case 'whatsapp':
        client.appendChild(this.buildWhatsAppChat(note));
        break;
      case 'msn':
        client.appendChild(this.buildMsnMessage(note));
        break;
      case 'instagram':
        client.appendChild(this.buildInstagramPost(note));
        break;
      case 'tumblr':
        client.appendChild(this.buildTumblrPost(note));
        break;
      case 'telegram':
        client.appendChild(this.buildTelegramMessage(note));
        break;
    }

    return panel;
  }

  /** Notepad vazio durante o arrasto — Jeremias digita depois de soltar. */
  typeNotepadContent(panel: HTMLDivElement, note: JeremiasCard): void {
    const textarea = panel.querySelector<HTMLTextAreaElement>('textarea[data-jeremias-full]');
    if (!textarea || textarea.dataset.jeremiasTyping === '1') return;
    textarea.dataset.jeremiasTyping = '1';
    const text = textarea.dataset.jeremiasFull ?? `${note.title}\n\n${note.body}`;
    void typeIntoField(textarea, text, 22);
  }

  panelTitle(note: JeremiasCard): string {
    switch (note.style) {
      case 'reddit':
        return `${note.subreddit ?? 'r/quack'} — reddit`;
      case 'notepad':
        this.notepadCount += 1;
        return this.notepadCount === 1 ? 'Untitled - Notepad' : `Untitled (${this.notepadCount}) - Notepad`;
      case 'facebook':
        return 'Facebook — JEREMIAS';
      case 'orkut':
        return 'Orkut — scrap do JEREMIAS';
      case 'discord':
        return `Discord — #${note.channel ?? 'quack'}`;
      case 'twitter':
        return 'X — timeline';
      case 'whatsapp':
        return `WhatsApp — ${note.author ?? 'JEREMIAS'}`;
      case 'msn':
        return 'Windows Live Messenger';
      case 'instagram':
        return 'Instagram';
      case 'tumblr':
        return 'Tumblr';
      case 'telegram':
        return `Telegram — ${note.channel ?? 'quack'}`;
      default:
        return note.title;
    }
  }

  movePanel(panel: HTMLElement, x: number, y: number): void {
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
  }

  /** Coloca o painel acima dos demais cards (ordem DOM + z-index, sempre abaixo do pato). */
  bringPanelToFront(panel: HTMLElement): void {
    this.topPanelZ += 1;
    panel.style.zIndex = String(this.panelZIndex + this.topPanelZ);
    this.root.appendChild(panel);
  }

  /** Garante que o painel fique inteiro na viewport (top-left). */
  clampPanelInViewport(panel: HTMLElement, padding = PANEL_VIEWPORT_PAD): void {
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    let x = parseFloat(panel.style.left);
    let y = parseFloat(panel.style.top);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const rect = panel.getBoundingClientRect();
      x = rect.left;
      y = rect.top;
    }

    const maxX = Math.max(padding, window.innerWidth - w - padding);
    const maxY = Math.max(padding, window.innerHeight - h - padding - PANEL_BOTTOM_RESERVE);
    this.movePanel(
      panel,
      clamp(x, padding, maxX),
      clamp(y, padding, maxY),
    );
  }

  /** Posição de entrada visível na borda oposta à direção offscreen (sem centralizar). */
  entryPanelPosition(
    panel: HTMLElement,
    dir: 'left' | 'right' | 'top',
    currentY?: number,
  ): { x: number; y: number } {
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const pad = PANEL_VIEWPORT_PAD;
    const maxX = Math.max(pad, window.innerWidth - w - pad);
    const maxY = Math.max(pad, window.innerHeight - h - pad - PANEL_BOTTOM_RESERVE);
    const y = clamp(
      currentY ?? randomRange(pad, maxY),
      pad,
      maxY,
    );

    if (dir === 'left') {
      return { x: pad, y };
    }
    if (dir === 'right') {
      return { x: maxX, y };
    }
    return {
      x: clamp(Math.round((window.innerWidth - w) * 0.5), pad, maxX),
      y: pad,
    };
  }

  getPanelSize(style: PanelStyle): { width: number; height: number } {
    return PANEL_SIZE[style];
  }

  removePanel(panel: HTMLElement): void {
    panel.remove();
    this.panels.delete(panel);
  }

  destroy(): void {
    this.root.remove();
  }

  private createWindowShell(
    style: PanelStyle,
    options: FloatingPanelOptions & { title: string },
  ): HTMLDivElement {
    const themes: Record<PanelStyle, { bg: string; header: string; headerText: string; border: string }> = {
      reddit: { bg: '#DAE0E6', header: '#FF4500', headerText: '#fff', border: '#ccc' },
      notepad: { bg: '#ece9d8', header: 'linear-gradient(180deg,#0997ff 0%,#0053ee 50%,#0062ff 100%)', headerText: '#fff', border: '#0054e3' },
      facebook: { bg: '#e9ebee', header: '#3B5998', headerText: '#fff', border: '#29487d' },
      orkut: { bg: '#fff7ef', header: 'linear-gradient(180deg,#ff8abb 0%,#ed2590 100%)', headerText: '#fff', border: '#d4147a' },
      discord: { bg: '#36393f', header: '#202225', headerText: '#fff', border: '#202225' },
      twitter: { bg: '#15202b', header: '#15202b', headerText: '#e7e9ea', border: '#38444d' },
      whatsapp: { bg: '#ece5dd', header: '#075e54', headerText: '#fff', border: '#128c7e' },
      msn: { bg: '#fff', header: 'linear-gradient(180deg,#7ecbff 0%,#0095ff 100%)', headerText: '#fff', border: '#0095ff' },
      instagram: { bg: '#fafafa', header: 'linear-gradient(90deg,#f58529,#dd2a7b,#8134af)', headerText: '#fff', border: '#dbdbdb' },
      tumblr: { bg: '#35465c', header: '#001935', headerText: '#fff', border: '#001935' },
      telegram: { bg: '#fff', header: '#2481cc', headerText: '#fff', border: '#2481cc' },
    };

    const theme = themes[style];
    const darkHeader = style === 'discord' || style === 'twitter' || style === 'tumblr';
    this.topPanelZ += 1;
    const panel = document.createElement('div');
    panel.className = `jeremias-panel jeremias-panel-${style}`;
    panel.style.cssText = [
      'position:fixed',
      'pointer-events:auto',
      `z-index:${this.panelZIndex + this.topPanelZ}`,
      'left:-10000px',
      'top:0',
      'visibility:hidden',
      `width:${options.width}px`,
      `height:${options.height}px`,
      `background:${theme.bg}`,
      `border:1px solid ${theme.border}`,
      style === 'notepad' ? 'border-radius:0' : 'border-radius:4px',
      'box-shadow:0 4px 16px rgba(0,0,0,.28)',
      'display:flex',
      'flex-direction:column',
      'overflow:hidden',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Tahoma,Roboto,Arial,sans-serif',
    ].join(';');

    const header = document.createElement('div');
    header.className = 'jeremias-panel-header';
    header.style.cssText = [
      'display:flex',
      'align-items:center',
      'height:30px',
      'padding:0 8px',
      `background:${theme.header}`,
      `color:${theme.headerText}`,
      'flex-shrink:0',
      'gap:8px',
      'user-select:none',
      'cursor:move',
      'touch-action:none',
    ].join(';');

    const icon = document.createElement('span');
    icon.textContent = PANEL_ICONS[style];
    icon.style.cssText = 'font-size:13px;line-height:1';

    const title = document.createElement('span');
    title.textContent = options.title;
    title.style.cssText = 'flex:1;font:600 11px/1.2 sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';

    const close = this.makeCloseButton(panel, darkHeader, options.onClose, () => this.removePanel(panel));
    header.appendChild(icon);
    header.appendChild(title);
    header.appendChild(close);

    if (style === 'notepad') {
      const menu = document.createElement('div');
      menu.className = 'jeremias-notepad-menu';
      menu.style.cssText = [
        'display:flex',
        'gap:14px',
        'height:22px',
        'padding:0 8px',
        'background:#ece9d8',
        'border-bottom:1px solid #aca899',
        'font:11px/22px Tahoma,sans-serif',
        'color:#000',
        'flex-shrink:0',
      ].join(';');
      for (const item of ['File', 'Edit', 'Format', 'View', 'Help']) {
        const el = document.createElement('span');
        el.innerHTML = `<u>${item[0]}</u>${item.slice(1)}`;
        menu.appendChild(el);
      }
      panel.appendChild(header);
      panel.appendChild(menu);
    } else {
      panel.appendChild(header);
    }

    const client = document.createElement('div');
    client.className = 'jeremias-panel-client';
    client.style.cssText = [
      'flex:1',
      'min-height:0',
      'overflow:auto',
      'overflow-x:hidden',
      'overscroll-behavior:contain',
      'pointer-events:auto',
      'touch-action:pan-y',
      '-webkit-overflow-scrolling:touch',
      style === 'notepad' ? 'margin:2px;background:#fff;border:1px solid #808080' : 'padding:8px',
    ].join(';');

    panel.appendChild(client);
    this.root.appendChild(panel);
    this.panels.add(panel);
    this.bringPanelToFront(panel);
    const menu = panel.querySelector<HTMLElement>('.jeremias-notepad-menu');
    this.makePanelDraggable(panel, header, menu);
    return panel;
  }

  /** Arrastar pelo header, menu do Notepad ou corpo (exceto controles interativos). */
  private makePanelDraggable(
    panel: HTMLDivElement,
    header: HTMLElement,
    menu: HTMLElement | null,
  ): void {
    let dragging = false;
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const syncPanelPositionForDrag = (): void => {
      const rect = panel.getBoundingClientRect();
      panel.style.transform = 'none';
      panel.style.transformOrigin = '';
      panel.style.willChange = '';
      panel.style.pointerEvents = 'auto';
      this.movePanel(panel, rect.left, rect.top);
      startLeft = rect.left;
      startTop = rect.top;
    };

    const endDrag = (): void => {
      if (!dragging) return;
      dragging = false;
      panel.style.transition = '';
      panel.style.touchAction = '';
      panel.dataset.jeremiasCarried = 'false';
      if (pointerId >= 0) {
        try {
          panel.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }
      }
      pointerId = -1;
      this.clampPanelInViewport(panel);
    };

    const isInteractiveTarget = (target: Element): boolean =>
      !!target.closest('button, textarea, a, input, select, [contenteditable="true"]');

    const canDragFromTarget = (target: Element): boolean => {
      if (isInteractiveTarget(target)) return false;
      if (target.closest('.jeremias-panel-header, .jeremias-notepad-menu')) return true;
      return target.closest('.jeremias-panel-client') !== null;
    };

    const beginDrag = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      if (!canDragFromTarget(event.target as Element)) return;

      event.preventDefault();
      event.stopPropagation();
      this.bringPanelToFront(panel);
      this.handlers.onUserPanelDragStart?.(panel);
      syncPanelPositionForDrag();

      dragging = true;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      panel.style.transition = 'none';
      panel.style.touchAction = 'none';
      panel.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (!dragging || event.pointerId !== pointerId) return;
      event.preventDefault();
      this.movePanel(
        panel,
        startLeft + (event.clientX - startX),
        startTop + (event.clientY - startY),
      );
    };

    header.addEventListener('pointerdown', beginDrag);
    menu?.addEventListener('pointerdown', beginDrag);
    panel.addEventListener('pointerdown', beginDrag);
    panel.addEventListener('pointermove', onPointerMove);
    panel.addEventListener('pointerup', endDrag);
    panel.addEventListener('pointercancel', endDrag);
    header.style.touchAction = 'none';
    header.style.cursor = 'move';
    if (menu) {
      menu.style.touchAction = 'none';
      menu.style.cursor = 'move';
    }
  }

  private makeCloseButton(
    panel: HTMLDivElement,
    darkHeader: boolean,
    onClose: (() => void) | undefined,
    remove: () => void,
  ): HTMLButtonElement {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'jeremias-panel-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Fechar');
    const idleBg = darkHeader ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.12)';
    const idleColor = darkHeader ? '#fff' : '#fff';
    close.style.cssText = [
      'position:relative',
      'z-index:3',
      'flex-shrink:0',
      'width:22px',
      'height:22px',
      'border:1px solid rgba(255,255,255,.22)',
      'border-radius:3px',
      `background:${idleBg}`,
      `color:${idleColor}`,
      'font:16px/20px sans-serif',
      'cursor:pointer',
      'padding:0',
      'pointer-events:auto',
      'touch-action:manipulation',
    ].join(';');
    close.addEventListener('mouseenter', () => {
      close.style.background = 'rgba(232,17,35,.92)';
      close.style.borderColor = 'rgba(232,17,35,.92)';
    });
    close.addEventListener('mouseleave', () => {
      close.style.background = idleBg;
      close.style.borderColor = 'rgba(255,255,255,.22)';
    });

    const handleClose = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      this.handlers.onPanelClose?.(panel);
      onClose?.();
      remove();
    };

    close.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    close.addEventListener('click', handleClose);

    return close;
  }

  private makeStaticField<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text: string,
    style?: string,
  ): HTMLElement {
    const el = document.createElement(tag);
    if (style) el.style.cssText = style;
    el.textContent = text;
    return el;
  }

  private buildNotepadBody(note: JeremiasCard): HTMLTextAreaElement {
    const body = document.createElement('textarea');
    body.readOnly = true;
    body.value = '';
    body.dataset.jeremiasFull = `${note.title}\n\n${note.body}`;
    body.spellcheck = false;
    body.style.cssText = [
      'display:block',
      'width:100%',
      'height:100%',
      'border:0',
      'resize:none',
      'outline:none',
      'background:#fff',
      'color:#000',
      'font:12px/1.35 "Lucida Console",Consolas,monospace',
      'padding:2px 4px',
      'box-sizing:border-box',
    ].join(';');
    return body;
  }

  private buildRedditPost(note: JeremiasCard): HTMLElement {
    const author = note.author ?? 'JEREMIAS_Oficial';
    const upvotes = note.upvotes ?? randomRange(42, 9842);
    const comments = note.comments ?? randomRange(3, 420);
    const timeAgo = note.timeAgo ?? pickRandom(['2h', '5h', '1d', 'just now']);

    const card = document.createElement('article');
    card.style.cssText = 'background:#fff;border:1px solid #ccc;border-radius:4px;display:flex;overflow:hidden';

    const voteCol = document.createElement('div');
    voteCol.style.cssText = 'width:40px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;padding:8px 4px;background:#DAE0E6';
    voteCol.innerHTML = `<span style="color:#FF4500">▲</span><span style="font:700 12px/1;margin:4px 0">${formatScore(upvotes)}</span><span style="color:#787C7E">▼</span>`;

    const content = document.createElement('div');
    content.style.cssText = 'flex:1;padding:8px 10px;min-width:0';
    const meta = document.createElement('div');
    meta.style.cssText = 'font:12px/1.4;color:#787C7E;margin-bottom:4px';
    meta.innerHTML = `<b style="color:#1A1A1B">${escapeHtml(note.subreddit ?? 'r/quack')}</b>${note.flair ? ` <span style="background:#0079D3;color:#fff;font-size:10px;padding:0 6px;border-radius:12px">${escapeHtml(note.flair)}</span>` : ''} • u/${escapeHtml(author)} • ${timeAgo}`;

    const titleEl = this.makeStaticField('h3', note.title, 'margin:0 0 8px;font:500 16px/1.3;color:#1A1A1B');
    const bodyEl = this.makeStaticField('div', note.body, 'font:14px/1.45;color:#1A1A1B;white-space:pre-wrap;margin-bottom:8px');
    const footer = document.createElement('div');
    footer.style.cssText = 'font:700 11px;color:#787C7E;border-top:1px solid #EDEFF1;padding-top:6px';
    footer.textContent = `💬 ${comments} Comments · ↗ Share · 🔖 Save`;

    content.appendChild(meta);
    content.appendChild(titleEl);
    content.appendChild(bodyEl);
    this.appendCardImageDeferred(content, note);
    content.appendChild(footer);

    card.appendChild(voteCol);
    card.appendChild(content);
    return card;
  }

  private buildFacebookPost(note: JeremiasCard): HTMLElement {
    const author = note.author ?? 'JEREMIAS Oficial';
    const likes = note.likes ?? note.upvotes ?? randomRange(12, 999);
    const comments = note.comments ?? randomRange(2, 88);
    const timeAgo = note.timeAgo ?? pickRandom(['agora mesmo', '5 min', '1 h', 'Ontem']);

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border:1px solid #dddfe2;border-radius:3px;overflow:hidden';

    card.innerHTML = [
      `<div style="padding:10px 12px 0;display:flex;gap:8px;align-items:center">`,
      `<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#ffa500,#fff);border:1px solid #ddd;display:flex;align-items:center;justify-content:center;font-size:18px">🦆</div>`,
      `<div><div style="font:700 13px/1.2;color:#385898">${escapeHtml(author)}</div>`,
      `<div style="font:11px/1.2;color:#90949c">${timeAgo} · 🌍</div></div></div>`,
    ].join('');

    const bodyEl = this.makeStaticField('div', note.body, 'padding:10px 12px;font:14px/1.45;color:#1d2129;white-space:pre-wrap');
    card.appendChild(bodyEl);

    const stats = document.createElement('div');
    stats.style.cssText = 'padding:0 12px 8px;font:12px/1.2;color:#90949c';
    stats.textContent = `👍 ${likes} · ${comments} comentários`;
    card.appendChild(stats);

    const actions = document.createElement('div');
    actions.style.cssText = 'border-top:1px solid #e5e5e5;display:flex;font:700 12px/36px sans-serif;color:#616770';
    actions.innerHTML = `<span style="flex:1;text-align:center;border-right:1px solid #e5e5e5">Curtir</span><span style="flex:1;text-align:center;border-right:1px solid #e5e5e5">Comentar</span><span style="flex:1;text-align:center">Compartilhar</span>`;
    card.appendChild(actions);

    this.appendCardImageDeferred(card, note);

    return card;
  }

  private buildOrkutScrap(note: JeremiasCard): HTMLElement {
    const author = note.author ?? 'JEREMIAS 🦆';
    const timeAgo = note.timeAgo ?? pickRandom(['agora', 'hoje', 'ontem']);
    const scrap = note.scrap ?? note.title;

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border:2px solid #ffb7d8;border-radius:8px;overflow:hidden';

    card.innerHTML = [
      `<div style="padding:10px;background:linear-gradient(180deg,#fff0f7,#fff);border-bottom:1px solid #ffd3ea;display:flex;gap:10px;align-items:center">`,
      `<div style="width:52px;height:52px;border-radius:6px;background:#fff;border:2px solid #ed2590;display:flex;align-items:center;justify-content:center;font-size:24px">🦆</div>`,
      `<div><div style="font:700 14px;color:#ed2590">${escapeHtml(author)}</div>`,
      `<div style="font:11px;color:#888">${timeAgo}</div></div></div>`,
    ].join('');

    const scrapEl = this.makeStaticField('div', `✎ ${scrap}`, 'padding:10px 12px;font:700 13px;color:#ed2590');
    const bodyEl = this.makeStaticField('div', note.body, 'padding:0 12px 12px;font:13px/1.45;color:#333;white-space:pre-wrap');
    card.appendChild(scrapEl);
    card.appendChild(bodyEl);

    const footer = document.createElement('div');
    footer.style.cssText = 'padding:8px 12px;background:#fff7fb;border-top:1px dashed #ffb7d8;font:11px;color:#666';
    footer.textContent = '💕 Fazer scrap de volta · ⭐ Confiança: pato · 😂 Quack!';
    card.appendChild(footer);

    this.appendCardImageDeferred(card, note);

    return card;
  }

  private buildDiscordMessage(note: JeremiasCard): HTMLElement {
    const author = note.author ?? 'JEREMIAS';
    const channel = note.channel ?? 'quack';
    const timeAgo = note.timeAgo ?? pickRandom(['Hoje às 14:02', 'Hoje às 09:17', 'Ontem às 23:41']);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'color:#dcddde';

    const channelEl = document.createElement('div');
    channelEl.style.cssText = 'font:700 12px/1.2;color:#96989d;margin-bottom:10px';
    channelEl.textContent = `# ${channel}`;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:12px';

    const avatar = document.createElement('div');
    avatar.style.cssText = 'width:40px;height:40px;border-radius:50%;background:#5865F2;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0';
    avatar.textContent = '🦆';

    const col = document.createElement('div');
    col.style.cssText = 'min-width:0';

    const head = document.createElement('div');
    head.style.cssText = 'margin-bottom:4px';
    head.innerHTML = `<span style="font:700 15px/1.2;color:#fff">${escapeHtml(author)}</span><span style="font:11px/1.2;color:#72767d;margin-left:8px">${timeAgo}</span>`;

    const bodyEl = this.makeStaticField('div', note.body, 'font:15px/1.45;white-space:pre-wrap;margin-bottom:6px');
    const meta = document.createElement('div');
    meta.style.cssText = 'font:12px;color:#72767d';
    meta.textContent = `👍 ${note.likes ?? randomRange(3, 42)} · 💬 ${note.comments ?? randomRange(1, 12)} respostas`;

    col.appendChild(head);
    col.appendChild(bodyEl);
    this.appendCardImageDeferred(col, note);
    col.appendChild(meta);
    row.appendChild(avatar);
    row.appendChild(col);
    wrap.appendChild(channelEl);
    wrap.appendChild(row);

    return wrap;
  }

  private buildTwitterPost(note: JeremiasCard): HTMLElement {
    const handle = note.handle ?? note.author ?? 'jeremias';
    const timeAgo = note.timeAgo ?? pickRandom(['2m', '14m', '1h']);

    const card = document.createElement('div');
    card.style.cssText = 'padding:12px;color:#e7e9ea';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;gap:10px;margin-bottom:8px';
    head.innerHTML = `<div style="width:42px;height:42px;border-radius:50%;background:#1d9bf0;display:flex;align-items:center;justify-content:center;font-size:20px">🦆</div><div><div style="font:700 14px">JEREMIAS</div><div style="font:13px;color:#71767b">@${escapeHtml(handle.replace(/^@/, ''))} · ${timeAgo}</div></div>`;

    const titleEl = this.makeStaticField('div', note.title, 'font:700 15px/1.35;margin-bottom:6px');
    const bodyEl = this.makeStaticField('div', note.body, 'font:15px/1.45;white-space:pre-wrap;color:#e7e9ea');

    card.appendChild(head);
    card.appendChild(titleEl);
    card.appendChild(bodyEl);
    this.appendCardImageDeferred(card, note);

    return card;
  }

  private buildWhatsAppChat(note: JeremiasCard): HTMLElement {
    const author = note.author ?? 'JEREMIAS 🦆';
    const timeAgo = note.timeAgo ?? pickRandom(['12:04', '18:47', 'Ontem']);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:10px;background:#ece5dd';

    const bubble = document.createElement('div');
    bubble.style.cssText = 'max-width:88%;background:#fff;border-radius:8px;padding:8px 10px;box-shadow:0 1px 1px rgba(0,0,0,.08)';

    const head = document.createElement('div');
    head.style.cssText = 'font:700 12px;color:#075e54;margin-bottom:4px';
    head.textContent = author;

    const bodyEl = this.makeStaticField('div', note.body, 'font:14px/1.45;color:#111;white-space:pre-wrap');
    const time = document.createElement('div');
    time.style.cssText = 'font:10px;color:#667;text-align:right;margin-top:4px';
    time.textContent = timeAgo;

    bubble.appendChild(head);
    bubble.appendChild(bodyEl);
    this.appendCardImageDeferred(bubble, note);
    bubble.appendChild(time);
    wrap.appendChild(bubble);

    return wrap;
  }

  private buildMsnMessage(note: JeremiasCard): HTMLElement {
    const author = note.author ?? 'JEREMIAS';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:12px;font:12px Tahoma,sans-serif';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;color:#005a9e;font-weight:700';
    head.innerHTML = `<span style="font-size:18px">🦋</span><span>${escapeHtml(author)} diz:</span>`;

    const bodyEl = this.makeStaticField('div', note.body, 'background:#fff;border:1px solid #b8cfe5;border-radius:6px;padding:8px 10px;color:#000;white-space:pre-wrap');

    wrap.appendChild(head);
    wrap.appendChild(bodyEl);
    this.appendCardImageDeferred(wrap, note);

    return wrap;
  }

  private buildInstagramPost(note: JeremiasCard): HTMLElement {
    const handle = note.handle ?? note.author ?? 'jeremias';
    const likes = note.likes ?? randomRange(20, 900);

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;color:#262626';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid #efefef';
    head.innerHTML = `<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(45deg,#f58529,#dd2a7b);display:flex;align-items:center;justify-content:center">🦆</div><div style="font:600 13px">@${escapeHtml(handle.replace(/^@/, ''))}</div>`;

    const caption = this.makeStaticField('div', `${note.title}\n\n${note.body}`, 'padding:10px 12px;font:14px/1.45;white-space:pre-wrap');
    const stats = document.createElement('div');
    stats.style.cssText = 'padding:0 12px 10px;font:600 13px';
    stats.textContent = `${likes} curtidas`;

    card.appendChild(head);
    this.appendCardImageDeferred(card, note, true);
    card.appendChild(caption);
    card.appendChild(stats);

    return card;
  }

  private buildTumblrPost(note: JeremiasCard): HTMLElement {
    const handle = note.handle ?? note.author ?? 'jeremias';

    const card = document.createElement('div');
    card.style.cssText = 'color:#fff';

    const head = document.createElement('div');
    head.style.cssText = 'padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.12);font:600 13px';
    head.textContent = `@${handle.replace(/^@/, '')}`;

    const titleEl = this.makeStaticField('div', note.title, 'padding:10px 12px 0;font:700 18px/1.3');
    const bodyEl = this.makeStaticField('div', note.body, 'padding:6px 12px 12px;font:14px/1.55;white-space:pre-wrap;color:#dbe4ef');

    card.appendChild(head);
    card.appendChild(titleEl);
    card.appendChild(bodyEl);
    this.appendCardImageDeferred(card, note);

    return card;
  }

  private buildTelegramMessage(note: JeremiasCard): HTMLElement {
    const channel = note.channel ?? 'quack news';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:12px';

    const channelEl = document.createElement('div');
    channelEl.style.cssText = 'font:700 13px;color:#2481cc;margin-bottom:8px';
    channelEl.textContent = channel;

    const titleEl = this.makeStaticField('div', note.title, 'font:700 15px/1.35;margin-bottom:6px;color:#000');
    const bodyEl = this.makeStaticField('div', note.body, 'font:14px/1.45;white-space:pre-wrap;color:#222');

    wrap.appendChild(channelEl);
    wrap.appendChild(titleEl);
    wrap.appendChild(bodyEl);
    this.appendCardImageDeferred(wrap, note);

    return wrap;
  }

  private appendCardImageDeferred(container: HTMLElement, note: JeremiasCard, placeholder = false): void {
    const slot = document.createElement('div');
    slot.dataset.jeremiasImage = '1';

    if (note.image) {
      const img = document.createElement('img');
      img.src = note.image;
      img.alt = note.imageAlt ?? note.title;
      img.loading = 'lazy';
      img.style.cssText = 'display:block;max-width:100%;height:auto;margin:8px 12px;border-radius:4px';
      slot.appendChild(img);
    } else if (placeholder) {
      slot.style.cssText = 'display:block;height:180px;margin:0;background:linear-gradient(135deg,#f58529,#dd2a7b,#8134af)';
    } else {
      return;
    }

    container.appendChild(slot);
  }

  private appendCardImage(container: HTMLElement, note: JeremiasCard): void {
    if (!note.image) return;
    const img = document.createElement('img');
    img.src = note.image;
    img.alt = note.imageAlt ?? note.title;
    img.loading = 'lazy';
    img.style.cssText = [
      'display:block',
      'max-width:100%',
      'height:auto',
      'margin:8px 0',
      'border-radius:4px',
    ].join(';');
    container.appendChild(img);
  }
}

function formatScore(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
