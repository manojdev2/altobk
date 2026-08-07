// ── Emissions-avoided methodology (v1) ──────────────────────────────────
// Baseline (what would have happened): an equivalent internal-combustion
// vehicle emits roughly 120 g CO2/km, and a comparable EV consumes roughly
// 0.15 kWh/km — so each kWh of EV charging displaces about
// 120 / 0.15 = 800 g CO2 = 0.80 kg CO2 of baseline ICE emissions.
// Project (what actually happened): charging that kWh from the grid emits
// GRID_EMISSION_FACTOR_KG_PER_KWH kg CO2, per India's CEA (Central
// Electricity Authority) published all-India average grid emission factor.
//
// emissions avoided = kWh delivered × (ICE baseline factor − grid factor)
//
// Both factors are snapshotted onto every ledger entry at calculation time
// (see EmissionsLedgerModel), so updating them here only affects sessions
// completed after the change — past entries stay pinned to the methodology
// that was actually in force when the energy was delivered.
export const METHODOLOGY_VERSION = "v1-cea-grid-avg-2024";
export const GRID_EMISSION_FACTOR_KG_PER_KWH = 0.716;
export const ICE_EQUIVALENT_FACTOR_KG_PER_KWH = 0.8;

export const computeEmissionsAvoidedKg = (kwhDelivered) => {
  const avoidedPerKwh = ICE_EQUIVALENT_FACTOR_KG_PER_KWH - GRID_EMISSION_FACTOR_KG_PER_KWH;
  return Math.max(0, Math.round(kwhDelivered * avoidedPerKwh * 1000) / 1000);
};
