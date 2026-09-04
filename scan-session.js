/** 1回のスキャン = 機種情報と台データを別管理 */

import { getDepthLine } from "./depth.js";
import { pickDisplayName } from "./machine-picker-ui.js";

export function formatCounterSummary(data) {
  if (!data) return "データなし";
  const parts = [];
  if (data.current_spins != null) parts.push(`現在${data.current_spins}回`);
  if (data.today_first_hits != null) parts.push(`初当${data.today_first_hits}`);
  if (data.today_big_hits != null) parts.push(`大当${data.today_big_hits}`);
  if (data.lt_success) parts.push(`LT ${data.lt_success}`);
  else if (data.lt_rate_percent != null) parts.push(`LT ${Math.round(data.lt_rate_percent)}%`);
  if (data.today_max_payout != null) parts.push(`最高${data.today_max_payout}玉`);
  if (data.first_hit_probability) parts.push(`実績${data.first_hit_probability}`);
  if (data.spins_per_1000 != null) {
    parts.push(`実測${Number(data.spins_per_1000).toFixed(1)}回/千円`);
  }
  return parts.length ? parts.join(" · ") : "読み取り項目なし";
}

export function formatMachineSummary(spec, ocrName, machineId) {
  if (!spec) return { title: "未設定", meta: "機種を選択してください" };
  const name = pickDisplayName(spec);
  const official = spec.names?.[0] && spec.names[0] !== name ? spec.names[0] : "";
  const denom = spec.first_hit_denom ? `1/${Math.round(spec.first_hit_denom)}` : "";
  const depth = getDepthLine(spec);
  const depthLabel = depth.short;
  const src =
    machineId && machineId !== "auto" && machineId !== "ocr"
      ? "手動"
      : spec.match_source === "keyword"
        ? "キーワード一致"
        : spec.match_source === "name"
          ? "OCR一致"
          : spec.match_source === "manual"
            ? "手動"
            : "推定";
  let meta = [denom, depthLabel, src].filter(Boolean).join(" · ");
  if (official) meta += ` · ${official}`;
  if (ocrName && ocrName !== name && ocrName !== official) meta += `（OCR: ${ocrName}）`;
  return { title: name, meta };
}

export function mergeCounterData(base, overrides) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(overrides || {})) {
    if (v === "" || v == null) delete out[k];
    else out[k] = v;
  }
  return out;
}

/** フォーム値をOCRデータへ重ねる差分にする。空欄はOCR値の削除を意味する。 */
export function applyDataOverrides(_base, form) {
  const o = {};
  const setNumber = (key, raw) => {
    const value = raw?.trim();
    if (value === "" || value == null) {
      o[key] = null;
      return;
    }
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) o[key] = parsed;
  };

  setNumber("current_spins", form.current_spins);
  setNumber("today_first_hits", form.today_first_hits);
  setNumber("today_big_hits", form.today_big_hits);
  const lt = form.lt_success?.trim();
  if (lt === "" || lt == null) {
    o.lt_success = null;
    o.lt_rate_percent = null;
  } else {
    const m = lt.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) {
      o.lt_success = `${m[1]}/${m[2]}`;
      const t = parseInt(m[2], 10);
      if (t > 0) o.lt_rate_percent = (parseInt(m[1], 10) / t) * 100;
    }
  }
  setNumber("today_max_payout", form.today_max_payout);
  const prob = form.first_hit_probability?.trim();
  if (prob === "" || prob == null) o.first_hit_probability = null;
  else if (/^(?:1\s*\/\s*)?\d+$/.test(prob)) {
    o.first_hit_probability = prob.includes("/") ? prob : `1/${prob}`;
  }

  setNumber("trial_spins", form.trial_spins);
  const trialThousands = Number(form.trial_thousands?.trim());
  if (form.trial_thousands?.trim() === "" || form.trial_thousands == null) {
    o.trial_thousands = null;
    o.spins_per_1000 = null;
  } else if (Number.isFinite(trialThousands) && trialThousands > 0) {
    o.trial_thousands = trialThousands;
  }
  const trialSpins = o.trial_spins;
  const thousands = o.trial_thousands;
  if (Number.isFinite(trialSpins) && Number.isFinite(thousands) && thousands > 0) {
    o.spins_per_1000 = Math.round((trialSpins / thousands) * 10) / 10;
  } else if (trialSpins === null || thousands === null) {
    o.spins_per_1000 = null;
  }
  return o;
}

export function suggestMachineIdFromOcr(data, db, matchMachineFn) {
  const matched = matchMachineFn(data.machine_name, db, data);
  if (matched?.id && !String(matched.id).startsWith("profile_") && matched.id !== "p_generic_mid") {
    return matched.id;
  }
  return "auto";
}
