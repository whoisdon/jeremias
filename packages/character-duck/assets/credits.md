# Sprite credits

JEREMIAS uses **Pixel Duck Anim SpriteSheet** by **Etienne Pouvreau** (smolware).

- Source file: `assets/source/sprite-sheet.png`
- Page: https://smolware.itch.io/pixel-geese-anim-spritesheet
- License: free to use (name your own price on itch.io)

The build script (`scripts/generate-spritesheet.mjs`) slices the 32×32 source grid into a 48×48 engine spritesheet (`assets/spritesheet.png`):

| Row | Animation | Source rows (32px grid) |
| --- | --- | --- |
| idle | side idle | idle right |
| walk / run | side walk | walk right |
| peck | eating | eating / peck |
| fly / flyLeft | angry chase / rush | wing flap rows 11–12 (not sleep rows 13–14) |
| walkFront / runFront | walk toward camera | walk forward (row 4) |
| walkBack / runBack | walk away | walk back (row 6) |
| idleFront | idle facing camera | idle front |
| idleBack | idle facing away | idle back |

Side-facing sprites use horizontal flip in the engine for left movement.

Please keep this credit if you replace or redistribute the art.
