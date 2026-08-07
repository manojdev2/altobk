import crypto from "crypto";
import QRCode from "qrcode";

const GOOGLE_API_KEY = "AIzaSyDAUhNkL--7MVKHtlFuR3acwa7ED-cIoAU";

// ── Generate a unique QR token + QR dataURL for a station ──
export const generateStationQR = async (stationId) => {
  const qrToken = crypto.randomUUID();
  const payload = JSON.stringify({ stationId: stationId.toString(), qrToken });
  const qrCode = await QRCode.toDataURL(payload, { width: 400 });
  return { qrToken, qrCode };
};

// ─── Geocode address → { lat, lng } using Google Maps ───
export const geocodeAddress = async (address) => {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "OK" && data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng, formattedAddress: data.results[0].formatted_address };
    }
    return null;
  } catch {
    return null;
  }
};

// ── Generate an array of time slots between startHour and endHour ──
export const generateSlotsArray = (startHour = 8, endHour = 18, intervalMin = 30) => {
  const formatTime = (totalMinutes) => {
    let h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const suffix = h >= 12 ? "PM" : "AM";
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")} ${suffix}`;
  };
  const slots = [];
  let cursor = startHour * 60;
  const end = endHour * 60;
  while (cursor + intervalMin <= end) {
    slots.push({ startTime: formatTime(cursor), endTime: formatTime(cursor + intervalMin), isBooked: false });
    cursor += intervalMin;
  }
  return slots;
};

// ── Generate next 7 available dates (same format as user-side) ──
export const generateNext7Dates = () => {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dd = d.getDate().toString().padStart(2, "0");
    dates.push(`${dd} ${months[d.getMonth()]}, ${days[d.getDay()]}`);
  }
  return dates;
};
