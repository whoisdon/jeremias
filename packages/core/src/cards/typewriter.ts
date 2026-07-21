function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function charDelay(baseMs: number, char: string): number {
  if (char === '\n') return baseMs * 2.2;
  if (/[.,!?;:]/.test(char)) return baseMs * 2.8;
  if (char === ' ') return baseMs * 0.55;
  return baseMs + Math.random() * baseMs * 0.45;
}

export async function typeIntoField(
  el: HTMLElement | HTMLTextAreaElement,
  text: string,
  baseMs = 26,
): Promise<void> {
  if (el instanceof HTMLTextAreaElement) {
    el.value = '';
    for (let i = 0; i < text.length; i += 1) {
      el.value = text.slice(0, i + 1);
      await delay(charDelay(baseMs, text[i]!));
    }
    return;
  }

  el.textContent = '';
  for (let i = 0; i < text.length; i += 1) {
    el.textContent = text.slice(0, i + 1);
    await delay(charDelay(baseMs, text[i]!));
  }
}

export async function runTypewriterSequence(
  steps: Array<{ el: HTMLElement | HTMLTextAreaElement; text: string; pauseMs?: number }>,
  baseMs = 26,
): Promise<void> {
  for (const step of steps) {
    if (step.pauseMs) await delay(step.pauseMs);
    if (!step.text) continue;
    await typeIntoField(step.el, step.text, baseMs);
  }
}
