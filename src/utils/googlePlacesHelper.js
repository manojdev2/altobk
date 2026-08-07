// Server-side Google Places lookup for real-world EV chargers, used as a
// fallback when no bookable station exists near a trip waypoint.
const GOOGLE_PLACES_API_KEY = "AIzaSyDAUhNkL--7MVKHtlFuR3acwa7ED-cIoAU";

export const findNearestGoogleCharger = async (lat, lng, radiusMeters = 30000) => {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&type=electric_vehicle_charging_station&key=${GOOGLE_PLACES_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) return null;

    // Nearby Search doesn't sort by distance — pick the closest result ourselves.
    const toRad = (d) => (d * Math.PI) / 180;
    const distanceKm = (a, b) => {
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * 6371 * Math.asin(Math.sqrt(s));
    };

    const ranked = data.results
      .filter((r) => r.geometry?.location)
      .map((r) => ({ place: r, distanceKm: distanceKm({ lat, lng }, r.geometry.location) }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const nearest = ranked[0];
    if (!nearest) return null;

    return {
      name: nearest.place.name,
      address: nearest.place.vicinity || "",
      latitude: nearest.place.geometry.location.lat,
      longitude: nearest.place.geometry.location.lng,
      rating: nearest.place.rating ?? null,
      distanceKm: Math.round(nearest.distanceKm * 10) / 10,
    };
  } catch (e) {
    return null;
  }
};
