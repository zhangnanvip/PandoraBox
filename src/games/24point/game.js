import { clamp } from "../../utils/random.js";

// 24 点：四个数字 + - * / 凑成 24。
// 内部全程用分数 {n, d} 精确运算，避免浮点误差导致判定不准。

const TARGET = 24;
const ROUND_GOAL = 5; // 一局通关需解出的回合数

const DIFFICULTY = {
  easy: { min: 1, max: 9, label: "1–9" },
  medium: { min: 1, max: 12, label: "1–12" },
  hard: { min: 2, max: 13, label: "2–13" },
  devil: { min: 4, max: 13, label: "4–13" }
};

function diffConfig(difficulty) {
  return DIFFICULTY[difficulty] || DIFFICULTY.medium;
}

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function frac(n, d = 1) {
  if (d === 0) return null;
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

function apply(op, a, b) {
  switch (op) {
    case "+": return frac(a.n * b.d + b.n * a.d, a.d * b.d);
    case "-": return frac(a.n * b.d - b.n * a.d, a.d * b.d);
    case "*": return frac(a.n * b.n, a.d * b.d);
    case "/": return b.n === 0 ? null : frac(a.n * b.d, a.d * b.n);
    default: return null;
  }
}

function isTarget(f) {
  return f && f.d === 1 && f.n === TARGET;
}

function fracText(f) {
  if (!f) return "—";
  if (f.d === 1) return String(f.n);
  return `${f.n}/${f.d}`;
}

const OPS = ["+", "-", "*", "/"];

// 暴力枚举能否凑 24，返回 true/false
function solvable(nums) {
  if (nums.length === 1) return isTarget(nums[0]);
  for (let i = 0; i < nums.length; i += 1) {
    for (let j = 0; j < nums.length; j += 1) {
      if (i === j) continue;
      const rest = nums.filter((_, k) => k !== i && k !== j);
      for (const op of OPS) {
        const r = apply(op, nums[i], nums[j]);
        if (r && solvable([...rest, r])) return true;
      }
    }
  }
  return false;
}

// 求一条解的步骤序列，每步 {a, b, op}（值文本），失败返回 null
function findSolution(values) {
  const items = values.map((v) => ({ frac: frac(v), label: String(v) }));
  const result = search(items);
  return result;

  function search(list) {
    if (list.length === 1) return isTarget(list[0].frac) ? [] : null;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = 0; j < list.length; j += 1) {
        if (i === j) continue;
        const rest = list.filter((_, k) => k !== i && k !== j);
        for (const op of OPS) {
          const r = apply(op, list[i].frac, list[j].frac);
          if (!r) continue;
          const combined = {
            frac: r,
            label: `(${list[i].label}${op}${list[j].label})`
          };
          const step = { a: fracText(list[i].frac), b: fracText(list[j].frac), op };
          const tail = search([...rest, combined]);
          if (tail) return [step, ...tail];
        }
      }
    }
    return null;
  }
}

function deal(difficulty) {
  const cfg = diffConfig(difficulty);
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const nums = Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * (cfg.max - cfg.min + 1)) + cfg.min
    );
    if (solvable(nums.map((n) => frac(n)))) return nums;
  }
  return [3, 8, 8, 8]; // 兜底：经典 24 解 8/(3-8/3)
}

function newCards(difficulty) {
  return deal(difficulty).map((value, index) => ({
    id: `c${index}`,
    value,
    frac: frac(value),
    text: String(value),
    used: false
  }));
}

export function mount24Point(root, context) {
  const cfg = diffConfig(context.difficulty);
  let disposed = false;
  let timerId = 0;
  let reported = false;

  let cards = newCards(context.difficulty);
  let history = []; // 栈：每项是上一帧 cards 的快照
  let selected = null; // 选中的卡 id
  let pendingOp = null; // 选中的运算符
  let solvedRounds = 0;
  let moves = 0;
  let hint = "";
  let message = "选数字 → 运算符 → 数字，凑出 24";
  let elapsed = 0;
  const startedAt = Date.now();

  function liveCards() {
    return cards.filter((c) => !c.used);
  }

  function snapshot() {
    return cards.map((c) => ({ ...c }));
  }

  function pushHistory() {
    history.push(snapshot());
    if (history.length > 50) history.shift();
  }

  function tick() {
    elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const el = root.querySelector("[data-time]");
    if (el) el.textContent = formatTime(elapsed);
  }

  function combine(opCard, op, target) {
    const r = apply(op, opCard.frac, target.frac);
    if (!r) {
      message = "除数不能为 0，换个组合";
      selected = null;
      pendingOp = null;
      render();
      return;
    }
    pushHistory();
    moves += 1;
    opCard.used = true;
    target.frac = r;
    target.text = fracText(r);
    selected = null;
    pendingOp = null;
    hint = "";
    const remaining = liveCards();
    if (remaining.length === 1 && isTarget(remaining[0].frac)) {
      roundWon();
      return;
    }
    if (remaining.length === 1) {
      message = `得到 ${remaining[0].text}，没凑到 24，撤销或重开`;
      context.playSound?.("err");
    } else {
      message = "继续，把剩下的凑成 24";
    }
    render();
  }

  function roundWon() {
    solvedRounds += 1;
    context.playSound?.("win");
    if (solvedRounds >= ROUND_GOAL) {
      finish();
      return;
    }
    message = `第 ${solvedRounds} 关解出！下一局准备`;
    setTimeout(() => {
      if (disposed) return;
      cards = newCards(context.difficulty);
      history = [];
      selected = null;
      pendingOp = null;
      hint = "";
      render();
    }, 650);
    render();
  }

  function finish() {
    if (reported) return;
    reported = true;
    const secs = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    const score = clamp(Math.round(ROUND_GOAL * 200 - secs * 2 - moves), 0, 99999);
    message = `通关！${ROUND_GOAL} 关用时 ${formatTime(secs)}`;
    context.reportResult?.({ outcome: "complete", score, moves });
    render();
  }

  function onCard(id) {
    if (reported) return;
    const card = cards.find((c) => c.id === id && !c.used);
    if (!card) return;
    context.playSound?.("tap");
    if (selected === null) {
      selected = id;
    } else if (selected === id) {
      selected = null;
      pendingOp = null;
    } else if (pendingOp) {
      const opCard = cards.find((c) => c.id === selected && !c.used);
      if (opCard) combine(opCard, pendingOp, card);
    } else {
      selected = id; // 没选运算符就换选数字
    }
    render();
  }

  function onOp(op) {
    if (reported || selected === null) {
      message = "先点一个数字，再点运算符";
      render();
      return;
    }
    pendingOp = op;
    render();
  }

  function undo() {
    if (!history.length) return;
    cards = history.pop();
    selected = null;
    pendingOp = null;
    hint = "";
    moves = Math.max(0, moves - 1);
    message = "已撤销一步";
    render();
  }

  function newDeal() {
    cards = newCards(context.difficulty);
    history = [];
    selected = null;
    pendingOp = null;
    hint = "";
    message = "新一局，凑出 24";
    render();
  }

  function restart() {
    solvedRounds = 0;
    moves = 0;
    reported = false;
    newDeal();
  }

  function showHint() {
    const steps = findSolution(liveCards().map((c) => c.value));
    if (steps && steps.length) {
      const s = steps[0];
      hint = `提示：${s.a} ${s.op} ${s.b}`;
    } else {
      hint = "当前局面无解，建议撤销或新局";
    }
    render();
  }

  function render() {
    const remaining = liveCards();
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${message}</strong>
          <p class="game-note">${context.labels?.difficulty || ""}（${cfg.label}）· 凑 ${TARGET} · 通关需 ${ROUND_GOAL} 关</p>
        </div>
        <div class="mini-stats">
          <span>关 ${solvedRounds}/${ROUND_GOAL}</span>
          <span data-time>${formatTime(elapsed)}</span>
        </div>
      </section>

      <section class="board-wrap" style="display:flex;flex-direction:column;gap:14px;align-items:center;">
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;width:100%;max-width:360px;">
          ${cards.map((c) => {
            if (c.used) {
              return `<div style="aspect-ratio:1/1;border-radius:16px;border:2px dashed rgba(125,125,140,.35);"></div>`;
            }
            const on = selected === c.id;
            return `<button type="button" data-card="${c.id}" style="aspect-ratio:1/1;border-radius:16px;border:2px solid ${on ? "#f59e0b" : "rgba(125,125,140,.4)"};background:${on ? "rgba(245,158,11,.18)" : "rgba(255,255,255,.06)"};font-size:clamp(28px,9vw,40px);font-weight:700;cursor:pointer;color:inherit;">${c.text}</button>`;
          }).join("")}
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;width:100%;max-width:360px;">
          ${OPS.map((op) => `<button type="button" data-op="${op}" style="min-height:56px;border-radius:14px;border:2px solid ${pendingOp === op ? "#f59e0b" : "rgba(125,125,140,.4)"};background:${pendingOp === op ? "rgba(245,158,11,.18)" : "rgba(255,255,255,.04)"};font-size:26px;font-weight:700;cursor:pointer;color:inherit;">${op === "*" ? "×" : op === "/" ? "÷" : op}</button>`).join("")}
        </div>
        ${hint ? `<p class="game-note" style="margin:0;color:#f59e0b;">${hint}</p>` : ""}
      </section>

      <section class="game-panel toolbar">
        <button class="primary-button" data-action="hint">提示</button>
        <button class="secondary-button" data-action="undo" ${history.length ? "" : "disabled"}>撤销</button>
        <button class="secondary-button" data-action="deal">换一局</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-card]").forEach((b) =>
      b.addEventListener("click", () => onCard(b.dataset.card))
    );
    root.querySelectorAll("[data-op]").forEach((b) =>
      b.addEventListener("click", () => onOp(b.dataset.op))
    );
    root.querySelector("[data-action='hint']").addEventListener("click", showHint);
    root.querySelector("[data-action='undo']").addEventListener("click", undo);
    root.querySelector("[data-action='deal']").addEventListener("click", newDeal);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  render();
  timerId = window.setInterval(tick, 1000);

  return () => {
    disposed = true;
    clearInterval(timerId);
  };
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
