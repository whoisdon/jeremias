# @duckjeremias/react

<p align="center">
  <img src="docs/banner.png" alt="JEREMIAS banner" width="100%" />
</p>

Componente React **`<Jeremias />`** do pato travesso — wrapper sobre [`@duckjeremias/core`](https://www.npmjs.com/package/@duckjeremias/core) com `'use client'` para Next.js App Router.

## Instalação

```bash
npm install @duckjeremias/react @duckjeremias/character-duck
```

Peer dependencies: `react` e `react-dom` ≥ 18.

## Uso rápido (React / Next.js)

```tsx
'use client';

import { Jeremias } from '@duckjeremias/react';
import { createJeremiasCharacter } from '@duckjeremias/character-duck';
import sheet from '@duckjeremias/character-duck/assets/spritesheet.png';

const character = createJeremiasCharacter(sheet);

export function SitePet() {
  return (
    <Jeremias
      character={character}
      cards={[
        { style: 'notepad', title: 'Quack!', body: 'JEREMIAS was here 🦆' },
      ]}
      behavior={{
        aggression: 0.7,
        targets: ['#pricing', 'button.cta'],
        stealCursor: false,
        device: 'desktop',
      }}
    />
  );
}
```

Monte o componente uma vez por página (layout ou página raiz). A camada fica `position: fixed` com `pointer-events: none` no host — só os cards e o botão dismiss capturam cliques.

## Props

Todas as opções de `JeremiasConfig` do core viram props:

| Prop | Descrição |
|------|-----------|
| `character` | **Obrigatório.** `CharacterPack` |
| `cards` | Lista de cards flutuantes |
| `behavior` | Agressividade, alvos CSS, roubo de cursor, dispositivo |
| `tasks` | Comportamentos ativos |
| `speed` | Velocidades |
| `render` | Escala e z-index |
| `dismissible` | Mostra botão de dispensar |
| `onDismiss` | Callback ao destruir |
| `enabled` | Liga/desliga a instância (default: `true`) |
| `className` | Classe no host |

Props legadas ainda funcionam: `aggression`, `targets`, `notes`.

## Ref imperativa

```tsx
const ref = useRef<JeremiasInstance>(null);

// ref.current?.setAggression(0.9);
// ref.current?.grabElement('#hero');
// ref.current?.destroy();
```

## Exports

- `Jeremias` — componente
- `createJeremias` — re-export do core (uso sem React)
- Tipos de props e config via re-exports do core

Documentação completa: [monorepo JEREMIAS](https://github.com/whoisdon/jeremias#readme)

## Licença

MIT — [LICENSE](https://github.com/whoisdon/jeremias/blob/main/LICENSE)
