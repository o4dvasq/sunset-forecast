// Great-circle geometry. Pure functions, no DOM, no network.

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

function normalizeLon(lonDeg) {
  return ((lonDeg + 540) % 360) - 180;
}

// Point reached by travelling distanceKm from (lat, lon) along bearingDeg
// (compass bearing, 0 = north, 90 = east).
export function destinationPoint(lat, lon, bearingDeg, distanceKm) {
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);
  const brg = toRad(bearingDeg);
  const ang = distanceKm / EARTH_RADIUS_KM;

  const sinLat2 = Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(brg);
  const lat2 = Math.asin(sinLat2);
  const y = Math.sin(brg) * Math.sin(ang) * Math.cos(lat1);
  const x = Math.cos(ang) - Math.sin(lat1) * sinLat2;
  const lon2 = lon1 + Math.atan2(y, x);

  return { lat: toDeg(lat2), lon: normalizeLon(toDeg(lon2)) };
}

// Haversine distance in km.
export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// Sample points along a bearing at each of the given distances.
export function samplePoints(lat, lon, bearingDeg, distancesKm) {
  return distancesKm.map((d) => ({ distance_km: d, ...destinationPoint(lat, lon, bearingDeg, d) }));
}
