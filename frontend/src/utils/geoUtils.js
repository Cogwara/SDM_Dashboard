/**
 * Geographic utility helpers for SDM Dashboard Telecom Map
 */

// Haversine distance calculator in KM
export function haversineKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 999999;
  const numLat1 = Number(lat1);
  const numLon1 = Number(lon1);
  const numLat2 = Number(lat2);
  const numLon2 = Number(lon2);
  if (isNaN(numLat1) || isNaN(numLon1) || isNaN(numLat2) || isNaN(numLon2)) return 999999;

  const R = 6371; // Earth radius in km
  const dLat = (numLat2 - numLat1) * (Math.PI / 180);
  const dLon = (numLon2 - numLon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(numLat1 * (Math.PI / 180)) * Math.cos(numLat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Friendly human-readable distance formatter
export function formatDistance(distKm) {
  if (distKm == null || isNaN(distKm) || distKm >= 999999) return 'N/A';
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m`;
  }
  return `${distKm.toFixed(2)} km`;
}

// Calculate bearing and cardinal compass direction
export function calculateBearing(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return { degrees: 0, cardinal: 'N', arrow: '↑' };
  }
  const toRad = deg => (deg * Math.PI) / 180;
  const toDeg = rad => (rad * 180) / Math.PI;

  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;

  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  const idx = Math.round(brng / 45) % 8;

  return {
    degrees: Math.round(brng),
    cardinal: directions[idx],
    arrow: arrows[idx]
  };
}

// Robust coordinate parser supporting Decimal, DMS, Labeled, Brackets
export function parseCoordinates(query) {
  if (!query || typeof query !== 'string') return null;
  const q = query.trim();

  // 1. Labeled format: lat: 9.0765, lng: 7.3986 or latitude: 9.0765, longitude: 7.3986
  const labeled = q.match(/(?:lat(?:itude)?\s*[:=]?\s*([+-]?\d+(?:\.\d+)?))\s*[,;\s]\s*(?:l(?:ng|on|ongitude)?\s*[:=]?\s*([+-]?\d+(?:\.\d+)?))/i);
  if (labeled) {
    const lat = parseFloat(labeled[1]);
    const lng = parseFloat(labeled[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // 2. DMS: 9°4'35.4"N 7°23'55.0"E
  const dmsMatches = [...q.matchAll(/([0-9.]+)\s*°\s*([0-9.]+)?\s*['′]?\s*([0-9.]+)?\s*["″]?\s*([NSEW])/gi)];
  if (dmsMatches.length === 2) {
    try {
      const parseDmsPart = (m) => {
        const deg = parseFloat(m[1]) || 0;
        const min = parseFloat(m[2]) || 0;
        const sec = parseFloat(m[3]) || 0;
        const dir = m[4].toUpperCase();
        let dec = deg + min / 60 + sec / 3600;
        if (dir === 'S' || dir === 'W') dec = -dec;
        return { dec, dir };
      };
      const p1 = parseDmsPart(dmsMatches[0]);
      const p2 = parseDmsPart(dmsMatches[1]);
      let lat, lng;
      if (['N', 'S'].includes(p1.dir) && ['E', 'W'].includes(p2.dir)) {
        lat = p1.dec;
        lng = p2.dec;
      } else if (['E', 'W'].includes(p1.dir) && ['N', 'S'].includes(p2.dir)) {
        lng = p1.dec;
        lat = p2.dec;
      } else {
        lat = p1.dec;
        lng = p2.dec;
      }
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    } catch (e) {}
  }

  // 3. Simple decimal: '9.0765, 7.3986' or '9.0765 7.3986' or '[9.0765, 7.3986]'
  const cleanQ = q.replace(/[()[\]{}]/g, '').trim();
  const simpleMatch = cleanQ.match(/^([+-]?\d+(?:\.\d+)?)\s*[,;\s/]\s*([+-]?\d+(?:\.\d+)?)$/);
  if (simpleMatch) {
    const lat = parseFloat(simpleMatch[1]);
    const lng = parseFloat(simpleMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

// Fast test to check if query might be coordinates
export function isLikelyCoordinate(query) {
  if (!query || typeof query !== 'string') return false;
  const q = query.trim();
  return /^[+-]?\d/.test(q) || /lat/i.test(q) || /°/.test(q);
}
