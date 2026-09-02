/** 交換率に応じた千円ボーダー（回/1000円） */

const EXCHANGE_KEY = "pachinko_exchange_yen";
const LOAN_KEY = "pachinko_loan_yen";

export const EXCHANGE_PRESETS = [
  { yen: 4.0, label: "等価4.00" },
  { yen: 3.85, label: "3.85(26玉)" },
  { yen: 3.64, label: "3.64(27.5玉)" },
  { yen: 3.57, label: "3.57(28玉)" },
];

export function getExchangeYen() {
  const v = Number(localStorage.getItem(EXCHANGE_KEY));
  // 旧プリセット（3.33以下）が残っていたら現行デフォルトへ
  if (!(v > 0) || v < 3.57) return 3.57;
  return v;
}

export function setExchangeYen(yen) {
  localStorage.setItem(EXCHANGE_KEY, String(yen));
}

export function getLoanYen() {
  const v = Number(localStorage.getItem(LOAN_KEY));
  return v > 0 ? v : 4;
}

export function setLoanYen(yen) {
  localStorage.setItem(LOAN_KEY, String(yen));
}

/**
 * 等価交換時の基準ボーダー（回/1000円）を機種タイプから概算。
 * 厳密なTYシミュレーションではなく、店頭で使う目安。
 */
export function estimateEqualBorder(spec = {}) {
  const denom =
    Number(spec.first_hit_denom) ||
    Number(spec.ev_spec?.first_hit_denom) ||
    319;
  const type = spec.type;

  if (type === "amadeji" || denom <= 120) return 17.5;
  if (type === "light_mid" || denom <= 250) return 18.8;
  if (type === "heavy" || denom >= 400) return 20.5;
  return 19.5;
}

/**
 * 交換率込みボーダー
 * 必要回収率 = 貸玉 ÷ 交換単価 で等価ボーダーをスケール
 */
export function calcBorder(spec = {}, opts = {}) {
  const loan = opts.loanYen ?? getLoanYen();
  const ex = opts.exchangeYen ?? getExchangeYen();
  const equal = estimateEqualBorder(spec);
  const requiredRate = loan / Math.max(ex, 0.01);
  const border = Math.round(equal * requiredRate * 10) / 10;
  const ratePct = Math.round(requiredRate * 1000) / 10;

  return {
    border,
    equal_border: equal,
    loan_yen: loan,
    exchange_yen: ex,
    required_rate_pct: ratePct,
    summary: `ボーダー ${border}回/千円（交換${formatYen(ex)}円）`,
    detail: `等価${equal}回 × 必要${ratePct}%（貸玉${loan}円）`,
  };
}

function formatYen(y) {
  const n = Number(y);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
