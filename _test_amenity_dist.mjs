// Test: amenities + distance
const BASE = "http://127.0.0.1:3001/api/v1";

async function main() {
  // 1. Admin login
  const loginRes = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@uvcharging.com", password: "Admin@1234" }),
  });
  const loginData = await loginRes.json();
  const token = loginData?.token;
  if (!token) { console.log("LOGIN FAILED:", loginData); return; }
  console.log("✅ Admin login OK\n");

  // 2. Get amenities list
  const amenRes = await fetch(`${BASE}/admin/stations/amenities`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const amenData = await amenRes.json();
  console.log("✅ Amenities list:", JSON.stringify(amenData.data, null, 2), "\n");

  // 3. Create station WITH amenities
  const createRes = await fetch(`${BASE}/admin/stations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: "Test Amenity Station",
      address: "Gulshan 2, Dhaka, Bangladesh",
      status: "Available",
      pricePerHour: "$12/hr",
      pricePerHourValue: 12,
      about: "Station with amenities test",
      startHour: 9,
      endHour: 17,
      intervalMin: 30,
      amenities: [
        { label: "Restaurant", icon: "restaurant" },
        { label: "Wi-Fi", icon: "wifi" },
        { label: "Maintenance", icon: "build" },
        { label: "Shop", icon: "shopping_bag" },
      ],
    }),
  });
  const createData = await createRes.json();
  console.log("✅ Station created:");
  console.log("   Name:", createData.data?.name);
  console.log("   Amenities:", JSON.stringify(createData.data?.amenities));
  console.log("   Slots count:", createData.data?.slots?.length);

  const stationId = createData.data?._id;
  if (!stationId) { console.log("❌ No station ID"); return; }

  // 4. Admin GET single station (should include amenities)
  console.log("\n--- Admin GET /admin/stations/:id ---");
  const adminDetailRes = await fetch(`${BASE}/admin/stations/${stationId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const adminDetailData = await adminDetailRes.json();
  console.log("   amenities:", JSON.stringify(adminDetailData.data?.amenities));
  console.log("   slots count:", adminDetailData.data?.slots?.length);

  // 5. Get station detail WITH user location (Mirpur 10 coords) → real driving distance + dates
  console.log("\n--- User StationDetail with distance calc ---");
  const detailRes = await fetch(`${BASE}/StationDetail/${stationId}?latitude=23.8070&longitude=90.3686`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const detailData = await detailRes.json();
  console.log("   distanceKm:", detailData.data?.distanceKm);
  console.log("   distanceText:", detailData.data?.distanceText);
  console.log("   durationMins:", detailData.data?.durationMins);
  console.log("   durationText:", detailData.data?.durationText);
  console.log("   amenities:", JSON.stringify(detailData.data?.amenities));
  console.log("   availableDates:", JSON.stringify(detailData.data?.availableDates));
  console.log("   slots count:", detailData.data?.slots?.length);
  console.log("   first 2 slots:", JSON.stringify(detailData.data?.slots?.slice(0, 2)));

  // 6. Cleanup
  const delRes = await fetch(`${BASE}/admin/stations/${stationId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const delData = await delRes.json();
  console.log("\n✅ Cleanup:", delData.message);
}

main().catch(console.error);
