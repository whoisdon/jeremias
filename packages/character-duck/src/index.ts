import type { CharacterPack } from '@duckjeremias/core';

export type { CharacterPack };

const animations: CharacterPack['animations'] = {
  idle: { row: 0, frames: 4, fps: 6 },
  idleLeft: { row: 1, frames: 4, fps: 6 },
  walk: { row: 2, frames: 2, fps: 5 },
  walkLeft: { row: 3, frames: 2, fps: 5 },
  run: { row: 4, frames: 2, fps: 8 },
  runLeft: { row: 5, frames: 2, fps: 8 },
  peck: { row: 6, frames: 5, fps: 8 },
  walkFront: { row: 7, frames: 4, fps: 6 },
  walkBack: { row: 8, frames: 4, fps: 6 },
  idleFront: { row: 9, frames: 4, fps: 6 },
  idleBack: { row: 10, frames: 4, fps: 6 },
  fly: { row: 11, frames: 10, fps: 14 },
  flyLeft: { row: 12, frames: 10, fps: 14 },
  runFront: { row: 7, frames: 4, fps: 8 },
  runBack: { row: 8, frames: 4, fps: 8 },
  strike: { row: 6, frames: 5, fps: 8 },
  flap: { row: 11, frames: 10, fps: 14 },
  flapLeft: { row: 12, frames: 10, fps: 14 },
};

export function createJeremiasCharacter(spritesheet: string): CharacterPack {
  return {
    id: 'jeremias',
    displayName: 'JEREMIAS',
    spritesheet,
    frameWidth: 48,
    frameHeight: 48,
    animations,
  };
}

export const jeremiasCharacter = createJeremiasCharacter('./spritesheet.png');

export default jeremiasCharacter;
