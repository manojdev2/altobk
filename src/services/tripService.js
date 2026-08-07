import NearestStationModel from "../models/NearestStationModel.js";
import { askGemini } from "../utils/geminiHelper.js";
import { rankStationsByScore } from "../utils/stationScore.js";
import { findNearestGoogleCharger } from "../utils/googlePlacesHelper.js";

const EARTH_RADIUS_KM = 6371;
const SAFETY_MARGIN = 0.85; // never plan to run the battery below this fraction of current range
const SEARCH_RADIUS_KM = 25; // how far off the straight-line path a station can be and still count
const MAX_STOPS = 5;

const toRad = (deg) => (deg * Math.PI) / 180;

const haversineKm = (a, b) => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
};

// Linear interpolation between two points — a straight-line approximation of
// the route, not real road routing (no Directions API dependency).
const interpolate = (a, b, fraction) => ({
  lat: a.lat + (b.lat - a.lat) * fraction,
  lng: a.lng + (b.lng - a.lng) * fraction,
});

// Finds the best charging stop near a waypoint: prefers a real bookable
// AuraCharge station, and falls back to a real-world charger from Google
// Places when no bookable station is within range (so trip planning still
// works outside areas the admin has populated).
const findBestStopNear = async (point, excludeIds) => {
  const candidates = await NearestStationModel.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [point.lng, point.lat] },
        distanceField: "distanceMeters",
        spherical: true,
        maxDistance: SEARCH_RADIUS_KM * 1000,
        query: { _id: { $nin: excludeIds }, listingStatus: { $nin: ["pending", "rejected"] } },
      },
    },
    { $addFields: { distanceKm: { $round: [{ $divide: ["$distanceMeters", 1000] }, 2] } } },
    { $limit: 10 },
  ]);

  if (candidates.length > 0) {
    const best = rankStationsByScore(candidates)[0].station;
    return {
      stop: {
        source: "app",
        bookable: true,
        stationId: best._id.toString(),
        name: best.name,
        address: best.address,
        latitude: best.latitude,
        longitude: best.longitude,
        rating: best.rating,
        status: best.status,
        pricePerHour: best.pricePerHour,
      },
      excludeId: best._id,
    };
  }

  const google = await findNearestGoogleCharger(point.lat, point.lng, SEARCH_RADIUS_KM * 1000);
  if (!google) return null;
  return {
    stop: {
      source: "google",
      bookable: false,
      stationId: null,
      name: google.name,
      address: google.address,
      latitude: google.latitude,
      longitude: google.longitude,
      rating: google.rating,
      status: null,
      pricePerHour: null,
    },
    excludeId: null,
  };
};

export const PlanTripService = async (originLat, originLng, destLat, destLng, currentRangeKm) => {
  try {
    const origin = { lat: parseFloat(originLat), lng: parseFloat(originLng) };
    const destination = { lat: parseFloat(destLat), lng: parseFloat(destLng) };
    const rangeKm = parseFloat(currentRangeKm);

    if ([origin.lat, origin.lng, destination.lat, destination.lng, rangeKm].some((n) => isNaN(n))) {
      return { status: "fail", message: "Invalid origin, destination, or range values." };
    }
    if (rangeKm <= 0) {
      return { status: "fail", message: "Current range must be greater than 0." };
    }

    const totalDistanceKm = Math.round(haversineKm(origin, destination) * 10) / 10;
    const usableRangeKm = rangeKm * SAFETY_MARGIN;

    if (totalDistanceKm <= usableRangeKm) {
      return {
        status: "Success",
        message: "You can make this trip on your current charge.",
        data: { totalDistanceKm, directRoute: true, stops: [], summary: `Your ${totalDistanceKm} km trip is within your ${rangeKm} km range — no charging stop needed.` },
      };
    }

    const stops = [];
    const excludeIds = [];
    let legStart = origin;
    let distanceCovered = 0;

    while (stops.length < MAX_STOPS) {
      const remainingTripKm = totalDistanceKm - distanceCovered;
      if (remainingTripKm <= usableRangeKm) break;

      const fraction = Math.min(1, usableRangeKm / haversineKm(legStart, destination));
      const waypoint = interpolate(legStart, destination, fraction);

      const found = await findBestStopNear(waypoint, excludeIds);
      if (!found) {
        return {
          status: "fail",
          message: `No charging stations found within ${SEARCH_RADIUS_KM} km of the route near stop ${stops.length + 1}. Try a higher starting range or a different destination.`,
        };
      }

      const legDistanceKm = Math.round(haversineKm(legStart, { lat: found.stop.latitude, lng: found.stop.longitude }) * 10) / 10;
      stops.push({ ...found.stop, distanceFromPrevKm: legDistanceKm, order: stops.length + 1 });
      if (found.excludeId) excludeIds.push(found.excludeId);
      distanceCovered += legDistanceKm;
      legStart = { lat: found.stop.latitude, lng: found.stop.longitude };
    }

    if (stops.length >= MAX_STOPS && totalDistanceKm - distanceCovered > usableRangeKm) {
      return { status: "fail", message: "Could not plan a route within the maximum number of stops." };
    }

    // Deterministic summary (always available); Gemini upgrades it if reachable.
    let summary = `Your ${totalDistanceKm} km trip needs ${stops.length} charging stop${stops.length > 1 ? "s" : ""}. ${stops
      .map((s) =>
        s.bookable
          ? `Stop ${s.order}: ${s.name} (${s.distanceFromPrevKm} km in, ${s.status.toLowerCase()}, ${s.pricePerHour}).`
          : `Stop ${s.order}: ${s.name} (${s.distanceFromPrevKm} km in, real-world charger via Google, not bookable in-app).`
      )
      .join(" ")}`;

    try {
      const prompt = `A driver is planning a ${totalDistanceKm} km EV trip with ${rangeKm} km of current range. Write ONE short, friendly sentence (max 30 words) summarizing this charging plan. Respond with ONLY strict JSON: {"summary": "<sentence>"}

Stops in order: ${JSON.stringify(
        stops.map((s) => ({
          order: s.order,
          name: s.name,
          distanceFromPrevKm: s.distanceFromPrevKm,
          bookable: s.bookable,
          status: s.status,
          rating: s.rating,
          pricePerHour: s.pricePerHour,
        }))
      )}`;

      const raw = await askGemini(prompt);
      const parsed = JSON.parse(raw.trim().replace(/^```json\s*|\s*```$/g, ""));
      if (parsed.summary) summary = parsed.summary;
    } catch (e) {
      // Gemini unavailable/quota exceeded → keep the deterministic summary.
    }

    return {
      status: "Success",
      message: "Trip planned successfully.",
      data: { totalDistanceKm, directRoute: false, stops, summary },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};
