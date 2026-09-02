/** 機種の手動選択・カスタム登録 */

const CUSTOM_KEY = "pachinko_custom_machines";
const SELECT_KEY = "pachinko_machine_select";

export function loadCustomMachines() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveCustomMachine(spec) {
  const list = loadCustomMachines();
  const id = spec.id || `custom_${Date.now()}`;
  const entry = {
    id,
    names: [spec.name],
    type: spec.type || "mid",
    first_hit_denom: Number(spec.first_hit_denom) || 319,
    ceiling_spins: Number(spec.ceiling_spins) || 840,
    lt_critical: Boolean(spec.lt_critical),
    small_hit_max: Number(spec.small_hit_max) || 300,
    good_hit_min: Number(spec.good_hit_min) || 3000,
    ceiling_near_ratio: 0.75,
    notes: "カスタム登録",
  };
  const idx = list.findIndex((m) => m.id === id);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  return entry;
}

export function getSelectedMachineId() {
  return localStorage.getItem(SELECT_KEY) || "auto";
}

export function setSelectedMachineId(id) {
  localStorage.setItem(SELECT_KEY, id);
}

export function getAllMachineOptions(db) {
  const builtins = (db?.machines || []).filter(
    (m) => !String(m.id).includes("generic") && !m.picker_hidden,
  );
  const custom = loadCustomMachines();
  return [...builtins, ...custom];
}

export function getSeriesGroups(db) {
  return db?.series_groups || [];
}

function parseDenomFromData(data) {
  const s = data.spec_on_screen || data.first_hit_probability;
  if (!s) return null;
  const m = String(s).match(/1\s*\/\s*(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

export function resolveMachineSpecSync(data, db, selectedId, matchMachineFn) {
  const all = getAllMachineOptions(db);

  if (selectedId && selectedId !== "auto") {
    const manual = all.find((m) => m.id === selectedId);
    if (manual) {
      return {
        ...manual,
        match_source: "manual",
        first_hit_denom: manual.first_hit_denom || parseDenomFromData(data) || 319,
      };
    }
  }

  const matched = matchMachineFn(data.machine_name, db, data);
  const denom = parseDenomFromData(data);
  if (denom && !matched.first_hit_denom) {
    matched.first_hit_denom = denom;
  }
  return matched;
}
