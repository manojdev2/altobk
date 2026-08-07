// Generic 0-100 "match score" for a station, usable anywhere a ranked
// recommendation is needed (AI recommender, plain sort, UI match badge, etc).
//
// Weights: distance 35%, availability 25%, rating 25%, price 15%.
const WEIGHTS = { distance: 0.35, availability: 0.25, rating: 0.25, price: 0.15 };
const MAX_DISTANCE_KM = 20;   // beyond this, distance score bottoms out at 0
const MAX_PRICE_PER_HOUR = 20; // beyond this, price score bottoms out at 0

const AVAILABILITY_SCORE = { Available: 100, Busy: 50, Unavailable: 0 };

// Real driver reports from completed charging sessions override the admin's
// static status — a station marked "Available" that drivers keep reporting
// as broken should never win a recommendation.
const COMMUNITY_MULTIPLIER = {
  reported_broken: 0.15,
  mixed: 0.7,
  verified: 1.1,
  unknown: 1,
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export const computeStationScore = (station, { distanceKm } = {}) => {
  const distance = distanceKm ?? station.distanceKm ?? MAX_DISTANCE_KM;
  const distanceScore = clamp(100 - (distance / MAX_DISTANCE_KM) * 100, 0, 100);

  const availabilityScore = AVAILABILITY_SCORE[station.status] ?? 0;

  const ratingScore = clamp(((station.rating ?? 0) / 5) * 100, 0, 100);

  const price = station.pricePerHourValue ?? 0;
  const priceScore = clamp(100 - (price / MAX_PRICE_PER_HOUR) * 100, 0, 100);

  const baseScore =
    distanceScore * WEIGHTS.distance +
    availabilityScore * WEIGHTS.availability +
    ratingScore * WEIGHTS.rating +
    priceScore * WEIGHTS.price;

  const communityMultiplier = COMMUNITY_MULTIPLIER[station.communityConfidence] ?? 1;
  const score = clamp(baseScore * communityMultiplier, 0, 100);

  return {
    score: Math.round(score),
    breakdown: {
      distanceScore: Math.round(distanceScore),
      availabilityScore: Math.round(availabilityScore),
      ratingScore: Math.round(ratingScore),
      priceScore: Math.round(priceScore),
      communityMultiplier,
    },
  };
};

// Ranks a list of stations by computeStationScore, highest first.
export const rankStationsByScore = (stations) =>
  stations
    .map((station) => ({ station, ...computeStationScore(station) }))
    .sort((a, b) => b.score - a.score);
