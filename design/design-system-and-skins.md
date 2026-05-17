# Design System And Skin Strategy

PandoraBox keeps the visual system in three layers so the lobby, built-in games, and future plugin games can evolve independently.

## 1. Interface Theme

Interface themes own the app shell only:

- lobby, settings, modal, history, favorites, achievements
- shared controls such as buttons, chips, tabs, panels, and cards
- global tokens such as `--page`, `--surface`, `--ink`, `--jade`, `--cinnabar`, `--shadow`, and `--radius`

The active interface theme is set on `html` with `data-theme` and `data-skin`. It must not style game-specific pieces directly.

## 2. Gameplay Shell

The gameplay shell owns the common mobile app frame for non-fullscreen games:

- `.play-frame`
- `.play-header`
- `.game-status`
- `.board-wrap`
- `.toolbar`

`src/main.js` adds these scope attributes to the game frame:

- `data-game-id`
- `data-category`
- `data-visual-style`

Shared shell CSS can use these attributes for layout and touch stability, but it should avoid drawing individual game pieces.

## 3. Game Visual Style

Game visual styles own game-specific presentation:

- chessboards, tiles, pieces, cells, HUD accents
- arcade neon variables
- puzzle-specific number pads and selected states
- per-game visual refinements

Built-in visual styles are registered in `src/theme/game-visuals.js`. Each style may include one or more CSS files:

```js
{
  value: "classic-number",
  label: "经典数字",
  styleSheets: ["./src/styles/game-skins/classic-number.css"]
}
```

When a game starts, `src/main.js` loads the selected style sheets into `<head>` with `data-game-style-sheet`. When the user returns to the lobby, those links are removed.

## Plugin Skin Contract

External plugin manifests may declare:

- `styleSheets`: CSS files loaded for the game regardless of selected visual style
- `visualStyles[].styleSheets`: CSS files loaded only when that visual style is active
- `assets`: icons, sprites, sounds, and other static files

Plugin CSS should be scoped:

```css
.play-frame[data-game-id="my-game"] .my-game-board {
  /* game styles */
}
```

This keeps plugin skins from leaking into the lobby or other games.

## Current Built-In Split

- `src/styles.css`: base tokens, lobby/app shell, common components, board primitives, arcade primitives, shared gameplay shell
- `src/styles/game-skins/guofeng-board.css`: board-game refinements and tic-tac-toe overrides
- `src/styles/game-skins/classic-number.css`: 2048 visual style
- `src/styles/game-skins/classic-puzzle.css`: Sudoku and Klotski visual style
- `src/styles/game-skins/classic-arcade.css`: arcade visual variables

Future work should continue moving game-only selectors out of `src/styles.css` and into `src/styles/game-skins/*` or plugin-owned CSS files.
