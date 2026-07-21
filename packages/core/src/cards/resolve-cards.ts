import type { JeremiasCard, PanelStyle } from '../types';
import { randomRange } from '../utils';

const STRING_STYLES: PanelStyle[] = [
  'reddit',
  'notepad',
  'facebook',
  'orkut',
  'discord',
  'twitter',
  'whatsapp',
  'msn',
  'instagram',
  'tumblr',
  'telegram',
];

function stringToCard(text: string, index: number): JeremiasCard {
  const lines = text.split('\n').filter(Boolean);
  const title = lines[0]?.slice(0, 120) ?? 'Untitled';
  const body = lines.slice(1).join('\n') || text;
  const style = STRING_STYLES[index % STRING_STYLES.length];

  const base: JeremiasCard = { style, title, body, author: 'JEREMIAS' };
  if (style === 'reddit') {
    return { ...base, subreddit: 'r/quack', upvotes: randomRange(100, 5000), comments: randomRange(5, 200) };
  }
  if (style === 'discord' || style === 'telegram') return { ...base, channel: 'quack' };
  if (style === 'orkut') return { ...base, scrap: title };
  if (style === 'twitter' || style === 'instagram' || style === 'tumblr') {
    return { ...base, handle: 'jeremias' };
  }
  if (style === 'whatsapp' || style === 'msn') return { ...base, author: 'JEREMIAS 🦆' };
  return base;
}

function normalizeCard(note: string | JeremiasCard, index: number): JeremiasCard {
  if (typeof note === 'string') return stringToCard(note, index);
  if (note.style) return note;
  if (note.subreddit) return { ...note, style: 'reddit' };
  return { ...note, style: 'notepad' };
}

/** Resolve cards do usuário; retorna vazio se nada foi passado. */
export function resolveCards(custom?: (string | JeremiasCard)[]): JeremiasCard[] {
  if (!custom?.length) return [];
  return custom.map((note, index) => normalizeCard(note, index));
}

export function randomCard(cards: JeremiasCard[]): JeremiasCard {
  return cards[Math.floor(Math.random() * cards.length)]!;
}
