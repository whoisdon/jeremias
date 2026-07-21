# @duckjeremias/character-duck

<p align="center">
  <img src="docs/banner.png" alt="JEREMIAS banner" width="100%" />
</p>

**CharacterPack** e spritesheet pixel art do pato **JEREMIAS** — personagem padrão do monorepo.

## Instalação

```bash
npm install @duckjeremias/character-duck @duckjeremias/core
```

## Uso rápido

```ts
import { createJeremiasCharacter } from '@duckjeremias/character-duck';
import sheet from '@duckjeremias/character-duck/assets/spritesheet.png';

const character = createJeremiasCharacter(sheet);
```

Com React:

```tsx
import { Jeremias } from '@duckjeremias/react';
import { createJeremiasCharacter } from '@duckjeremias/character-duck';
import sheet from '@duckjeremias/character-duck/assets/spritesheet.png';

<Jeremias character={createJeremiasCharacter(sheet)} cards={[...]} />
```

## Exports

| Export | Descrição |
|--------|-----------|
| `createJeremiasCharacter(spritesheetUrl)` | Retorna `CharacterPack` pronto para `@duckjeremias/core` |
| `jeremiasCharacter` | Pack default (URL relativa `./spritesheet.png`) |
| `@duckjeremias/character-duck/assets/spritesheet.png` | Subpath do PNG publicado no npm |

### Animações incluídas

`idle`, `walk`, `run`, `peck`, `fly`, `walkFront`, `walkBack`, `idleFront`, `idleBack` e variantes espelhadas (`*Left`).

Frames: **48×48 px** por célula.

## Spritesheet no bundler

**Vite / webpack / Next.js** — importe o PNG:

```ts
import sheet from '@duckjeremias/character-duck/assets/spritesheet.png';
```

**Vanilla** — passe a URL pública do arquivo copiado para `public/` ou use o caminho do node_modules.

## Créditos da arte

Sprites base: **Pixel Duck Anim SpriteSheet** por **Etienne Pouvreau**.

Detalhes e licença da arte: [`assets/CREDITS.md`](./assets/CREDITS.md) no repositório.

## Licença do código

MIT — [LICENSE](https://github.com/whoisdon/jeremias/blob/main/LICENSE)

Documentação completa: [monorepo JEREMIAS](https://github.com/whoisdon/jeremias#readme)
