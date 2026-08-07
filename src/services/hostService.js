import NearestStationModel from "../models/NearestStationModel.js";
import { geocodeAddress, generateSlotsArray, generateNext7Dates, generateStationQR } from "../utils/stationHelpers.js";

// ─── Driver submits their own charger as a listing (goes to review) ───
export const HostCreateStationService = async (user_id, body) => {
  try {
    const { name, address, pricePerHourValue } = body;
    if (!name || !address) return { status: "fail", message: "Station name and address are required." };
    if (!pricePerHourValue || isNaN(pricePerHourValue) || pricePerHourValue <= 0) {
      return { status: "fail", message: "A valid price per hour is required." };
    }

    const geo = await geocodeAddress(address);
    if (!geo) return { status: "fail", message: "Could not locate that address. Try being more specific." };

    const station = await NearestStationModel.create({
      name,
      address: geo.formattedAddress || address,
      latitude: geo.lat,
      longitude: geo.lng,
      pricePerHourValue: Number(pricePerHourValue),
      pricePerHour: `${pricePerHourValue}$/hr`,
      slots: generateSlotsArray(8, 18, 30),
      availableDates: generateNext7Dates(),
      ownerId: user_id,
      listingStatus: "pending",
    });

    // Generate the QR now so it's ready the moment the listing is approved.
    const { qrToken, qrCode } = await generateStationQR(station._id);
    station.qrToken = qrToken;
    station.qrCode = qrCode;
    await station.save();

    return {
      status: "Success",
      message: "Your charger has been submitted for review. We'll notify you once it's live.",
      data: station,
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Driver's own submitted listings, with review status ───
export const HostGetMyStationsService = async (user_id) => {
  try {
    const stations = await NearestStationModel.find({ ownerId: user_id }).sort({ createdAt: -1 });
    return { status: "Success", message: "Your listings.", data: stations };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};
