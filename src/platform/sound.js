let enabled = true;
let volume = 0.7;
let audioContext = null;
let lastTapAt = 0;

const PRESETS = {
  tap: [{ frequency: 520, duration: 0.035, gain: 0.34, type: "sine" }],
  move: [
    { frequency: 420, duration: 0.045, gain: 0.32, type: "triangle" },
    { frequency: 610, at: 0.035, duration: 0.04, gain: 0.22, type: "sine" }
  ],
  start: [
    { frequency: 392, duration: 0.05, gain: 0.3, type: "triangle" },
    { frequency: 587, at: 0.055, duration: 0.065, gain: 0.28, type: "triangle" },
    { frequency: 784, at: 0.12, duration: 0.08, gain: 0.22, type: "sine" }
  ],
  undo: [
    { frequency: 360, duration: 0.045, gain: 0.26, type: "sine" },
    { frequency: 260, at: 0.04, duration: 0.045, gain: 0.2, type: "sine" }
  ],
  hint: [
    { frequency: 740, duration: 0.055, gain: 0.22, type: "sine" },
    { frequency: 960, at: 0.06, duration: 0.055, gain: 0.18, type: "sine" }
  ],
  restart: [
    { frequency: 260, duration: 0.055, gain: 0.24, type: "triangle" },
    { frequency: 460, at: 0.06, duration: 0.055, gain: 0.2, type: "triangle" }
  ],
  win: [
    { frequency: 523.25, duration: 0.075, gain: 0.28, type: "triangle" },
    { frequency: 659.25, at: 0.08, duration: 0.075, gain: 0.24, type: "triangle" },
    { frequency: 783.99, at: 0.16, duration: 0.11, gain: 0.2, type: "sine" }
  ],
  loss: [
    { frequency: 330, duration: 0.09, gain: 0.22, type: "triangle" },
    { frequency: 247, at: 0.095, duration: 0.12, gain: 0.18, type: "sine" }
  ],
  draw: [
    { frequency: 440, duration: 0.075, gain: 0.2, type: "triangle" },
    { frequency: 440, at: 0.095, duration: 0.075, gain: 0.18, type: "triangle" }
  ],
  score: [
    { frequency: 494, duration: 0.06, gain: 0.22, type: "triangle" },
    { frequency: 622, at: 0.065, duration: 0.07, gain: 0.18, type: "sine" }
  ],
  invalid: [{ frequency: 180, duration: 0.06, gain: 0.18, type: "sawtooth" }]
};

function normalizeVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.7;
  return Math.max(0, Math.min(1, number > 1 ? number / 100 : number));
}

function getAudioContext() {
  if (!enabled || !volume || typeof window === "undefined") return null;
  const AudioConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioConstructor) return null;

  if (!audioContext) {
    audioContext = new AudioConstructor();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  return audioContext;
}

function playTone(context, tone, baseGain) {
  const startAt = context.currentTime + (tone.at || 0);
  const duration = tone.duration || 0.05;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = tone.type || "sine";
  oscillator.frequency.setValueAtTime(tone.frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, baseGain * (tone.gain || 0.2)), startAt + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

export function configureSound(options = {}) {
  if ("enabled" in options) enabled = options.enabled !== false;
  if ("volume" in options) volume = normalizeVolume(options.volume);
}

export function playSound(name = "tap") {
  if (name === "tap") {
    const now = Date.now();
    if (now - lastTapAt < 45) return false;
    lastTapAt = now;
  }

  const context = getAudioContext();
  if (!context) return false;

  const tones = PRESETS[name] || PRESETS.tap;
  const baseGain = Math.max(0.018, Math.min(0.16, volume * 0.16));
  tones.forEach((tone) => playTone(context, tone, baseGain));
  return true;
}

export function playResultSound(outcome) {
  const soundName = outcome === "complete" ? "win" : outcome || "score";
  playSound(soundName);
}
