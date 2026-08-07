import EmissionsLedgerModel from "../models/EmissionsLedgerModel.js";
import UserModel from "../models/UserModel.js";
import FleetModel from "../models/FleetModel.js";
import {
  METHODOLOGY_VERSION,
  GRID_EMISSION_FACTOR_KG_PER_KWH,
  ICE_EQUIVALENT_FACTOR_KG_PER_KWH,
  computeEmissionsAvoidedKg,
} from "../utils/carbonMethodology.js";

// Called right after a charging session reaches "Completed" (from either
// StopChargingService's no-extension path or PayChargingSessionService's
// post-extension-payment paths). Idempotent on sessionId so it's safe to
// call from more than one completion path without double-counting.
export const recordEmissionsForSession = async (session) => {
  try {
    if (!session?.energyDelivered || session.energyDelivered <= 0) return;

    const exists = await EmissionsLedgerModel.exists({ sessionId: session._id });
    if (exists) return;

    const user = await UserModel.findById(session.userId).select("fleetId");

    await EmissionsLedgerModel.create({
      sessionId: session._id,
      bookingId: session.bookingId,
      userId: session.userId,
      fleetId: user?.fleetId || null,
      stationId: session.stationId,
      stationName: session.stationName,
      kwhDelivered: session.energyDelivered,
      methodologyVersion: METHODOLOGY_VERSION,
      gridEmissionFactorKgPerKwh: GRID_EMISSION_FACTOR_KG_PER_KWH,
      iceEquivalentFactorKgPerKwh: ICE_EQUIVALENT_FACTOR_KG_PER_KWH,
      emissionsAvoidedKg: computeEmissionsAvoidedKg(session.energyDelivered),
      sessionCompletedAt: session.stoppedAt || new Date(),
    });
  } catch (e) {
    // Ledger recording must never break the charging/payment flow itself.
    console.error("recordEmissionsForSession failed:", e.message);
  }
};

// ── Shared: verify caller owns a fleet, return the fleet + its member ids ──
const requireOwnedFleet = async (user_id) => {
  const user = await UserModel.findById(user_id).select("fleetId");
  if (!user?.fleetId) return { error: "You're not part of a fleet." };

  const fleet = await FleetModel.findById(user.fleetId);
  if (!fleet) return { error: "Fleet not found." };
  if (fleet.ownerId.toString() !== user_id.toString()) {
    return { error: "Only the fleet owner can access this." };
  }

  const memberIds = await UserModel.find({ fleetId: fleet._id }).distinct("_id");
  return { fleet, memberIds };
};

// ─── Fleet owner: aggregate emissions-avoided summary ───
export const GetFleetEmissionsSummaryService = async (user_id) => {
  try {
    const { error, fleet, memberIds } = await requireOwnedFleet(user_id);
    if (error) return { status: "fail", message: error };

    const entries = await EmissionsLedgerModel.find({ userId: { $in: memberIds } }).sort({ sessionCompletedAt: 1 });

    const totalKwh = entries.reduce((s, e) => s + e.kwhDelivered, 0);
    const totalAvoidedKg = entries.reduce((s, e) => s + e.emissionsAvoidedKg, 0);

    const byMonth = {};
    entries.forEach((e) => {
      const key = e.sessionCompletedAt.toISOString().slice(0, 7); // "2026-07"
      byMonth[key] = (byMonth[key] || 0) + e.emissionsAvoidedKg;
    });
    const trend = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, kg]) => ({ month, kg: Math.round(kg * 10) / 10 }));

    return {
      status: "Success",
      message: "Fleet emissions summary.",
      data: {
        fleetName: fleet.name,
        methodologyVersion: METHODOLOGY_VERSION,
        gridEmissionFactorKgPerKwh: GRID_EMISSION_FACTOR_KG_PER_KWH,
        iceEquivalentFactorKgPerKwh: ICE_EQUIVALENT_FACTOR_KG_PER_KWH,
        sessionsCounted: entries.length,
        totalKwhDelivered: Math.round(totalKwh * 10) / 10,
        totalEmissionsAvoidedKg: Math.round(totalAvoidedKg * 10) / 10,
        trend,
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

const csvField = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// ─── Fleet owner: verifier-ready CSV export of every ledger entry ───
export const ExportFleetEmissionsReportService = async (user_id) => {
  try {
    const { error, fleet, memberIds } = await requireOwnedFleet(user_id);
    if (error) return { status: "fail", message: error };

    const entries = await EmissionsLedgerModel.find({ userId: { $in: memberIds } })
      .populate("userId", "fullName email")
      .sort({ sessionCompletedAt: 1 });

    const header = [
      "session_id",
      "date",
      "driver_name",
      "driver_email",
      "station_name",
      "kwh_delivered",
      "grid_emission_factor_kg_per_kwh",
      "ice_equivalent_factor_kg_per_kwh",
      "emissions_avoided_kg",
      "methodology_version",
    ].join(",");

    const rows = entries.map((e) =>
      [
        e.sessionId,
        e.sessionCompletedAt.toISOString(),
        csvField(e.userId?.fullName),
        csvField(e.userId?.email),
        csvField(e.stationName),
        e.kwhDelivered,
        e.gridEmissionFactorKgPerKwh,
        e.iceEquivalentFactorKgPerKwh,
        e.emissionsAvoidedKg,
        e.methodologyVersion,
      ].join(",")
    );

    const csv = [header, ...rows].join("\n");
    const filename = `${fleet.name.replace(/[^a-z0-9]+/gi, "_")}_emissions_report_${new Date().toISOString().slice(0, 10)}.csv`;

    return { status: "Success", message: "Report generated.", data: { csv, filename } };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};
