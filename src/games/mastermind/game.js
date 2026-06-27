import { choice } from "../../utils/random.js";

// 6 种颜色，难度调整可用色数与码长
const COLORS = [
  { id: 0, hex: "#ef4444", name: "红" },
  { id: 1, hex: "#f59e0b", name: "橙" },
  { id: 2, hex: "#facc15", name: "黄" },
  { id: 3, hex: "#22c55e", name: "绿" },
  { id: 4, hex: "#3b82f6", name: "蓝" },
  { id: 5, hex: "#a855f7", name: "紫" }
];

const DIFFICULTY = {
  easy: { colors: 4, length: 4 },
  medium: { colors: 6, length: 4 },
  hard: { colors: 6, length: 5 },
  devil: { colors: 6, length: 6 }
};

const MAX_TRIES = 10;

function makeSecret(colors, length) {
  const pool = COLORS.slice(0, colors).map((c) => c.id);
  return Array.from({ length }, () => choice(pool));
}

// 算黑钉(位置对)/白钉(颜色对位置错)
function score(secret, guess) {
  const length = secret.length;
  let black = 0;
  const secretLeft = [];
  const guessLeft = [];
  for (let i = 0; i < length; i += 1) {
    if (guess[i] === secret[i]) black += 1;
    else {
      secretLeft.push(secret[i]);
      guessLeft.push(guess[i]);
    }
  }
  let white = 0;
  for (const g of guessLeft) {
    const idx = secretLeft.indexOf(g);
    if (idx !== -1) {
      white += 1;
      secretLeft.splice(idx, 1);
    }
  }
  return { black, white };
}

export function mountMastermind(root, context) {
  const opt = DIFFICULTY[context?.difficulty] || DIFFICULTY.medium;
  const colors = opt.colors;
  const length = opt.length;

  let secret = makeSecret(colors, length);
  let guesses = []; // { code:[], black, white }
  let current = Array(length).fill(null);
  let pick = 0; // 当前正在填的格子
  let over = false;
  let reported = false;

  function reset() {
    secret = makeSecret(colors, length);
    guesses = [];
    current = Array(length).fill(null);
    pick = 0;
    over = false;
    reported = false;
    render();
  }

  function setColor(cid) {
    if (over) return;
    current[pick] = cid;
    pick = current.findIndex((v) => v === null);
    if (pick === -1) pick = length - 1;
    render();
  }

  function setSlot(i) {
    if (over) return;
    pick = i;
    render();
  }

  function submit() {
    if (over || current.some((v) => v === null)) return;
    const code = [...current];
    const { black, white } = score(secret, code);
    guesses.push({ code, black, white });
    current = Array(length).fill(null);
    pick = 0;
    if (black === length) {
      over = true;
      const tries = guesses.length;
      const sc = Math.max(50, (MAX_TRIES - tries + 1) * 100);
      if (!reported) {
        reported = true;
        context.reportResult?.({ outcome: "complete", detail: `${tries} 次破译`, score: sc, moves: tries });
        context.playSound?.("win");
      }
    } else if (guesses.length >= MAX_TRIES) {
      over = true;
      if (!reported) {
        reported = true;
        context.reportResult?.({ outcome: "loss", detail: "未能破译", score: 0, moves: MAX_TRIES });
        context.playSound?.("lose");
      }
    } else {
      context.playSound?.("move");
    }
    render();
  }

  function pegHTML(cid, active) {
    const c = COLORS[cid];
    return `background:${cid == null ? "transparent" : c.hex};border:2px ${active ? "solid #fff" : "solid rgba(255,255,255,.25)"};box-shadow:${active ? "0 0 0 2px #3b82f6" : "none"};`;
  }

  function feedbackHTML(black, white) {
    const pegs = [];
    for (let i = 0; i < black; i += 1) pegs.push("#111");
    for (let i = 0; i < white; i += 1) pegs.push("#fff");
    const empty = length - black - white;
    for (let i = 0; i < empty; i += 1) pegs.push("transparent");
    return pegs.map((bg) =>
      `<span style="width:12px;height:12px;border-radius:50%;background:${bg};border:1px solid rgba(255,255,255,.35);"></span>`
    ).join("");
  }

  function render() {
    const won = over && guesses.length && guesses[guesses.length - 1].black === length;
    const title = over ? (won ? "破译成功！" : "全部用完") : `第 ${guesses.length + 1} / ${MAX_TRIES} 次`;
    const note = over
      ? (won ? `用 ${guesses.length} 次猜中` : "正确密码已揭晓")
      : `${context?.labels?.mode || "单人"} · ${context?.labels?.difficulty || ""} · ${colors} 色 ${length} 位`;

    const past = guesses.map((g, n) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="min-width:18px;color:#94a3b8;font-size:12px;">${n + 1}</span>
        <div style="display:flex;gap:6px;">${g.code.map((cid) => `<span style="width:30px;height:30px;border-radius:50%;${pegHTML(cid, false)}"></span>`).join("")}</div>
        <div style="display:grid;grid-template-columns:repeat(${length},1fr);gap:3px;margin-left:auto;">${feedbackHTML(g.black, g.white)}</div>
      </div>`).join("");

    const slots = current.map((cid, i) =>
      `<button type="button" class="mm-slot" data-slot="${i}" style="width:40px;height:40px;border-radius:50%;${pegHTML(cid, i === pick && !over)}"></button>`
    ).join("");

    const palette = COLORS.slice(0, colors).map((c) =>
      `<button type="button" class="mm-color" data-color="${c.id}" aria-label="${c.name}" style="width:40px;height:40px;border-radius:50%;background:${c.hex};border:2px solid rgba(255,255,255,.3);"></button>`
    ).join("");

    const revealed = over && !won
      ? `<div style="display:flex;gap:6px;margin-top:8px;align-items:center;"><span style="color:#94a3b8;font-size:12px;">答案</span>${secret.map((cid) => `<span style="width:24px;height:24px;border-radius:50%;${pegHTML(cid, false)}"></span>`).join("")}</div>`
      : "";

    root.innerHTML = `
      <section class="game-panel game-status">
        <div><strong>${title}</strong><p class="game-note">${note}</p></div>
        <div class="mini-stats"><span>黑=位对</span><span>白=色对</span></div>
      </section>
      <section class="board-wrap" style="display:flex;flex-direction:column;gap:10px;">
        <div style="max-height:240px;overflow:auto;">${past || '<p class="game-note" style="margin:0;">选颜色填入下方，提交后看黑白钉反馈</p>'}</div>
        ${revealed}
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;">${slots}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">${palette}</div>
      </section>
      <section class="game-panel toolbar">
        <button class="secondary-button" data-action="clear" ${over ? "disabled" : ""}>清空</button>
        <button class="primary-button" data-action="submit" ${over ? "disabled" : ""}>提交</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>`;

    root.querySelectorAll("[data-color]").forEach((b) =>
      b.addEventListener("click", () => setColor(Number(b.dataset.color))));
    root.querySelectorAll("[data-slot]").forEach((b) =>
      b.addEventListener("click", () => setSlot(Number(b.dataset.slot))));
    root.querySelector("[data-action='clear']").addEventListener("click", () => {
      current = Array(length).fill(null);
      pick = 0;
      render();
    });
    root.querySelector("[data-action='submit']").addEventListener("click", submit);
    root.querySelector("[data-action='restart']").addEventListener("click", reset);
  }

  render();

  return () => { over = true; };
}
