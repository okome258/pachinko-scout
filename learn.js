/** 端末内フィードバック学習（無料・プライバシー安全） */

const LOG_KEY = "pachinko_learn_log";
const BIAS_KEY = "pachinko_learn_bias";
const MAX_LOG = 200;

export function loadBias() {
  try {
    return JSON.parse(localStorage.getItem(BIAS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveBias(bias) {
  localStorage.setItem(BIAS_KEY, JSON.stringify(bias));
}

function loadLog() {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLog(log) {
  localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-MAX_LOG)));
}

function biasKey(machineName, counterId) {
  return `${machineName || "unknown"}::${counterId || "unknown"}`;
}

/** スコアに学習バイアスを適用 */
export function applyLearnedBias(score, machineName, counterId) {
  const bias = loadBias();
  const key = biasKey(machineName, counterId);
  const b = bias[key];
  if (!b) return { score, biasApplied: 0 };
  const delta = Math.max(-15, Math.min(15, b.delta || 0));
  return {
    score: Math.max(0, Math.min(100, score + delta)),
    biasApplied: delta,
  };
}

/** ユーザーが「当たった/外れた」を記録 */
export function recordFeedback(entry, outcome) {
  // outcome: "win" | "lose" | "skip"
  const log = loadLog();
  log.push({
    ...entry,
    outcome,
    at: Date.now(),
  });
  saveLog(log);

  if (outcome === "skip") return loadBias();

  const key = biasKey(entry.machine, entry.counter);
  const bias = loadBias();
  if (!bias[key]) bias[key] = { delta: 0, wins: 0, losses: 0 };

  if (outcome === "win") {
    bias[key].wins += 1;
    if (entry.verdict === "見送り") {
      bias[key].delta += 2;
    } else if (entry.verdict === "打つ候補") {
      bias[key].delta += 1;
    }
  } else if (outcome === "lose") {
    bias[key].losses += 1;
    if (entry.verdict === "打つ候補") {
      bias[key].delta -= 3;
    } else if (entry.verdict === "様子見") {
      bias[key].delta -= 1;
    }
  }

  bias[key].delta = Math.max(-15, Math.min(15, bias[key].delta));
  saveBias(bias);
  return bias;
}

export function getLearnStats() {
  const log = loadLog();
  const bias = loadBias();
  return {
    total: log.length,
    wins: log.filter((x) => x.outcome === "win").length,
    losses: log.filter((x) => x.outcome === "lose").length,
    machines: Object.keys(bias).length,
  };
}
