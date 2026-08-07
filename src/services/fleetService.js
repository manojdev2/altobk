import crypto from "crypto";
import FleetModel from "../models/FleetModel.js";
import UserModel from "../models/UserModel.js";
import ChargingSessionModel from "../models/ChargingSessionModel.js";
import NearestStationModel from "../models/NearestStationModel.js";
import BookingModel from "../models/BookingModel.js";
import VehicleModel from "../models/VehicleModel.js";
import AppSettingsModel from "../models/AppSettingsModel.js";
import { askGemini } from "../utils/geminiHelper.js";
import { rankStationsByScore } from "../utils/stationScore.js";
import { generateNext7Dates } from "../utils/stationHelpers.js";

const generateInviteCode = () => crypto.randomBytes(3).toString("hex").toUpperCase(); // e.g. "A1B2C3"

// Same uptime weighting the trust/verification system uses elsewhere.
const CONFIDENCE_UPTIME = { verified: 100, mixed: 65, reported_broken: 15 };
const SLA_GUARANTEE_THRESHOLD = 90;

const parseTimeToMinutes = (t) => {
  const [time, period] = t.trim().split(" ");
  let [h, m] = time.split(":").map(Number);
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h * 60 + m;
};

// Is `slotStartMin` inside the [windowStart, windowEnd) range, handling
// overnight windows where windowEnd wraps past midnight (e.g. 22:00–06:00)?
const isInWindow = (slotStartMin, windowStartMin, windowEndMin) => {
  if (windowStartMin <= windowEndMin) {
    return slotStartMin >= windowStartMin && slotStartMin < windowEndMin;
  }
  return slotStartMin >= windowStartMin || slotStartMin < windowEndMin;
};

// ─── Create a fleet — the creator becomes owner + first member ───
export const CreateFleetService = async (user_id, body) => {
  try {
    const { name } = body;
    if (!name || !name.trim()) return { status: "fail", message: "Fleet name is required." };

    const existing = await UserModel.findById(user_id).select("fleetId");
    if (existing?.fleetId) return { status: "fail", message: "You're already part of a fleet." };

    let inviteCode;
    do {
      inviteCode = generateInviteCode();
    } while (await FleetModel.exists({ inviteCode }));

    const fleet = await FleetModel.create({ name: name.trim(), ownerId: user_id, inviteCode });
    await UserModel.findByIdAndUpdate(user_id, { fleetId: fleet._id });

    return { status: "Success", message: "Fleet created.", data: fleet };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Join an existing fleet via invite code ───
export const JoinFleetService = async (user_id, body) => {
  try {
    const { inviteCode } = body;
    if (!inviteCode) return { status: "fail", message: "Invite code is required." };

    const existing = await UserModel.findById(user_id).select("fleetId");
    if (existing?.fleetId) return { status: "fail", message: "You're already part of a fleet." };

    const fleet = await FleetModel.findOne({ inviteCode: inviteCode.trim().toUpperCase() });
    if (!fleet) return { status: "fail", message: "Invalid invite code." };

    await UserModel.findByIdAndUpdate(user_id, { fleetId: fleet._id });
    return { status: "Success", message: `Joined ${fleet.name}.`, data: fleet };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Current user's fleet membership (owner or member) ───
export const GetMyFleetService = async (user_id) => {
  try {
    const user = await UserModel.findById(user_id).select("fleetId");
    if (!user?.fleetId) return { status: "Success", message: "Not in a fleet.", data: null };

    const fleet = await FleetModel.findById(user.fleetId);
    if (!fleet) return { status: "Success", message: "Not in a fleet.", data: null };

    const memberCount = await UserModel.countDocuments({ fleetId: fleet._id });

    return {
      status: "Success",
      message: "Fleet membership found.",
      data: {
        _id: fleet._id,
        name: fleet.name,
        inviteCode: fleet.inviteCode,
        isOwner: fleet.ownerId.toString() === user_id.toString(),
        memberCount,
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ── Shared: verify caller owns a fleet, and gather the full dashboard dataset ──
// Used by both the dashboard endpoint and the AI assistant, so the assistant
// always answers from exactly the same numbers the owner sees on screen.
const getOwnedFleetDashboardData = async (user_id) => {
  const user = await UserModel.findById(user_id).select("fleetId");
  if (!user?.fleetId) return { error: "You're not part of a fleet." };

  const fleet = await FleetModel.findById(user.fleetId);
  if (!fleet) return { error: "Fleet not found." };
  if (fleet.ownerId.toString() !== user_id.toString()) {
    return { error: "Only the fleet owner can access this." };
  }

  const members = await UserModel.find({ fleetId: fleet._id }).select("fullName email trustTier trustScore noShowCount");

  const perMember = await Promise.all(
    members.map(async (m) => {
      const stats = await ChargingSessionModel.aggregate([
        { $match: { userId: m._id, status: "Completed" } },
        { $group: { _id: null, sessions: { $sum: 1 }, kwh: { $sum: "$energyDelivered" }, spend: { $sum: "$totalAmount" } } },
      ]);
      const s = stats[0] || { sessions: 0, kwh: 0, spend: 0 };
      return {
        userId: m._id,
        fullName: m.fullName,
        email: m.email,
        trustTier: m.trustTier,
        trustScore: m.trustScore,
        noShowCount: m.noShowCount,
        sessions: s.sessions,
        kwhUsed: Math.round(s.kwh * 10) / 10,
        spend: Math.round(s.spend * 100) / 100,
      };
    })
  );

  const totals = perMember.reduce(
    (acc, m) => ({
      sessions: acc.sessions + m.sessions,
      kwhUsed: acc.kwhUsed + m.kwhUsed,
      spend: acc.spend + m.spend,
      trustScoreSum: acc.trustScoreSum + (m.trustScore ?? 100),
    }),
    { sessions: 0, kwhUsed: 0, spend: 0, trustScoreSum: 0 }
  );
  const avgTrustScore = perMember.length > 0 ? Math.round(totals.trustScoreSum / perMember.length) : 100;

  // ── Fleet SLA: real uptime across the stations this fleet actually uses ──
  const memberIds = members.map((m) => m._id);
  const usedStationIds = await BookingModel.distinct("stationId", { userId: { $in: memberIds } });
  const usedStations = await NearestStationModel.find({ _id: { $in: usedStationIds } }).select("name communityConfidence");
  const rated = usedStations.filter((s) => CONFIDENCE_UPTIME[s.communityConfidence] !== undefined);
  const slaPercent =
    rated.length > 0
      ? Math.round(rated.reduce((sum, s) => sum + CONFIDENCE_UPTIME[s.communityConfidence], 0) / rated.length)
      : null;

  return {
    fleet,
    data: {
      fleetName: fleet.name,
      inviteCode: fleet.inviteCode,
      memberCount: members.length,
      totals: {
        sessions: totals.sessions,
        kwhUsed: Math.round(totals.kwhUsed * 10) / 10,
        spend: Math.round(totals.spend * 100) / 100,
        avgTrustScore,
      },
      members: perMember.sort((a, b) => b.spend - a.spend),
      stationsUsed: usedStations.map((s) => ({ name: s.name, communityConfidence: s.communityConfidence })),
      sla: {
        uptimePercent: slaPercent,
        stationsRated: rated.length,
        stationsTotal: usedStations.length,
        guaranteeThreshold: SLA_GUARANTEE_THRESHOLD,
        meetsGuarantee: slaPercent === null ? null : slaPercent >= SLA_GUARANTEE_THRESHOLD,
      },
    },
  };
};

// ─── Owner-only: consolidated spend/usage dashboard across all members ───
export const GetFleetDashboardService = async (user_id) => {
  try {
    const { error, data } = await getOwnedFleetDashboardData(user_id);
    if (error) return { status: "fail", message: error };
    return { status: "Success", message: "Fleet dashboard.", data };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Owner-only: ask a plain-English question, answered from real fleet data ───
export const AskFleetAssistantService = async (user_id, body) => {
  try {
    const { question } = body;
    if (!question || !question.trim()) return { status: "fail", message: "Ask a question first." };

    const { error, data } = await getOwnedFleetDashboardData(user_id);
    if (error) return { status: "fail", message: error };

    const prompt = `You are a fleet operations assistant. Answer the owner's question using ONLY the JSON data below — never invent numbers that aren't there. If the data doesn't contain the answer, say so plainly. Keep the answer to 2-3 short sentences, no markdown.

Fleet data: ${JSON.stringify(data)}

Question: ${question.trim()}`;

    try {
      const answer = await askGemini(prompt);
      return { status: "Success", message: "Answered.", data: { answer: answer.trim() } };
    } catch (e) {
      return {
        status: "Success",
        message: "Answered (fallback).",
        data: {
          answer:
            "The AI assistant is temporarily unavailable, but here's what I can tell you directly: " +
            `your fleet has ${data.memberCount} driver(s), ${data.totals.sessions} completed sessions, ` +
            `$${data.totals.spend.toFixed(2)} total spend, and an average trust score of ${data.totals.avgTrustScore}.`,
        },
      };
    }
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// Matches the kWh/min charge rate assumed elsewhere in session simulation
// (see StopChargingService) — kept consistent so estimates agree app-wide.
const CHARGE_RATE_KWH_PER_MIN = 0.67;
const DEFAULT_BATTERY_CAPACITY_KWH = 40; // fallback when a driver has no vehicle on file

// ── Shared: figure out which member gets which slot(s), sized to how long
// their vehicle actually needs to charge from currentBatteryPercent to
// targetBatteryPercent — not just "the next free slot". Pure computation,
// creates NO bookings. This is the "plan" the owner reviews before approving.
const computeDepotAssignmentPlan = async ({
  station,
  date,
  windowStart,
  windowEnd,
  members,
  currentBatteryPercent = 20,
  targetBatteryPercent = 100,
}) => {
  const windowStartMin = parseTimeToMinutes(windowStart);
  const windowEndMin = parseTimeToMinutes(windowEnd);

  const candidateSlots = station.slots
    .filter((s) => isInWindow(parseTimeToMinutes(s.startTime), windowStartMin, windowEndMin))
    .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
  if (candidateSlots.length === 0) {
    return { error: "No station slots fall within that time window." };
  }

  // Slots already booked for this station/date, regardless of window.
  const existingBookings = await BookingModel.find({ stationId: station._id, date, status: { $ne: "Cancelled" } }).select("slotStart slotEnd");
  const bookedKeys = new Set(existingBookings.map((b) => `${b.slotStart}__${b.slotEnd}`));
  let availableSlots = candidateSlots.filter((s) => !bookedKeys.has(`${s.startTime}__${s.endTime}`));

  const assigned = [];
  const unassigned = [];
  const percentNeeded = Math.max(0, targetBatteryPercent - currentBatteryPercent);

  for (const member of members) {
    if (availableSlots.length === 0) {
      unassigned.push({ userId: member._id, fullName: member.fullName, email: member.email, reason: "No available slot left in window." });
      continue;
    }

    const activeVehicle = await VehicleModel.findOne({ userId: member._id, isActive: true });
    const batteryCapacityKwh = activeVehicle?.batteryCapacityKwh || DEFAULT_BATTERY_CAPACITY_KWH;
    const neededKwh = (batteryCapacityKwh * percentNeeded) / 100;
    const neededMinutes = Math.max(30, Math.ceil(neededKwh / CHARGE_RATE_KWH_PER_MIN));

    // Greedily take consecutive, genuinely back-to-back slots (from the front
    // of the sorted pool) until we've covered the needed charging time.
    const block = [availableSlots[0]];
    let blockMinutes = parseTimeToMinutes(availableSlots[0].endTime) - parseTimeToMinutes(availableSlots[0].startTime);
    let i = 1;
    while (blockMinutes < neededMinutes && i < availableSlots.length) {
      const prevEnd = parseTimeToMinutes(block[block.length - 1].endTime);
      const nextStart = parseTimeToMinutes(availableSlots[i].startTime);
      if (nextStart !== prevEnd) break; // gap — can't extend contiguously
      block.push(availableSlots[i]);
      blockMinutes += parseTimeToMinutes(availableSlots[i].endTime) - nextStart;
      i++;
    }
    availableSlots = availableSlots.slice(block.length); // consume used slots

    const achievedPercent = Math.min(
      targetBatteryPercent,
      Math.round(currentBatteryPercent + ((blockMinutes * CHARGE_RATE_KWH_PER_MIN) / batteryCapacityKwh) * 100)
    );

    const pricePerHour = station.pricePerHourValue || 0;
    const estAmt = parseFloat(((pricePerHour * blockMinutes) / 60).toFixed(2));
    const taxAmt = parseFloat(((estAmt * (station.taxPercent || 0)) / 100).toFixed(2));

    assigned.push({
      userId: member._id,
      fullName: member.fullName,
      email: member.email,
      vehicleName: activeVehicle?.name || "",
      vehiclePlate: activeVehicle?.model || "",
      vehicleImage: activeVehicle?.image || "",
      connectorType: activeVehicle?.connectorType || "Type A",
      slots: block.map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
      slotStart: block[0].startTime,
      slotEnd: block[block.length - 1].endTime,
      durationMin: blockMinutes,
      currentBatteryPercent,
      achievedPercent,
      amountEstimation: estAmt,
      tax: taxAmt,
      totalAmount: parseFloat((estAmt + taxAmt).toFixed(2)),
      stationId: station._id,
      stationName: station.name,
      stationLat: station.latitude,
      stationLng: station.longitude,
      matchScore: null,
      date,
    });
  }

  return { assigned, unassigned };
};

// ── Shared: turn an approved plan into real bookings — one booking per
// underlying station slot (even when a driver spans several), so every slot
// they occupy is correctly blocked from anyone else booking it individually.
// Assignments may span different stations (per-driver recommendations), so
// each station is looked up by the assignment's own stationId. ──
const commitDepotAssignmentPlan = async (assigned) => {
  const stationCache = new Map();
  const getStation = async (stationId) => {
    const key = stationId.toString();
    if (!stationCache.has(key)) stationCache.set(key, await NearestStationModel.findById(stationId));
    return stationCache.get(key);
  };

  const created = [];
  for (const a of assigned) {
    const station = await getStation(a.stationId);
    if (!station) continue;

    const perSlotAmount = parseFloat((a.amountEstimation / a.slots.length).toFixed(2));
    const perSlotTax = parseFloat((a.tax / a.slots.length).toFixed(2));
    const bookingIds = [];

    for (const slot of a.slots) {
      const booking = await BookingModel.create({
        userId: a.userId,
        stationId: station._id,
        stationName: station.name,
        address: station.address,
        stationImage: station.images?.[0] || "",
        vehicleName: a.vehicleName,
        vehiclePlate: a.vehiclePlate,
        vehicleImage: a.vehicleImage,
        connectorType: a.connectorType,
        energyKwh: "Depot charge",
        chargingSlot: "Depot",
        chargerType: "Fleet depot",
        date: a.date,
        time: slot.startTime,
        slotStart: slot.startTime,
        slotEnd: slot.endTime,
        chargingDuration: "30 minutes",
        amountEstimation: perSlotAmount,
        tax: perSlotTax,
        totalAmount: perSlotAmount + perSlotTax,
        isPaid: false,
        status: "Upcoming",
      });
      bookingIds.push(booking._id);
    }

    created.push({
      userId: a.userId,
      fullName: a.fullName,
      email: a.email,
      bookingId: bookingIds[0],
      bookingIds,
      stationName: station.name,
      slotStart: a.slotStart,
      slotEnd: a.slotEnd,
    });
  }
  return created;
};

// ── Shared: resolve + authorize a fleet owner's station/roster for depot scheduling ──
const resolveDepotSchedulingContext = async (user_id, stationId, memberUserIds) => {
  const user = await UserModel.findById(user_id).select("fleetId");
  if (!user?.fleetId) return { error: "You're not part of a fleet." };

  const fleet = await FleetModel.findById(user.fleetId);
  if (!fleet || fleet.ownerId.toString() !== user_id.toString()) {
    return { error: "Only the fleet owner can schedule depot charging." };
  }

  const members = await UserModel.find({ _id: { $in: memberUserIds }, fleetId: fleet._id });
  if (members.length === 0) return { error: "No valid fleet members selected." };

  const station = await NearestStationModel.findById(stationId);
  if (!station) return { error: "Station not found." };

  return { fleet, members, station };
};

const STATION_CANDIDATES_TO_TRY = 6; // how many top-ranked stations each driver is allowed to try

// Finds a contiguous block of slots within a station's cached pool covering
// this driver's charging need, consumes those slots from the pool, and
// returns the assignment — or null if this station can't fit them.
const tryAssignMemberToPool = (member, pool, currentBatteryPercent, targetBatteryPercent) => {
  if (pool.slots.length === 0) return null;

  const batteryCapacityKwh = pool.vehicleByMember?.[member._id.toString()]?.batteryCapacityKwh || DEFAULT_BATTERY_CAPACITY_KWH;
  const percentNeeded = Math.max(0, targetBatteryPercent - currentBatteryPercent);
  const neededKwh = (batteryCapacityKwh * percentNeeded) / 100;
  const neededMinutes = Math.max(30, Math.ceil(neededKwh / CHARGE_RATE_KWH_PER_MIN));

  const block = [pool.slots[0]];
  let blockMinutes = parseTimeToMinutes(pool.slots[0].endTime) - parseTimeToMinutes(pool.slots[0].startTime);
  let i = 1;
  while (blockMinutes < neededMinutes && i < pool.slots.length) {
    const prevEnd = parseTimeToMinutes(block[block.length - 1].endTime);
    const nextStart = parseTimeToMinutes(pool.slots[i].startTime);
    if (nextStart !== prevEnd) break;
    block.push(pool.slots[i]);
    blockMinutes += parseTimeToMinutes(pool.slots[i].endTime) - nextStart;
    i++;
  }
  pool.slots = pool.slots.slice(block.length);

  const achievedPercent = Math.min(
    targetBatteryPercent,
    Math.round(currentBatteryPercent + ((blockMinutes * CHARGE_RATE_KWH_PER_MIN) / batteryCapacityKwh) * 100)
  );

  const vehicle = pool.vehicleByMember?.[member._id.toString()];
  const pricePerHour = pool.station.pricePerHourValue || 0;
  const estAmt = parseFloat(((pricePerHour * blockMinutes) / 60).toFixed(2));
  const taxAmt = parseFloat(((estAmt * (pool.station.taxPercent || 0)) / 100).toFixed(2));

  return {
    userId: member._id,
    fullName: member.fullName,
    email: member.email,
    vehicleName: vehicle?.name || "",
    vehiclePlate: vehicle?.model || "",
    vehicleImage: vehicle?.image || "",
    connectorType: vehicle?.connectorType || "Type A",
    slots: block.map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
    slotStart: block[0].startTime,
    slotEnd: block[block.length - 1].endTime,
    durationMin: blockMinutes,
    currentBatteryPercent,
    achievedPercent,
    amountEstimation: estAmt,
    tax: taxAmt,
    totalAmount: parseFloat((estAmt + taxAmt).toFixed(2)),
    stationId: pool.station._id,
    stationName: pool.station.name,
    stationLat: pool.station.latitude,
    stationLng: pool.station.longitude,
    matchScore: pool.matchScore ?? null,
    date: pool.date,
  };
};

// ─── Owner-only: one-click recommendation — each driver is independently
// matched to whichever available station best fits them (not all forced to
// the same station). No manual station/date/window selection needed. ───
export const RecommendDepotPlanService = async (user_id, body) => {
  try {
    const { memberUserIds, currentBatteryPercent, targetBatteryPercent } = body || {};

    const user = await UserModel.findById(user_id).select("fleetId");
    if (!user?.fleetId) return { status: "fail", message: "You're not part of a fleet." };

    const fleet = await FleetModel.findById(user.fleetId);
    if (!fleet || fleet.ownerId.toString() !== user_id.toString()) {
      return { status: "fail", message: "Only the fleet owner can plan depot charging." };
    }

    // Default to the whole fleet roster when the caller doesn't specify one.
    const memberFilter =
      Array.isArray(memberUserIds) && memberUserIds.length > 0 ? { _id: { $in: memberUserIds }, fleetId: fleet._id } : { fleetId: fleet._id };
    const members = await UserModel.find(memberFilter);
    if (members.length === 0) return { status: "fail", message: "This fleet has no drivers to schedule yet." };

    const curPct = currentBatteryPercent != null ? Number(currentBatteryPercent) : 20;
    const tgtPct = targetBatteryPercent != null ? Number(targetBatteryPercent) : 100;

    const allStations = await NearestStationModel.find({ listingStatus: { $nin: ["pending", "rejected"] } });
    if (allStations.length === 0) return { status: "fail", message: "No stations are available to charge at." };

    // Cheap pre-ranking (price/rating/availability/community trust) — each
    // driver tries stations in this order, best first.
    const ranked = rankStationsByScore(allStations.map((s) => s.toObject())).slice(0, STATION_CANDIDATES_TO_TRY);
    const rankedStations = ranked.map((r) => allStations.find((s) => s._id.toString() === r.station._id.toString())).filter(Boolean);
    const scoreByStationId = Object.fromEntries(ranked.map((r) => [r.station._id.toString(), r.score]));

    // Lazily-built, mutable per-station slot pools shared across all drivers
    // in this run, so two drivers can't get double-booked into the same slot.
    const pools = new Map();
    const getPool = async (station) => {
      const key = station._id.toString();
      if (pools.has(key)) return pools.get(key);

      const date = station.availableDates?.[0] || generateNext7Dates()[0];
      const existingBookings = await BookingModel.find({ stationId: station._id, date, status: { $ne: "Cancelled" } }).select("slotStart slotEnd");
      const bookedKeys = new Set(existingBookings.map((b) => `${b.slotStart}__${b.slotEnd}`));
      const slots = (station.slots || [])
        .filter((s) => !bookedKeys.has(`${s.startTime}__${s.endTime}`))
        .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

      const vehicles = await VehicleModel.find({ userId: { $in: members.map((m) => m._id) }, isActive: true });
      const vehicleByMember = Object.fromEntries(vehicles.map((v) => [v.userId.toString(), v]));

      const pool = { station, date, slots, vehicleByMember, matchScore: scoreByStationId[key] ?? null };
      pools.set(key, pool);
      return pool;
    };

    const assigned = [];
    const unassigned = [];

    for (const member of members) {
      let placed = false;
      for (const station of rankedStations) {
        const pool = await getPool(station);
        const result = tryAssignMemberToPool(member, pool, curPct, tgtPct);
        if (result) {
          assigned.push(result);
          placed = true;
          break;
        }
      }
      if (!placed) {
        unassigned.push({ userId: member._id, fullName: member.fullName, email: member.email, reason: "No station had enough available charging time." });
      }
    }

    const stationsUsed = [...new Set(assigned.map((a) => a.stationName))];

    let summary = `${assigned.length} of ${members.length} driver${members.length === 1 ? "" : "s"} matched across ${stationsUsed.length} station${stationsUsed.length === 1 ? "" : "s"}. ${assigned
      .map((a) => `${a.fullName || a.email} → ${a.stationName} (${a.currentBatteryPercent}% → ${a.achievedPercent}% by ${a.slotEnd}).`)
      .join(" ")}`;
    try {
      const prompt = `A fleet manager tapped "Start planning" for overnight depot charging. We independently matched each driver to their best available station across ${rankedStations.length} candidates. Write ONE short, friendly sentence (max 35 words) summarizing the plan. Respond with ONLY strict JSON: {"summary": "<sentence>"}

Assignments: ${JSON.stringify(assigned.map((a) => ({ driver: a.fullName || a.email, station: a.stationName, from: a.currentBatteryPercent, to: a.achievedPercent, readyBy: a.slotEnd })))}
Unassigned: ${JSON.stringify(unassigned.map((u) => u.fullName || u.email))}`;
      const raw = await askGemini(prompt);
      const parsed = JSON.parse(raw.trim().replace(/^```json\s*|\s*```$/g, ""));
      if (parsed.summary) summary = parsed.summary;
    } catch (e) {
      // Gemini unavailable/quota exceeded → keep the deterministic summary.
    }

    return {
      status: "Success",
      message: summary,
      data: { assigned, unassigned, stationsConsidered: rankedStations.length },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Owner-only: preview who would be assigned where — no bookings created ───
export const PreviewDepotAssignmentService = async (user_id, body) => {
  try {
    const { stationId, date, windowStart, windowEnd, memberUserIds, currentBatteryPercent, targetBatteryPercent } = body;
    if (!stationId || !date || !windowStart || !windowEnd || !Array.isArray(memberUserIds) || memberUserIds.length === 0) {
      return { status: "fail", message: "stationId, date, windowStart, windowEnd and memberUserIds are required." };
    }

    const ctx = await resolveDepotSchedulingContext(user_id, stationId, memberUserIds);
    if (ctx.error) return { status: "fail", message: ctx.error };

    const plan = await computeDepotAssignmentPlan({
      station: ctx.station,
      date,
      windowStart,
      windowEnd,
      members: ctx.members,
      currentBatteryPercent: currentBatteryPercent != null ? Number(currentBatteryPercent) : undefined,
      targetBatteryPercent: targetBatteryPercent != null ? Number(targetBatteryPercent) : undefined,
    });
    if (plan.error) return { status: "fail", message: plan.error };

    // Deterministic summary always available; Gemini upgrades it if reachable.
    let summary = `${plan.assigned.length} of ${ctx.members.length} driver${ctx.members.length === 1 ? "" : "s"} can charge at ${ctx.station.name} in this window. ${plan.assigned
      .map((a) => `${a.fullName || a.email}: ${a.currentBatteryPercent}% → ${a.achievedPercent}% by ${a.slotEnd}.`)
      .join(" ")}`;
    try {
      const prompt = `A fleet manager is planning overnight depot charging. Write ONE short, friendly sentence (max 30 words) summarizing this plan. Respond with ONLY strict JSON: {"summary": "<sentence>"}

Plan: ${JSON.stringify(
        plan.assigned.map((a) => ({
          driver: a.fullName || a.email,
          from: a.currentBatteryPercent,
          to: a.achievedPercent,
          readyBy: a.slotEnd,
        }))
      )}
Unassigned: ${JSON.stringify(plan.unassigned.map((u) => u.fullName || u.email))}`;
      const raw = await askGemini(prompt);
      const parsed = JSON.parse(raw.trim().replace(/^```json\s*|\s*```$/g, ""));
      if (parsed.summary) summary = parsed.summary;
    } catch (e) {
      // Gemini unavailable/quota exceeded → keep the deterministic summary.
    }

    return {
      status: "Success",
      message: summary,
      data: { stationId, stationName: ctx.station.name, date, windowStart, windowEnd, assigned: plan.assigned, unassigned: plan.unassigned },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Owner-only: commit a previously-computed plan (from preview OR recommend)
// into real bookings. Works whether the plan spans one station or many, since
// each assignment already carries its own stationId/date/slots. ───
export const ApproveDepotPlanService = async (user_id, body) => {
  try {
    const { assigned } = body;
    if (!Array.isArray(assigned) || assigned.length === 0) {
      return { status: "fail", message: "No assignments to approve." };
    }

    const user = await UserModel.findById(user_id).select("fleetId");
    if (!user?.fleetId) return { status: "fail", message: "You're not part of a fleet." };

    const fleet = await FleetModel.findById(user.fleetId);
    if (!fleet || fleet.ownerId.toString() !== user_id.toString()) {
      return { status: "fail", message: "Only the fleet owner can approve depot charging." };
    }

    // Safety: every driver in the plan must actually belong to this fleet.
    const memberIds = new Set((await UserModel.find({ fleetId: fleet._id }).select("_id")).map((m) => m._id.toString()));
    const invalid = assigned.some((a) => !memberIds.has(a.userId?.toString()));
    if (invalid) return { status: "fail", message: "This plan includes a driver outside your fleet." };

    const settings = await AppSettingsModel.getSettings();
    const scheduled = await commitDepotAssignmentPlan(assigned);

    const stationsUsed = [...new Set(scheduled.map((s) => s.stationName))];
    return {
      status: "Success",
      message: `Scheduled ${scheduled.length} of ${assigned.length} driver${assigned.length === 1 ? "" : "s"} across ${stationsUsed.length} station${stationsUsed.length === 1 ? "" : "s"}.`,
      data: { currencySymbol: settings.currencySymbol, scheduled, unscheduled: [] },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Owner-only: where the fleet is actually charging right now — real
// upcoming bookings grouped by station, with live battery % overlaid for any
// driver currently mid-session (same pattern ChargePoint/Geotab use: station
// location + live SOC, not raw GPS tracking we don't have). ───
export const GetFleetChargingStationsService = async (user_id) => {
  try {
    const user = await UserModel.findById(user_id).select("fleetId");
    if (!user?.fleetId) return { status: "fail", message: "You're not part of a fleet." };

    const fleet = await FleetModel.findById(user.fleetId);
    if (!fleet || fleet.ownerId.toString() !== user_id.toString()) {
      return { status: "fail", message: "Only the fleet owner can view this." };
    }

    const members = await UserModel.find({ fleetId: fleet._id }).select("fullName email");
    const memberIds = members.map((m) => m._id);
    const memberById = Object.fromEntries(members.map((m) => [m._id.toString(), m]));

    // Real scheduled charging — not cancelled or already completed.
    const bookings = await BookingModel.find({ userId: { $in: memberIds }, status: "Upcoming" }).select(
      "userId stationId date slotStart slotEnd"
    );

    // Anyone actively plugged in right now gets their live battery % shown.
    const liveSessions = await ChargingSessionModel.find({ userId: { $in: memberIds }, status: "Charging" }).select(
      "userId batteryPercent kwhUsed"
    );
    const liveByUser = Object.fromEntries(liveSessions.map((s) => [s.userId.toString(), s]));

    const stationIds = [...new Set(bookings.map((b) => b.stationId.toString()))];
    const stations = await NearestStationModel.find({ _id: { $in: stationIds } }).select("name latitude longitude");
    const stationById = Object.fromEntries(stations.map((s) => [s._id.toString(), s]));

    const byStation = new Map();
    for (const b of bookings) {
      const station = stationById[b.stationId.toString()];
      if (!station) continue;
      const key = station._id.toString();
      if (!byStation.has(key)) {
        byStation.set(key, {
          stationId: station._id,
          stationName: station.name,
          lat: station.latitude,
          lng: station.longitude,
          drivers: [],
        });
      }
      const member = memberById[b.userId.toString()];
      const live = liveByUser[b.userId.toString()];
      byStation.get(key).drivers.push({
        userId: b.userId,
        fullName: member?.fullName || "",
        email: member?.email || "",
        date: b.date,
        slotStart: b.slotStart,
        slotEnd: b.slotEnd,
        isLive: !!live,
        batteryPercent: live?.batteryPercent ?? null,
      });
    }

    return {
      status: "Success",
      message: `${bookings.length} scheduled charge${bookings.length === 1 ? "" : "s"} across ${byStation.size} station${byStation.size === 1 ? "" : "s"}.`,
      data: { stations: Array.from(byStation.values()) },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};
