export function boardPreview(game) {
  if (game.icon) {
    return `
      <div class="game-art accent-${game.accent}">
        <img src="${game.icon}" alt="" loading="lazy" />
      </div>
    `;
  }

  if (game.id === "gomoku") {
    return `
      <div class="preview-board preview-grid">
        ${Array.from({ length: 25 }, (_, index) => {
          const stone = [6, 12, 18].includes(index) ? "black" : [7, 13].includes(index) ? "white" : "";
          return `<span class="${stone ? `preview-stone ${stone}` : ""}"></span>`;
        }).join("")}
      </div>
    `;
  }

  if (game.id === "go") {
    return `
      <div class="preview-board preview-grid go-preview">
        ${Array.from({ length: 25 }, (_, index) => {
          const stone = [8, 11, 16].includes(index) ? "black" : [7, 12, 17].includes(index) ? "white" : "";
          return `<span class="${stone ? `preview-stone ${stone}` : ""}"></span>`;
        }).join("")}
      </div>
    `;
  }

  if (game.id === "xiangqi") {
    return `
      <div class="preview-xiangqi" aria-hidden="true">
        <b>車</b><b>馬</b><b>相</b><b>帥</b><b>炮</b>
      </div>
    `;
  }

  if (game.id === "checkers") {
    return `
      <div class="preview-checkers" aria-hidden="true">
        ${["#c64234", "#e4a72f", "#1f8d67", "#3277b7", "#7a5bb7", "#d65f8d"].map((color) =>
          `<span style="background:${color}"></span>`
        ).join("")}
      </div>
    `;
  }

  if (game.id === "reversi") {
    return `
      <div class="preview-board preview-grid reversi-preview" aria-hidden="true">
        ${Array.from({ length: 25 }, (_, index) => {
          const stone = [7, 13].includes(index) ? "black" : [11, 17].includes(index) ? "white" : "";
          return `<span class="${stone ? `preview-stone ${stone}` : ""}"></span>`;
        }).join("")}
      </div>
    `;
  }

  if (game.id === "draughts") {
    return `
      <div class="preview-draughts" aria-hidden="true">
        ${Array.from({ length: 16 }, (_, index) => {
          const row = Math.floor(index / 4);
          const piece = row < 2 ? "black" : row > 1 ? "red" : "";
          return `<span class="${piece}"></span>`;
        }).join("")}
      </div>
    `;
  }

  if (game.id === "sudoku") {
    return `
      <div class="preview-sudoku" aria-hidden="true">
        ${["5", "", "4", "", "7", "", "9", "", "2"].map((value) => `<span>${value}</span>`).join("")}
      </div>
    `;
  }

  if (game.id === "klotski") {
    return `
      <div class="preview-klotski" aria-hidden="true">
        <span class="cao">曹</span><span>将</span><span>关</span><span>卒</span>
      </div>
    `;
  }

  if (game.id === "2048") {
    return `
      <div class="preview-2048" aria-hidden="true">
        <span>2</span><span>4</span><span>8</span><span>16</span>
      </div>
    `;
  }

  if (game.id === "tictactoe") {
    return `
      <div class="preview-tictactoe" aria-hidden="true">
        ${["X", "", "O", "", "X", "", "O", "", "X"].map((value) => `<span>${value}</span>`).join("")}
      </div>
    `;
  }

  return `
    <div class="preview-flying" aria-hidden="true">
      <span>1</span><span>2</span><span>3</span><span>4</span>
    </div>
  `;
}
