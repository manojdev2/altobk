import crypto from "crypto";
import UserModel from "../models/UserModel.js";
import ProfileModel from "../models/profilemodel.js";
import VehicleModel from "../models/VehicleModel.js";
import VehicleBrandModel from "../models/VehicleBrandModel.js";
import VehicleModelItemModel from "../models/VehicleModelItemModel.js";
import SavedLocationModel from "../models/SavedLocationModel.js";
import FavouriteStationModel from "../models/FavouriteStationModel.js";
import NotificationModel from "../models/NotificationModel.js";
import NotificationInboxModel from "../models/NotificationInboxModel.js";
import ReviewModel from "../models/ReviewModel.js";
import NearestStationModel from "../models/NearestStationModel.js";
import BookingModel from "../models/BookingModel.js";
import PaymentCardModel from "../models/PaymentCardModel.js";
import ChargingSessionModel from "../models/ChargingSessionModel.js";
import { recordEmissionsForSession } from "./carbonService.js";
import AppSettingsModel from "../models/AppSettingsModel.js";
// Email/OTP verification disabled — see RegisterService, VerifyOTPService,
// ResendOTPService, ForgotPasswordService, VerifyForgotOTPService below.
// import { EmailSend } from "../utils/emailHalper.js";
// import { isEmailConfigured, DEV_EXPOSE_OTP } from "../config/config.js";
import { EncodeToken } from "../utils/tokenHelper.js";
import { askGemini } from "../utils/geminiHelper.js";
import { rankStationsByScore } from "../utils/stationScore.js";
import {
  initSSLCommerz,
  createStripePaymentIntent,
  retrieveStripePaymentIntent,
  getStripePublishableKey,
  getPaymentSettings,
} from "./paymentService.js";

const GOOGLE_API_KEY = "AIzaSyCElkUva1jaYxMwnBLXjqukwUksFm5H4L8";

// ── Helper: recalculate station rating & reviewCount after a review ────────
const updateStationRating = async (stationId) => {
  const result = await ReviewModel.aggregate([
    { $match: { stationId: stationId.toString() } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const avg   = result.length > 0 ? parseFloat(result[0].avg.toFixed(1)) : 0;
  const count = result.length > 0 ? result[0].count : 0;
  await NearestStationModel.findByIdAndUpdate(stationId, { rating: avg, reviewCount: count });
};

// ── Helper: recompute community-verified working status from real post-session reports ──
// Looks only at the most recent reports so a station that was flaky months ago
// but has since been fixed isn't penalized forever.
const RECENT_REPORTS_WINDOW = 10;
const updateStationCommunityStatus = async (stationId) => {
  const recent = await ReviewModel.find({ stationId: stationId.toString() })
    .sort({ createdAt: -1 })
    .limit(RECENT_REPORTS_WINDOW)
    .select("workingStatus createdAt");

  if (recent.length === 0) return;

  const notWorkingCount = recent.filter((r) => r.workingStatus === "not_working").length;
  const partialCount = recent.filter((r) => r.workingStatus === "partially_working").length;
  const brokenRatio = (notWorkingCount + partialCount * 0.5) / recent.length;

  let communityConfidence;
  if (brokenRatio >= 0.4) communityConfidence = "reported_broken";
  else if (brokenRatio > 0) communityConfidence = "mixed";
  else communityConfidence = "verified";

  await NearestStationModel.findByIdAndUpdate(stationId, {
    communityConfidence,
    communityReportsCount: recent.length,
    lastVerifiedAt: recent[0].createdAt,
  });
};

// ── Helper: recompute a driver's trust score from real booking outcomes ────
// A booking counts once its slot time has passed: "Completed" status means the
// driver showed up and charged; anything else at that point is a no-show.
// Needs at least 3 resolved bookings before scoring — too little history to
// judge a driver after just one or two trips.
const updateUserTrustScore = async (userId) => {
  const bookings = await BookingModel.find({ userId, status: { $ne: "Cancelled" } }).select("date slotStart status");
  const now = new Date();

  const resolvedBookings = bookings.filter((b) => {
    const slotDate = parseBookingSlotDate(b.date, b.slotStart || "12:00 AM");
    return slotDate && slotDate.getTime() < now.getTime();
  });

  const completedCount = resolvedBookings.filter((b) => b.status === "Completed").length;
  const noShowCount = resolvedBookings.length - completedCount;

  let trustTier = "new";
  let trustScore = 100;
  if (resolvedBookings.length >= 3) {
    const completionRate = completedCount / resolvedBookings.length;
    trustScore = Math.round(completionRate * 100);
    trustTier = completionRate >= 0.9 ? "trusted" : completionRate >= 0.6 ? "building" : "flagged";
  }

  await UserModel.findByIdAndUpdate(userId, {
    trustScore,
    trustTier,
    completedSessionsCount: completedCount,
    noShowCount,
  });
};

// ─── Helper: Get driving distance & duration via Google Distance Matrix API ───
const getGoogleDistance = async (originLat, originLng, destLat, destLng) => {
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&mode=driving&key=${GOOGLE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "OK" && data.rows?.[0]?.elements?.[0]?.status === "OK") {
      const el = data.rows[0].elements[0];
      return {
        distanceKm:   Math.round((el.distance.value / 1000) * 100) / 100,  // metres → km (2 decimals)
        distanceText:  el.distance.text,   // "5.2 km"
        durationMins:  Math.round(el.duration.value / 60),  // seconds → minutes
        durationText:  el.duration.text,   // "12 mins"
      };
    }
    return null;
  } catch {
    return null;
  }
};

// ─── Helper: Generate 6-digit OTP & expiry (90 seconds) ───
// Disabled along with the rest of the OTP flow — see functions below.
// const generateOTP = () => {
//   const code = Math.floor(100000 + Math.random() * 900000).toString();
//   const expiry = new Date(Date.now() + 90 * 1000); // 90 seconds
//   return { code, expiry };
// };

// ─── Helper: Hash password (simple crypto, no bcrypt needed) ───
const hashPassword = (password) =>
  crypto.createHash("sha256").update(password).digest("hex");

// ─── Helper: Get the OTP to the user ───
//
// Signup awaits delivery *before* writing the user, so an unconfigured mail
// provider does not merely skip the email — it fails registration outright with
// `connect ECONNREFUSED 127.0.0.1:587`. DEV_EXPOSE_OTP is the escape hatch for
// environments without a provider: the code comes back in the response instead.
//
// The flag is deliberately only consulted when email is unconfigured, so
// setting SMTP restores normal behaviour even if the flag is left switched on.
// const deliverOTP = async (email, code, emailSubject, emailText) => {
//   if (isEmailConfigured()) {
//     await EmailSend(email, emailText, emailSubject);
//     return { delivered: true };
//   }
//
//   if (DEV_EXPOSE_OTP) {
//     console.warn(
//       `[DEV_EXPOSE_OTP] No mail provider configured — OTP for ${email} is ${code} (expires in 90s)`
//     );
//     return { delivered: false, devOtp: code };
//   }
//
//   throw new Error(
//     "Email delivery is not configured on this server, so the verification " +
//       "code cannot be sent. Set SMTP_HOST, SMTP_USER, SMTP_PASS and " +
//       "EMAIL_FROM, or set DEV_EXPOSE_OTP=true to return the code in the " +
//       "response instead."
//   );
// };

// Keeps the `devOtp` field out of the payload entirely when email worked, so
// nothing leaks the moment SMTP is configured.
// const otpResponse = (delivery, sentMessage) => ({
//   status: "Success",
//   message: delivery.delivered
//     ? sentMessage
//     : "Email is not configured on this server — use the code in `devOtp`.",
//   ...(delivery.delivered ? {} : { devOtp: delivery.devOtp }),
// });

// ════════════════════════════════════════════════════════════
// 1. REGISTER  –  POST /api/v1/Register
// ════════════════════════════════════════════════════════════
export const RegisterService = async (req) => {
  try {
    const { fullName, phone, email, password } = req.body;

    if (!fullName || !phone || !email || !password) {
      return { status: "fail", message: "All fields are required" };
    }

    // Check if user already exists & is verified
    const existing = await UserModel.findOne({ email: email.toLowerCase() });
    if (existing && existing.isVerified) {
      return { status: "fail", message: "Email already registered. Please login." };
    }

    // OTP verification disabled — const { code, expiry } = generateOTP();

    // Send OTP email
    // const emailText = `Your OTP verification code is: ${code}. It expires in 90 seconds.`;
    // const emailSubject = "Anentaa.ev – Email Verification";
    // const delivery = await deliverOTP(email, code, emailSubject, emailText);

    // Upsert user (handles re-registration of unverified users)
    await UserModel.updateOne(
      { email: email.toLowerCase() },
      {
        $set: {
          fullName,
          phone,
          password: hashPassword(password),
          // otp: code,
          // otpExpires: expiry,
          isVerified: true,
          authProvider: "email",
        },
      },
      { upsert: true }
    );

    // return otpResponse(delivery, "OTP has been sent to your email!");
    return { status: "Success", message: "Registered successfully. Please login." };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// 2. LOGIN  –  POST /api/v1/Login
// ════════════════════════════════════════════════════════════
export const LoginService = async (req) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return { status: "fail", message: "Email and password are required" };
    }

    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      return { status: "fail", message: "User not found. Please register." };
    }

    if (!user.isVerified) {
      return { status: "fail", message: "Email not verified. Please register again." };
    }

    // Verify password
    if (user.password !== hashPassword(password)) {
      return { status: "fail", message: "Invalid password" };
    }

    // Generate JWT token
    const token = EncodeToken(email, user._id.toString());

    return {
      status: "Success",
      message: "Login successful",
      token,
      userId: user._id.toString(),
      name: user.fullName,
      email: user.email,
    };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// 3. VERIFY OTP  –  POST /api/v1/VerifyOTP
// ════════════════════════════════════════════════════════════
export const VerifyOTPService = async (req) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return { status: "fail", message: "Email and OTP are required" };
    }

    const user = await UserModel.findOne({ email: email.toLowerCase() });

    if (!user) {
      return { status: "fail", message: "User not found" };
    }

    // OTP verification disabled — skip OTP match/expiry checks.
    // if (user.otp !== otp) {
    //   return { status: "fail", message: "Invalid OTP" };
    // }
    // if (user.otpExpires && new Date() > user.otpExpires) {
    //   return { status: "fail", message: "OTP has expired. Please resend." };
    // }

    // Mark verified & clear OTP
    await UserModel.updateOne(
      { email: email.toLowerCase() },
      { $set: { otp: "0", otpExpires: null, isVerified: true } }
    );

    // Generate JWT token
    const token = EncodeToken(email, user._id.toString());

    return { status: "Success", message: "OTP verified successfully", token };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// 4. RESEND OTP  –  POST /api/v1/ResendOTP
// ════════════════════════════════════════════════════════════
export const ResendOTPService = async (req) => {
  try {
    const { email } = req.body;

    if (!email) {
      return { status: "fail", message: "Email is required" };
    }

    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      return { status: "fail", message: "User not found. Please register first." };
    }

    // OTP verification disabled — resend is a no-op.
    // const { code, expiry } = generateOTP();
    // const emailText = `Your new OTP verification code is: ${code}. It expires in 90 seconds.`;
    // const emailSubject = "Anentaa.ev – Resend OTP";
    // const delivery = await deliverOTP(email, code, emailSubject, emailText);
    // await UserModel.updateOne(
    //   { email: email.toLowerCase() },
    //   { $set: { otp: code, otpExpires: expiry } }
    // );
    // return otpResponse(delivery, "New OTP has been sent to your email!");

    return { status: "Success", message: "OTP verification is currently disabled." };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// 6. FORGOT PASSWORD  –  POST /api/v1/ForgotPassword
// ════════════════════════════════════════════════════════════
export const ForgotPasswordService = async (req) => {
  try {
    const { email } = req.body;

    if (!email) {
      return { status: "fail", message: "Email is required" };
    }

    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      return { status: "fail", message: "No account found with this email" };
    }

    if (!user.isVerified) {
      return { status: "fail", message: "Account not verified. Please register again." };
    }

    // OTP verification disabled — skip OTP generation and email sending.
    // const { code, expiry } = generateOTP();
    // const emailText = `Your password reset OTP is: ${code}. It expires in 90 seconds.`;
    // const emailSubject = "Anentaa.ev – Reset Password";
    // await EmailSend(email, emailText, emailSubject);

    await UserModel.updateOne(
      { email: email.toLowerCase() },
      // { $set: { otp: code, otpExpires: expiry, resetVerified: false } }
      { $set: { resetVerified: true } }
    );

    return { status: "Success", message: "You can now reset your password." };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// 7. VERIFY FORGOT PASSWORD OTP  –  POST /api/v1/VerifyForgotOTP
// ════════════════════════════════════════════════════════════
export const VerifyForgotOTPService = async (req) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return { status: "fail", message: "Email and OTP are required" };
    }

    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      return { status: "fail", message: "User not found" };
    }

    // OTP verification disabled — skip OTP match/expiry checks.
    // if (user.otp !== otp) {
    //   return { status: "fail", message: "Invalid OTP" };
    // }
    // if (user.otpExpires && new Date() > user.otpExpires) {
    //   return { status: "fail", message: "OTP has expired. Please resend." };
    // }

    // Mark reset as verified so user can now set a new password
    await UserModel.updateOne(
      { email: email.toLowerCase() },
      { $set: { otp: "0", otpExpires: null, resetVerified: true } }
    );

    return { status: "Success", message: "OTP verified. You can now reset your password." };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// 8. RESET PASSWORD  –  POST /api/v1/ResetPassword
// ════════════════════════════════════════════════════════════
export const ResetPasswordService = async (req) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;

    if (!email || !newPassword || !confirmPassword) {
      return { status: "fail", message: "All fields are required" };
    }

    if (newPassword !== confirmPassword) {
      return { status: "fail", message: "Passwords do not match" };
    }

    if (newPassword.length < 6) {
      return { status: "fail", message: "Password must be at least 6 characters" };
    }

    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      return { status: "fail", message: "User not found" };
    }

    if (!user.resetVerified) {
      return { status: "fail", message: "Please verify OTP first" };
    }

    await UserModel.updateOne(
      { email: email.toLowerCase() },
      { $set: { password: hashPassword(newPassword), resetVerified: false } }
    );

    return { status: "Success", message: "Password reset successfully. Please login." };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Get Profile ───────────────────────────────────────────────────────────
export const GetProfileService = async (user_id) => {
  try {
    const user = await UserModel.findById(user_id).select(
      "fullName email phone trustScore trustTier completedSessionsCount noShowCount"
    );
    if (!user) return { status: "fail", data: "User not found." };

    const [profile, sessionStats, favouriteCount] = await Promise.all([
      ProfileModel.findOne({ userId: user_id }),
      // Count completed sessions & sum kwhUsed
      ChargingSessionModel.aggregate([
        { $match: { userId: user._id, status: "Completed" } },
        { $group: { _id: null, count: { $sum: 1 }, totalKwh: { $sum: "$kwhUsed" } } },
      ]),
      // Count favourite stations
      FavouriteStationModel.countDocuments({ userId: user_id }),
    ]);

    const stats = sessionStats[0] || { count: 0, totalKwh: 0 };

    return {
      status: "Success",
      data: {
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        avatar: profile?.avatar || "",
        dateOfBirth: profile?.dateOfBirth || "",
        sessions: stats.count,
        kwhUsed: Math.round(stats.totalKwh * 10) / 10,  // 1 decimal place
        favourites: favouriteCount,
        trustScore: user.trustScore,
        trustTier: user.trustTier,
        completedSessionsCount: user.completedSessionsCount,
        noShowCount: user.noShowCount,
      },
    };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Update Profile ────────────────────────────────────────────────────────
export const UpdateProfileService = async (user_id, body) => {
  try {
    const { fullName, phone, dateOfBirth, avatar } = body;

    // Update user's name & phone in UserModel
    await UserModel.updateOne(
      { _id: user_id },
      { $set: { fullName: fullName || "", phone: phone || "" } }
    );

    // Upsert profile extras
    await ProfileModel.findOneAndUpdate(
      { userId: user_id },
      { $set: { dateOfBirth: dateOfBirth || "", avatar: avatar || "" } },
      { upsert: true, new: true }
    );

    return { status: "Success", message: "Profile updated successfully." };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Get My Vehicles ───────────────────────────────────────────────────────
export const GetVehiclesService = async (user_id) => {
  try {
    const vehicles = await VehicleModel.find({ userId: user_id }).sort({ createdAt: -1 });
    return { status: "Success", message: "Vehicle list retrieved successfully.", data: vehicles };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Toggle Vehicle Active ─────────────────────────────────────────────────
export const ToggleVehicleService = async (user_id, vehicleId) => {
  try {
    const vehicle = await VehicleModel.findOne({ _id: vehicleId, userId: user_id });
    if (!vehicle) {
      return { status: "fail", message: "Vehicle not found or access denied." };
    }

    if (!vehicle.isActive) {
      // Activating this vehicle → deactivate all others
      await VehicleModel.updateMany({ userId: user_id }, { $set: { isActive: false } });
    }

    vehicle.isActive = !vehicle.isActive;
    await vehicle.save();

    return {
      status: "Success",
      message: vehicle.isActive ? "Vehicle activated successfully." : "Vehicle disabled successfully.",
      data: vehicle,
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Get Saved Locations ───────────────────────────────────────────────────
export const GetSavedLocationsService = async (user_id) => {
  try {
    const locations = await SavedLocationModel.find({ userId: user_id }).sort({ createdAt: -1 });
    return { status: "Success", data: locations };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Get Favourite Stations ────────────────────────────────────────────────
export const GetFavouriteStationsService = async (user_id) => {
  try {
    const stations = await FavouriteStationModel.find({ userId: user_id }).sort({ createdAt: -1 });
    return { status: "Success", data: stations };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Toggle Saved Location (Save / Unsave) ─────────────────────────────────
export const ToggleSavedLocationService = async (user_id, body) => {
  try {
    const { stationId, stationName, address, image, status, latitude, longitude } = body;
    if (!stationId) return { status: "fail", data: "stationId is required." };

    const existing = await SavedLocationModel.findOne({ userId: user_id, stationId });
    if (existing) {
      await SavedLocationModel.deleteOne({ _id: existing._id });
      return { status: "Success", message: "Location removed from saved.", saved: false };
    }

    if (!stationName) return { status: "fail", data: "stationName is required to save a location." };

    await SavedLocationModel.create({
      userId: user_id,
      stationId,
      stationName,
      address:   address   ?? "",
      image:     image     ?? "",
      status:    status    ?? "Available",
      latitude:  latitude  ?? 0,
      longitude: longitude ?? 0,
    });
    return { status: "Success", message: "Location saved successfully.", saved: true };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Toggle Favourite Station (Favourite / Unfavourite) ────────────────────
export const ToggleFavouriteStationService = async (user_id, body) => {
  try {
    const { stationId, stationName, address, image, pricePerHour, status, latitude, longitude } = body;
    if (!stationId) return { status: "fail", data: "stationId is required." };

    const existing = await FavouriteStationModel.findOne({ userId: user_id, stationId });
    if (existing) {
      await FavouriteStationModel.deleteOne({ _id: existing._id });
      return { status: "Success", message: "Station removed from favourites.", favourite: false };
    }

    if (!stationName) return { status: "fail", data: "stationName is required to favourite a station." };

    await FavouriteStationModel.create({
      userId: user_id,
      stationId,
      stationName,
      address:      address      ?? "",
      image:        image        ?? "",
      pricePerHour: pricePerHour ?? "",
      status:       status       ?? "Available",
      latitude:     latitude     ?? 0,
      longitude:    longitude    ?? 0,
    });
    return { status: "Success", message: "Station added to favourites.", favourite: true };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Get Notification Settings ─────────────────────────────────────────────
export const GetNotificationsService = async (user_id) => {
  try {
    let settings = await NotificationModel.findOne({ userId: user_id });
    if (!settings) {
      settings = await NotificationModel.create({ userId: user_id });
    }
    return {
      status: "Success",
      data: {
        chargingStatusAlerts: settings.chargingStatusAlerts,
        lowBatteryAlerts: settings.lowBatteryAlerts,
        bookingUpdates: settings.bookingUpdates,
        stationUpdates: settings.stationUpdates,
        paymentAndSession: settings.paymentAndSession,
      },
    };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Update Notification Settings ──────────────────────────────────────────
export const UpdateNotificationsService = async (user_id, body) => {
  try {
    const allowedFields = [
      "chargingStatusAlerts",
      "lowBatteryAlerts",
      "bookingUpdates",
      "stationUpdates",
      "paymentAndSession",
    ];
    const updates = {};
    for (const field of allowedFields) {
      if (typeof body[field] === "boolean") {
        updates[field] = body[field];
      }
    }
    if (Object.keys(updates).length === 0) {
      return { status: "fail", data: "No valid fields provided to update." };
    }
    const settings = await NotificationModel.findOneAndUpdate(
      { userId: user_id },
      { $set: updates },
      { new: true, upsert: true }
    );
    return {
      status: "Success",
      data: {
        chargingStatusAlerts: settings.chargingStatusAlerts,
        lowBatteryAlerts: settings.lowBatteryAlerts,
        bookingUpdates: settings.bookingUpdates,
        stationUpdates: settings.stationUpdates,
        paymentAndSession: settings.paymentAndSession,
      },
    };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Get Notification Inbox (with pagination) ─────────────────────────────
export const GetNotificationInboxService = async (user_id, query = {}) => {
  try {
    const page  = Math.max(1, parseInt(query.page)  || 1);
    const limit = Math.max(1, parseInt(query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { userId: user_id };

    const [notifications, total, unreadCount] = await Promise.all([
      NotificationInboxModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      NotificationInboxModel.countDocuments(filter),
      NotificationInboxModel.countDocuments({ ...filter, isRead: false }),
    ]);

    return {
      status: "Success",
      data: {
        notifications,
        unreadCount,
        total,
        page,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Mark Single Notification as Read ──────────────────────────────────────
export const MarkNotificationReadService = async (user_id, notificationId) => {
  try {
    const notification = await NotificationInboxModel.findOneAndUpdate(
      { _id: notificationId, userId: user_id },
      { $set: { isRead: true } },
      { new: true }
    );
    if (!notification) return { status: "fail", message: "Notification not found." };
    return { status: "Success", message: "Notification marked as read.", data: notification };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Mark All Notifications as Read ────────────────────────────────────────
export const MarkAllNotificationsReadService = async (user_id) => {
  try {
    await NotificationInboxModel.updateMany(
      { userId: user_id, isRead: false },
      { $set: { isRead: true } }
    );
    return { status: "Success", message: "All notifications marked as read." };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Submit Review ─────────────────────────────────────────────────────────
export const SubmitReviewService = async (user_id, body) => {
  try {
    const { stationId, rating, description } = body;

    if (!stationId) {
      return { status: "fail", data: "Station ID is required." };
    }
    if (!rating || rating < 1 || rating > 5) {
      return { status: "fail", data: "Rating must be between 1 and 5." };
    }

    const review = await ReviewModel.create({
      userId: user_id,
      stationId,
      rating,
      description: description || "",
    });

    // Update station's average rating & reviewCount
    await updateStationRating(stationId);

    return { status: "Success", message: "Review submitted successfully.", data: review };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Delete Vehicle ────────────────────────────────────────────────────────
export const DeleteVehicleService = async (user_id, vehicleId) => {
  try {
    const vehicle = await VehicleModel.findOne({ _id: vehicleId, userId: user_id });
    if (!vehicle) {
      return { status: "fail", data: "Vehicle not found or unauthorized." };
    }
    await VehicleModel.deleteOne({ _id: vehicleId });
    return { status: "Success", message: "Vehicle deleted successfully." };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

const TRENDING_WINDOW_DAYS = 7;
const TRENDING_TOP_N = 3;

// Marks the busiest stations (by real booking volume in the last 7 days) as
// trending — top 3 by count, and only stations that actually have bookings,
// so a quiet map never shows a false "trending" badge.
const attachTrending = async (stations) => {
  if (stations.length === 0) return stations;

  const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const counts = await BookingModel.aggregate([
    { $match: { stationId: { $in: stations.map((s) => s._id) }, createdAt: { $gte: since } } },
    { $group: { _id: "$stationId", count: { $sum: 1 } } },
  ]);

  const countByStation = new Map(counts.map((c) => [c._id.toString(), c.count]));
  const trendingIds = new Set(
    [...countByStation.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TRENDING_TOP_N)
      .map(([id]) => id)
  );

  return stations.map((s) => {
    const plain = typeof s.toObject === "function" ? s.toObject() : s;
    const recentBookingsCount = countByStation.get(s._id.toString()) || 0;
    return { ...plain, recentBookingsCount, isTrending: trendingIds.has(s._id.toString()) };
  });
};

// ─── Get Nearest Stations (sorted by real distance from user location) ──────
export const GetNearestStationsService = async (userLat, userLng) => {
  try {
    // If user provided their current location → use $geoNear for real distance sort
    if (userLat != null && userLng != null) {
      const lat = parseFloat(userLat);
      const lng = parseFloat(userLng);

      if (isNaN(lat) || isNaN(lng)) {
        return { status: "fail", message: "Invalid latitude or longitude values." };
      }

      const stations = await NearestStationModel.aggregate([
        {
          $geoNear: {
            near: { type: "Point", coordinates: [lng, lat] },  // GeoJSON [lng, lat]
            distanceField: "distanceMeters",                    // calculated distance in metres
            spherical: true,
            query: { listingStatus: { $nin: ["pending", "rejected"] } },  // hide pending/rejected host listings; no value = admin-created, always shown
            // maxDistance: 50000,  // uncomment to limit to 50 km radius
          },
        },
        {
          $addFields: {
            distanceKm: { $round: [{ $divide: ["$distanceMeters", 1000] }, 2] },  // metres → km
            durationMins: {
              // rough estimate: avg 40 km/h city driving → mins = (distKm / 40) * 60
              $round: [{ $multiply: [{ $divide: [{ $divide: ["$distanceMeters", 1000] }, 40] }, 60] }, 0],
            },
          },
        },
        { $sort: { distanceMeters: 1 } },       // nearest first
      ]);

      return {
        status: "Success",
        message: "Nearest stations retrieved successfully (sorted by your location).",
        data: await attachTrending(stations),
      };
    }

    // Fallback: no location provided → return all sorted by static distanceKm
    const stations = await NearestStationModel.find({ listingStatus: { $nin: ["pending", "rejected"] } }).sort({ distanceKm: 1 });
    return {
      status: "Success",
      message: "Nearest stations retrieved successfully.",
      data: await attachTrending(stations),
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Recommend exactly one station (score-ranked shortlist + Gemini pick) ──
export const RecommendStationService = async (userLat, userLng) => {
  try {
    const lat = parseFloat(userLat);
    const lng = parseFloat(userLng);
    if (isNaN(lat) || isNaN(lng)) {
      return { status: "fail", message: "Invalid latitude or longitude values." };
    }

    const candidates = await NearestStationModel.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lng, lat] },
          distanceField: "distanceMeters",
          spherical: true,
          query: { listingStatus: { $nin: ["pending", "rejected"] } },
        },
      },
      { $addFields: { distanceKm: { $round: [{ $divide: ["$distanceMeters", 1000] }, 2] } } },
      { $sort: { distanceMeters: 1 } },
      { $limit: 15 },
    ]);

    if (candidates.length === 0) {
      return { status: "fail", message: "No stations available to recommend." };
    }

    const ranked = rankStationsByScore(candidates);
    const shortlist = ranked.slice(0, 5);
    const topPick = shortlist[0];

    // Deterministic fallback (always available, no external dependency).
    let winner = topPick.station;
    let matchScore = topPick.score;
    let reason = `Best overall match — ${topPick.breakdown.distanceScore >= 70 ? "close by" : "reasonably close"}, ${
      winner.status === "Available" ? "available now" : "currently " + winner.status.toLowerCase()
    }, rated ${winner.rating ?? "unrated"}★.`;
    let source = "algorithm";

    // Let Gemini break ties / add judgment on top of the pre-scored shortlist.
    try {
      const prompt = `You are picking the single best EV charging station for a driver right now.
Choose exactly ONE stationId from this shortlist (already ranked by a distance/availability/rating/price score, highest first):

${JSON.stringify(
  shortlist.map(({ station, score }) => ({
    stationId: station._id.toString(),
    name: station.name,
    distanceKm: station.distanceKm,
    status: station.status,
    rating: station.rating,
    pricePerHour: station.pricePerHourValue,
    matchScore: score,
  }))
)}

Respond with ONLY strict JSON: {"stationId": "<id from the list>", "reason": "<one short sentence why>"}`;

      const raw = await askGemini(prompt);
      const parsed = JSON.parse(raw.trim().replace(/^```json\s*|\s*```$/g, ""));
      const picked = shortlist.find((s) => s.station._id.toString() === parsed.stationId);

      if (picked && parsed.reason) {
        winner = picked.station;
        matchScore = picked.score;
        reason = parsed.reason;
        source = "gemini";
      }
    } catch (e) {
      // Gemini unavailable/quota exceeded/bad response → keep the algorithmic pick.
    }

    return {
      status: "Success",
      message: "Station recommended successfully.",
      data: { station: winner, matchScore, reason, source },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Get Station Detail (clicked from map pin) ─────────────────────────────
export const GetStationDetailService = async (stationId, userLat, userLng, selectedDate) => {
  try {
    if (!stationId) {
      return { status: "fail", message: "Station ID is required." };
    }
    const station = await NearestStationModel.findById(stationId);
    if (!station) {
      return { status: "fail", message: "Station not found." };
    }

    // Build response object (plain object so we can add computed fields)
    const stationObj = station.toObject();

    // Auto-generate next 7 available dates if not set
    if (!stationObj.availableDates || stationObj.availableDates.length === 0) {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const dates = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const dd = d.getDate().toString().padStart(2, "0");
        dates.push(`${dd} ${months[d.getMonth()]}, ${days[d.getDay()]}`);
      }
      stationObj.availableDates = dates;
    }

    // ── Date-wise slot availability ─────────────────────────────────
    // Use selectedDate from query param, or fall back to first available date
    const dateForSlots = selectedDate || stationObj.availableDates?.[0] || "";

    if (dateForSlots && stationObj.slots?.length > 0) {
      // Find all active (non-cancelled) bookings for this station + date
      const existingBookings = await BookingModel.find({
        stationId,
        date: dateForSlots,
        status: { $ne: "Cancelled" },
      }).select("slotStart slotEnd");

      // Build a set of booked slot keys for O(1) lookup
      const bookedSlotKeys = new Set(
        existingBookings.map((b) => `${b.slotStart}__${b.slotEnd}`)
      );

      // Mark each slot's isBooked based on actual bookings for this date
      stationObj.slots = stationObj.slots.map((slot) => ({
        ...slot,
        isBooked: bookedSlotKeys.has(`${slot.startTime}__${slot.endTime}`),
      }));
    }

    stationObj.selectedDate = dateForSlots;

    // If user provided their location, calculate real driving distance via Google
    if (userLat != null && userLng != null && station.latitude && station.longitude) {
      const dist = await getGoogleDistance(
        parseFloat(userLat), parseFloat(userLng),
        station.latitude, station.longitude
      );
      if (dist) {
        stationObj.distanceKm   = dist.distanceKm;
        stationObj.distanceText = dist.distanceText;   // "5.2 km"
        stationObj.durationMins = dist.durationMins;
        stationObj.durationText = dist.durationText;   // "12 mins"
      }
    }

    // Fetch reviews for this station (with user name)
    const reviews = await ReviewModel.find({ stationId: stationId.toString() })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("userId", "fullName");

    stationObj.reviews = reviews.map((r) => ({
      reviewId:    r._id,
      rating:      r.rating,
      description: r.description,
      userName:    r.userId?.fullName || "Anonymous",
      createdAt:   r.createdAt,
    }));
    stationObj.reviewCount = reviews.length;

    // ── Attach dynamic currency from admin settings ──
    const settings = await AppSettingsModel.getSettings();
    stationObj.currencyCode   = settings.currencyCode;
    stationObj.currencySymbol = settings.currencySymbol;
    stationObj.currencyIcon   = settings.currencyIcon;

    return {
      status: "Success",
      message: "Station detail retrieved successfully.",
      data: stationObj,
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Get Available Slots for a Station on a Specific Date ──────────────────
export const GetAvailableSlotsService = async (stationId, date) => {
  try {
    if (!stationId || !date) {
      return { status: "fail", message: "stationId and date are required." };
    }

    const station = await NearestStationModel.findById(stationId).select("name slots");
    if (!station) {
      return { status: "fail", message: "Station not found." };
    }
    if (!station.slots || station.slots.length === 0) {
      return { status: "fail", message: "No time slots configured for this station." };
    }

    // Find all active bookings for this station + date
    const existingBookings = await BookingModel.find({
      stationId,
      date,
      status: { $ne: "Cancelled" },
    }).select("slotStart slotEnd");

    const bookedSlotKeys = new Set(
      existingBookings.map((b) => `${b.slotStart}__${b.slotEnd}`)
    );

    const slots = station.slots.map((slot) => ({
      startTime: slot.startTime,
      endTime:   slot.endTime,
      isBooked:  bookedSlotKeys.has(`${slot.startTime}__${slot.endTime}`),
    }));

    const totalSlots     = slots.length;
    const bookedCount    = slots.filter((s) => s.isBooked).length;
    const availableCount = totalSlots - bookedCount;

    return {
      status: "Success",
      message: "Slots retrieved successfully.",
      data: {
        stationId,
        stationName: station.name,
        date,
        totalSlots,
        bookedCount,
        availableCount,
        allBooked: availableCount === 0,
        slots,
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Get Vehicle Brands ────────────────────────────────────────────────────
export const GetVehicleBrandsService = async () => {
  try {
    const brands = await VehicleBrandModel.find().sort({ name: 1 });
    return { status: "Success", data: brands };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Get Connector Types (static list for Set-Up Vehicle Step 3) ───────────
export const GetConnectorTypesService = async () => {
  const types = [
    { id: "CCS",               label: "CCS",               description: "Combined Charging System — DC fast charging" },
    { id: "CHAdeMO",           label: "CHAdeMO",            description: "DC fast charging standard by Japanese manufacturers" },
    { id: "Type 2",            label: "Type 2",             description: "AC charging — common in Europe" },
    { id: "Tesla Supercharger",label: "Tesla Supercharger", description: "Tesla proprietary fast charging" },
  ];
  return { status: "Success", message: "Connector types fetched.", data: types };
};

// ─── Get Vehicle Models By Brand ───────────────────────────────────────────
export const GetVehicleModelsByBrandService = async (brandId) => {
  try {
    const brand = await VehicleBrandModel.findById(brandId);
    if (!brand) return { status: "fail", data: "Brand not found." };

    const models = await VehicleModelItemModel.find({ brandId }).sort({ name: 1 });
    return { status: "Success", data: models };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Get Vehicle Model Detail ──────────────────────────────────────────────
export const GetVehicleModelDetailService = async (modelId) => {
  try {
    const model = await VehicleModelItemModel.findById(modelId).populate("brandId", "name image");
    if (!model) return { status: "fail", data: "Model not found." };

    return {
      status: "Success",
      data: {
        _id: model._id,
        modelName: model.name,
        image: model.image,
        brandName: model.brandId?.name || "",
        brandImage: model.brandId?.image || "",
      },
    };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ─── Add Vehicle ───────────────────────────────────────────────────────────
export const AddVehicleService = async (user_id, body) => {
  try {
    const { modelId, customBrand, customModel, connectorType, batteryCapacityKwh } = body;
    if (!modelId && !(customBrand && customModel)) {
      return { status: "fail", data: "Select a vehicle model, or enter your vehicle's brand and model." };
    }
    if (!connectorType) return { status: "fail", data: "Connector type is required." };
    if (!batteryCapacityKwh || isNaN(batteryCapacityKwh))
      return { status: "fail", data: "Battery capacity (kWh) is required." };

    let name, model_, image, brandImage;
    if (modelId) {
      // Catalog vehicle — looked up from the admin-curated brand/model list.
      const model = await VehicleModelItemModel.findById(modelId).populate("brandId", "name image");
      if (!model) return { status: "fail", data: "Vehicle model not found." };
      name       = model.brandId?.name || "";   // "Tesla"
      model_     = model.name;                  // "Model 3"
      image      = model.image;                 // model photo
      brandImage = model.brandId?.image || "";   // brand logo
    } else {
      // Custom vehicle — driver's car isn't in the catalog, so they typed it in.
      name       = customBrand.trim();
      model_     = customModel.trim();
      image      = "";
      brandImage = "";
    }

    // Set all other vehicles of this user to inactive
    await VehicleModel.updateMany({ userId: user_id }, { $set: { isActive: false } });

    const vehicle = await VehicleModel.create({
      userId:             user_id,
      name,
      model:              model_,
      image,
      brandImage,
      connectorType,                                   // "CCS"
      batteryCapacityKwh: parseFloat(batteryCapacityKwh),
      isActive:           true,
    });

    return {
      status: "Success",
      message: "Vehicle added successfully.",
      data: {
        _id:                vehicle._id,
        name:               vehicle.name,
        model:              vehicle.model,
        image:              vehicle.image,
        brandImage:         vehicle.brandImage,
        connectorType:      vehicle.connectorType,
        batteryCapacityKwh: vehicle.batteryCapacityKwh,
        isActive:           vehicle.isActive,
      },
    };
  } catch (e) {
    return { status: "fail", data: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// BOOKING SERVICES
// ════════════════════════════════════════════════════════════

// ─── Get Booking List ──────────────────────────────────────────────────────
export const GetBookingsService = async (user_id) => {
  try {
    const bookings = await BookingModel.find({ userId: user_id }).sort({ createdAt: -1 });

    // Load currency settings
    const settings = await AppSettingsModel.getSettings();

    const data = bookings.map((booking) => ({
      bookingId:             booking._id,
      // ── Vehicle card ──
      vehicleName:           booking.vehicleName,
      vehiclePlate:          booking.vehiclePlate,
      vehicleImage:          booking.vehicleImage,
      vehicleBrandImage:     booking.vehicleBrandImage,
      // ── Station card ──
      stationName:           booking.stationName,
      address:               booking.address,
      stationImage:          booking.stationImage,
      // ── Charger specs ──
      connectorType:         booking.connectorType,
      energyKwh:             booking.energyKwh,
      chargingSlot:          booking.chargingSlot,
      chargerType:           booking.chargerType,
      // ── Booking timing ──
      bookingDate:           booking.date,
      chargingDuration:      booking.chargingDuration,
      chargingSessionTiming: booking.time,
      slotStart:             booking.slotStart,
      slotEnd:               booking.slotEnd,
      // ── Payment summary ──
      amountEstimation:      booking.amountEstimation,
      tax:                   booking.tax,
      totalAmount:           booking.totalAmount,
      isPaid:                booking.isPaid,
      status:                booking.status,
      // ── Currency ──
      currencyCode:          settings.currencyCode,
      currencySymbol:        settings.currencySymbol,
      currencyIcon:          settings.currencyIcon,
    }));

    return {
      status: "Success",
      message: "Booking list retrieved successfully.",
      data,
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Create Booking ────────────────────────────────────────────────────────
export const CreateBookingService = async (user_id, body) => {
  try {
    const {
      stationId,
      date,           // "06 Jan, Tue"
      slotStart,      // "10:30 AM"  (selected slot startTime)
      slotEnd,        // "11:30 AM"  (selected slot endTime)
      connectorType,  // "Type A"    (from station amenity / frontend)
      energyKwh,      // "110 kw/h"  (from station)
      chargingSlot,   // "Slot A"    (label from frontend)
      chargerType,    // "CCS - 150 kW"
    } = body;

    if (!stationId || !date || !slotStart || !slotEnd) {
      return { status: "fail", message: "stationId, date, slotStart and slotEnd are required." };
    }

    // ── Fetch station ──────────────────────────────────────────────────
    const station = await NearestStationModel.findById(stationId);
    if (!station) {
      return { status: "fail", message: "Station not found." };
    }
    if (station.status === "Unavailable") {
      return { status: "fail", message: "Station is currently unavailable." };
    }

    // ── Check if the selected slot exists in this station ────────────
    const slotExists = station.slots.some(
      (s) => s.startTime === slotStart && s.endTime === slotEnd
    );
    if (!slotExists) {
      return { status: "fail", message: "Selected time slot not found in this station." };
    }

    // ── Check if the slot is already booked FOR THIS DATE ─────────────
    const conflictBooking = await BookingModel.findOne({
      stationId,
      date,
      slotStart,
      slotEnd,
      status: { $ne: "Cancelled" },   // cancelled bookings don't block the slot
    });
    if (conflictBooking) {
      return { status: "fail", message: "This time slot is already booked for the selected date. Please choose another slot." };
    }

    // ── Fetch user's active vehicle ────────────────────────────────────
    const activeVehicle = await VehicleModel.findOne({ userId: user_id, isActive: true });

    // ── Calculate charging duration from slot times ─────────────────
    const parseTime = (t) => {
      const [time, period] = t.trim().split(" ");
      let [h, m] = time.split(":").map(Number);
      if (period === "PM" && h !== 12) h += 12;
      if (period === "AM" && h === 12) h = 0;
      return h * 60 + m;
    };
    const startMins   = parseTime(slotStart);
    const endMins     = parseTime(slotEnd);
    const durationMin = endMins > startMins ? endMins - startMins : 60;
    const chargingDuration = durationMin === 60 ? "1 hour" : `${durationMin} minutes`;

    // ── Calculate amount ───────────────────────────────────────────────
    const pricePerHour   = station.pricePerHourValue || 0;
    const estAmt         = parseFloat(((pricePerHour * durationMin) / 60).toFixed(2));
    const taxPercent     = station.taxPercent || 0;
    const taxAmt         = parseFloat(((estAmt * taxPercent) / 100).toFixed(2));
    const totalAmt       = parseFloat((estAmt + taxAmt).toFixed(2));

    // ── Load currency settings ──
    const settings = await AppSettingsModel.getSettings();

    // ── Create booking ─────────────────────────────────────────────────
    const booking = await BookingModel.create({
      userId:           user_id,
      stationId,
      stationName:      station.name,
      address:          station.address,
      stationImage:     station.images?.[0] || "",
      vehicleName:      activeVehicle?.name  || "",
      vehiclePlate:     activeVehicle?.model || "",
      vehicleImage:     activeVehicle?.image || "",
      vehicleBrandImage:activeVehicle?.brandImage || "",
      connectorType:    connectorType    || "Type A",
      energyKwh:        energyKwh        || "110 kw/h",
      chargingSlot:     chargingSlot     || "Slot A",
      chargerType:      chargerType      || "CCS - 150 kW",
      date,
      time:             slotStart,
      slotStart,
      slotEnd,
      chargingDuration,
      amountEstimation: estAmt,
      tax:              taxAmt,
      totalAmount:      totalAmt,
      isPaid:           false,
      status:           "Upcoming",
    });

    // ── (Slot availability is now computed from BookingModel, no station.slots update needed) ──

    // ── Return Booking Details screen data ─────────────────────────────
    return {
      status: "Success",
      message: "Booking created successfully.",
      data: {
        bookingId:        booking._id,
        // ── Vehicle card (top green card) ──
        vehicleName:      booking.vehicleName,
        vehiclePlate:     booking.vehiclePlate,
        vehicleImage:     booking.vehicleImage,
        vehicleBrandImage:booking.vehicleBrandImage,
        // ── Station card ──
        stationName:      booking.stationName,
        address:          booking.address,
        stationImage:     booking.stationImage,
        // ── Charger specs row ──
        connectorType:    booking.connectorType,     // "Type A"    → Connector
        energyKwh:        booking.energyKwh,         // "110 kw/h"  → Energy
        chargingSlot:     booking.chargingSlot,      // "Slot A"    → Charging Slot
        chargerType:      booking.chargerType,
        // ── Booking timing ──
        bookingDate:      booking.date,              // "Fri, January 02, 2026"
        chargingDuration: booking.chargingDuration,  // "45 minutes"
        chargingSessionTiming: booking.time,         // "04:30 PM"
        slotStart:        booking.slotStart,
        slotEnd:          booking.slotEnd,
        // ── Payment summary ──
        amountEstimation: booking.amountEstimation,
        tax:              booking.tax,
        totalAmount:      booking.totalAmount,
        isPaid:           booking.isPaid,
        status:           booking.status,
        // ── Currency ──
        currencyCode:   settings.currencyCode,
        currencySymbol: settings.currencySymbol,
        currencyIcon:   settings.currencyIcon,
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Re-Booking / Reschedule ────────────────────────────────────────────────
export const ReBookingService = async (user_id, bookingId, body) => {
  try {
    const { date, time, slotStart, slotEnd } = body;

    if (!date || !time) {
      return { status: "fail", message: "date and time are required." };
    }

    const booking = await BookingModel.findOne({ _id: bookingId, userId: user_id });
    if (!booking) {
      return { status: "fail", message: "Booking not found or access denied." };
    }
    if (booking.status === "Cancelled") {
      return { status: "fail", message: "Cancelled booking cannot be rescheduled." };
    }
    if (booking.status === "Completed") {
      return { status: "fail", message: "Completed booking cannot be rescheduled." };
    }

    const newSlotStart = slotStart || booking.slotStart;
    const newSlotEnd   = slotEnd   || booking.slotEnd;
    const newDate      = date      || booking.date;

    // ── Check the new slot exists in the station ──────────────────────
    const station = await NearestStationModel.findById(booking.stationId);
    if (station) {
      const slotExists = station.slots.some(
        (s) => s.startTime === newSlotStart && s.endTime === newSlotEnd
      );
      if (!slotExists) {
        return { status: "fail", message: "Selected new time slot not found in this station." };
      }
    }

    // ── Check if the new date+slot is already booked by someone else ──
    const conflictBooking = await BookingModel.findOne({
      _id:       { $ne: bookingId },          // exclude current booking
      stationId: booking.stationId,
      date:      newDate,
      slotStart: newSlotStart,
      slotEnd:   newSlotEnd,
      status:    { $ne: "Cancelled" },
    });
    if (conflictBooking) {
      return { status: "fail", message: "The new time slot is already booked for this date. Please choose another." };
    }

    booking.date      = date;
    booking.time      = time;
    booking.slotStart = newSlotStart;
    booking.slotEnd   = newSlotEnd;
    booking.status    = "Upcoming";
    await booking.save();

    return {
      status: "Success",
      message: "Booking rescheduled successfully.",
      data: booking,
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Cancel Booking ────────────────────────────────────────────────────────
export const CancelBookingService = async (user_id, bookingId) => {
  try {
    const booking = await BookingModel.findOne({ _id: bookingId, userId: user_id });
    if (!booking) {
      return { status: "fail", message: "Booking not found or access denied." };
    }
    if (booking.status === "Cancelled") {
      return { status: "fail", message: "Booking is already cancelled." };
    }
    if (booking.status === "Completed") {
      return { status: "fail", message: "Completed booking cannot be cancelled." };
    }

    booking.status = "Cancelled";
    await booking.save();

    // ── Slot is now automatically freed because we check BookingModel ──
    // ── (status: "Cancelled" is excluded from slot availability queries) ──

    return {
      status: "Success",
      message: "Booking cancelled successfully.",
      data: booking,
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// PAYMENT SERVICES
// ════════════════════════════════════════════════════════════

// ─── Get Payment Method (Screen 2) ────────────────────────────────────────
// Returns booking summary + user's saved cards + dynamic payment settings
export const GetPaymentMethodService = async (user_id, bookingId) => {
  try {
    const booking = await BookingModel.findOne({ _id: bookingId, userId: user_id });
    if (!booking) {
      return { status: "fail", message: "Booking not found." };
    }

    const cards = await PaymentCardModel.find({ userId: user_id }).sort({ isDefault: -1, createdAt: -1 });

    // ── Load dynamic settings from DB (no cache — always fresh) ──
    const ps = await AppSettingsModel.getSettings();

    // Build available gateways — only include enabled ones
    const availableGateways = [];
    if (ps.sslcommerzEnabled) {
      availableGateways.push({ id: "sslcommerz", name: "SSLCommerz", description: "Pay via bKash, Nagad, Cards, Mobile Banking", minAmount: ps.sslMinAmount });
    }
    if (ps.stripeEnabled) {
      availableGateways.push({ id: "stripe", name: "Stripe", description: "Pay via International Cards", minAmount: ps.stripeMinAmount });
    }
    if (ps.savedCardEnabled) {
      availableGateways.push({ id: "card", name: "Saved Card", description: "Pay using a saved payment card", minAmount: 0 });
    }

    return {
      status: "Success",
      message: "Payment method retrieved successfully.",
      data: {
        // ── Booking summary ──
        bookingId:        booking._id,
        date:             booking.date,
        time:             booking.time,
        chargingDuration: booking.chargingDuration,
        amountEstimation: booking.amountEstimation,
        tax:              booking.tax,
        totalAmount:      booking.totalAmount,
        isPaid:           booking.isPaid,
        paymentStatus:    booking.paymentStatus  || "",
        paymentGateway:   booking.paymentGateway || "",
        // ── Stripe publishable key (Flutter needs this to init Stripe SDK) ──
        stripePublishableKey: ps.stripeEnabled ? await getStripePublishableKey() : "",
        // ── Currency info ──
        currencyCode:   ps.currencyCode,
        currencySymbol: ps.currencySymbol,
        currencyIcon:   ps.currencyIcon,
        // ── Available payment gateways (filtered by admin toggles) ──
        availableGateways,
        // ── Saved cards ──
        cards: cards.map((c) => ({
          cardId:    c._id,
          cardType:  c.cardType,
          cardHolder:c.cardHolder,
          last4:     c.last4,
          expiryDate:c.expiryDate,
          isDefault: c.isDefault,
        })),
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Confirm Payment (Screen 3 — Booking Successfully) ────────────────────
// body: { paymentMethod: "sslcommerz" | "stripe" | "card", cardId?, stripePaymentIntentId? }
export const ConfirmPaymentService = async (user_id, bookingId, body) => {
  try {
    const { paymentMethod, cardId, stripePaymentIntentId } = body;

    const booking = await BookingModel.findOne({ _id: bookingId, userId: user_id });
    if (!booking) {
      return { status: "fail", message: "Booking not found." };
    }
    if (booking.isPaid) {
      return { status: "fail", message: "Booking is already paid." };
    }
    if (booking.status === "Cancelled") {
      return { status: "fail", message: "Cancelled booking cannot be paid." };
    }

    const user = await UserModel.findById(user_id);
    const customerName  = user?.fullName || "Customer";
    const customerEmail = user?.email    || "";

    // Load currency settings
    const settings = await AppSettingsModel.getSettings();

    // ──────────────────────── SSLCommerz ────────────────────────
    if (paymentMethod === "sslcommerz") {
      const result = await initSSLCommerz({
        paymentType:   "booking",
        referenceId:   bookingId,
        amount:        booking.totalAmount,
        customerName,
        customerEmail,
        customerPhone: "01700000000",
        productName:   booking.stationName || "EV Charging",
      });

      if (result.status !== "Success") {
        return { status: "fail", message: result.message || "SSLCommerz init failed." };
      }

      // Save pending state
      booking.paymentGateway = "sslcommerz";
      booking.transactionId  = result.transactionId;
      booking.paymentStatus  = "pending";
      await booking.save();

      return {
        status:  "Success",
        message: "Redirecting to SSLCommerz payment gateway.",
        data: {
          bookingId:     booking._id,
          paymentMethod: "sslcommerz",
          gatewayUrl:    result.gatewayUrl,
          transactionId: result.transactionId,
          currencyCode:   settings.currencyCode,
          currencySymbol: settings.currencySymbol,
          currencyIcon:   settings.currencyIcon,
        },
      };
    }

    // ──────────────────────── Stripe ────────────────────────
    if (paymentMethod === "stripe") {
      // If Flutter already confirmed the PaymentIntent, verify it
      if (stripePaymentIntentId) {
        const pi = await retrieveStripePaymentIntent(stripePaymentIntentId);
        if (!pi) {
          return { status: "fail", message: "Could not verify Stripe payment." };
        }
        if (pi.status === "succeeded") {
          booking.isPaid                = true;
          booking.status                = "Upcoming";
          booking.paymentGateway        = "stripe";
          booking.transactionId         = pi.id;
          booking.stripePaymentIntentId = pi.id;
          booking.paymentStatus         = "paid";
          await booking.save();

          return {
            status:  "Success",
            message: "Booking Successfully",
            data: {
              bookingId:     booking._id,
              title:         "Booking Successfully",
              subtitle:      "Your Charging Spot has been Confirmed",
              date:          booking.date,
              location:      booking.address,
              time:          booking.time,
              stationName:   booking.stationName,
              totalAmount:   booking.totalAmount,
              paymentMethod: "stripe",
              currencyCode:   settings.currencyCode,
              currencySymbol: settings.currencySymbol,
              currencyIcon:   settings.currencyIcon,
            },
          };
        }
        return { status: "fail", message: `Stripe payment status: ${pi.status}` };
      }

      // Create a new PaymentIntent for client-side confirmation
      const result = await createStripePaymentIntent({
        paymentType:   "booking",
        referenceId:   bookingId,
        amount:        booking.totalAmount,
        customerEmail,
      });

      if (result.status !== "Success") {
        return { status: "fail", message: result.message || "Stripe PaymentIntent creation failed." };
      }

      booking.paymentGateway        = "stripe";
      booking.stripePaymentIntentId = result.paymentIntentId;
      booking.paymentStatus         = "pending";
      await booking.save();

      return {
        status:  "Success",
        message: "Stripe PaymentIntent created. Confirm on device.",
        data: {
          bookingId:       booking._id,
          paymentMethod:   "stripe",
          clientSecret:    result.clientSecret,
          paymentIntentId: result.paymentIntentId,
          publishableKey:  await getStripePublishableKey(),
          currencyCode:   settings.currencyCode,
          currencySymbol: settings.currencySymbol,
          currencyIcon:   settings.currencyIcon,
        },
      };
    }

    // ──────────────────────── Card (legacy / saved card) ────────────────────────
    if (cardId) {
      const card = await PaymentCardModel.findOne({ _id: cardId, userId: user_id });
      if (!card) {
        return { status: "fail", message: "Payment card not found." };
      }
      booking.paymentCardLast4 = card.last4;
    }

    booking.isPaid         = true;
    booking.status         = "Upcoming";
    booking.paymentGateway = "card";
    booking.paymentStatus  = "paid";
    await booking.save();

    return {
      status: "Success",
      message: "Booking Successfully",
      data: {
        bookingId:     booking._id,
        title:         "Booking Successfully",
        subtitle:      "Your Charging Spot has been Confirmed",
        date:          booking.date,
        location:      booking.address,
        time:          booking.time,
        stationName:   booking.stationName,
        totalAmount:   booking.totalAmount,
        paymentMethod: "card",
        currencyCode:   settings.currencyCode,
        currencySymbol: settings.currencySymbol,
        currencyIcon:   settings.currencyIcon,
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Add Payment Card ──────────────────────────────────────────────────────
export const AddPaymentCardService = async (user_id, body) => {
  try {
    const { cardHolder, cardNumber, expiryDate, cardType } = body;

    if (!cardNumber || !cardNumber.trim()) {
      return { status: "fail", message: "Card number is required." };
    }

    const last4 = cardNumber.replace(/\s/g, "").slice(-4);

    // If first card, set as default
    const cardCount = await PaymentCardModel.countDocuments({ userId: user_id });
    const isDefault = cardCount === 0;

    const card = await PaymentCardModel.create({
      userId:     user_id,
      cardHolder: cardHolder  || "",
      cardNumber: cardNumber,
      last4,
      expiryDate: expiryDate  || "",
      cardType:   cardType    || "Card",
      isDefault,
    });

    return {
      status: "Success",
      message: "Card added successfully.",
      data: {
        cardId:     card._id,
        cardType:   card.cardType,
        cardHolder: card.cardHolder,
        last4:      card.last4,
        expiryDate: card.expiryDate,
        isDefault:  card.isDefault,
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// NAVIGATION & ARRIVAL SERVICES
// ════════════════════════════════════════════════════════════

// ─── Get Navigation Data  (Screen 2 — Navigate to Station) ────────────────
// Called when user clicks "Go to Station" on booking success screen
export const GetNavigationService = async (user_id, bookingId) => {
  try {
    const booking = await BookingModel.findOne({ _id: bookingId, userId: user_id });
    if (!booking) {
      return { status: "fail", message: "Booking not found." };
    }
    if (!booking.isPaid) {
      return { status: "fail", message: "Booking is not yet paid." };
    }

    // Fetch station for lat/lng and navigation info
    const station = await NearestStationModel.findById(booking.stationId);
    if (!station) {
      return { status: "fail", message: "Station not found." };
    }

    return {
      status: "Success",
      message: "Navigation data retrieved successfully.",
      data: {
        bookingId:         booking._id,
        // ── Instruction banner (top of map) ──
        directionText:     `Go Straight towards, ${station.name}`,
        distanceBanner:    `${station.distanceKm * 1000} M`,  // e.g. "800 M"
        // ── Station pin on map ──
        stationName:       station.name,
        stationImage:      station.images?.[0] || "",
        latitude:          station.latitude,
        longitude:         station.longitude,
        // ── Bottom info bar ──
        durationMins:      station.durationMins,              // 35
        distanceKm:        station.distanceKm,                // 5.6
        arrivalTime:       booking.time,                      // "11:00 AM" (booked slot)
        // ── Booking info ──
        hasArrived:        booking.hasArrived,
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Confirm Arrival  (Screen 4 — Arrival Confirm popup) ──────────────────
// Called when user's car reaches the station on the map
export const ConfirmArrivalService = async (user_id, bookingId, body = {}) => {
  try {
    const booking = await BookingModel.findOne({ _id: bookingId, userId: user_id });
    if (!booking) {
      return { status: "fail", message: "Booking not found." };
    }
    if (!booking.isPaid) {
      return { status: "fail", message: "Booking is not yet paid." };
    }
    if (booking.hasArrived) {
      return { status: "fail", message: "Arrival already confirmed." };
    }

    const station = await NearestStationModel.findById(booking.stationId);

    // ── 20-metre proximity check ───────────────────────────────────────
    const { latitude: userLat, longitude: userLng } = body;
    if (userLat !== undefined && userLng !== undefined && station) {
      const stationLat = station.latitude;
      const stationLng = station.longitude;

      // Haversine formula — returns distance in metres
      const toRad = (deg) => (deg * Math.PI) / 180;
      const R = 6371000; // Earth radius in metres
      const dLat = toRad(stationLat - userLat);
      const dLng = toRad(stationLng - userLng);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(userLat)) * Math.cos(toRad(stationLat)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const distanceMetres = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      if (distanceMetres > 20) {
        return {
          status: "fail",
          message: `You are ${Math.round(distanceMetres)} metres away from the station. Please move within 20 metres to confirm arrival.`,
        };
      }
    }

    booking.hasArrived = true;
    await booking.save();

    return {
      status: "Success",
      message: "Arrival confirmed successfully.",
      data: {
        bookingId:     booking._id,
        // ── Arrival Confirm popup ──
        popupTitle:    "Arrival Confirm",
        arrivalStatus: "Confirmed",
        stationName:   station?.name    || booking.stationName,
        description:   "You've arrived at the charging station. Plug in your vehicle to start charging.",
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// REAL-TIME LOCATION SERVICES
// ════════════════════════════════════════════════════════════

// ─── PUT /Bookings/:id/location  — Mobile pushes car location every few seconds ──
export const UpdateUserLocationService = async (user_id, bookingId, body) => {
  try {
    const { latitude, longitude } = body;

    if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
      return { status: "fail", message: "latitude and longitude are required." };
    }

    const booking = await BookingModel.findOne({ _id: bookingId, userId: user_id });
    if (!booking) {
      return { status: "fail", message: "Booking not found." };
    }
    if (!booking.isPaid) {
      return { status: "fail", message: "Booking is not yet paid." };
    }

    // Fetch station for distance & ETA calculation
    const station = await NearestStationModel.findById(booking.stationId);

    booking.userLat        = parseFloat(latitude);
    booking.userLng        = parseFloat(longitude);
    booking.lastLocationAt = new Date();
    await booking.save();

    // ── Haversine distance (metres) ──
    let distanceM   = null;
    let durationMin = null;
    let eta         = null;
    if (station && station.latitude && station.longitude) {
      const R   = 6371000; // Earth radius in metres
      const lat1 = booking.userLat  * Math.PI / 180;
      const lat2 = station.latitude * Math.PI / 180;
      const dLat = (station.latitude  - booking.userLat)  * Math.PI / 180;
      const dLng = (station.longitude - booking.userLng) * Math.PI / 180;
      const a   = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      distanceM   = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
      durationMin = Math.max(1, Math.round(distanceM / 500)); // ~30 km/h city speed → 500 m/min

      // Arrival time = now + durationMin
      const arrivalDate = new Date(Date.now() + durationMin * 60000);
      eta = arrivalDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    }

    return {
      status: "Success",
      message: "Location updated.",
      data: {
        bookingId:        booking._id,
        userLat:          booking.userLat,
        userLng:          booking.userLng,
        lastLocationAt:   booking.lastLocationAt,
        // ── Computed from Haversine ──
        distanceM,          // e.g. 800
        distanceBanner:     distanceM !== null
                              ? distanceM >= 1000
                                ? `${(distanceM / 1000).toFixed(1)} KM`
                                : `${distanceM} M`
                              : null,
        durationMins:       durationMin,
        eta,                // "11:00 AM"
        // ── Station pin for map ──
        stationLat:         station?.latitude  || null,
        stationLng:         station?.longitude || null,
        stationName:        station?.name      || booking.stationName,
        stationImage:       station?.images?.[0] || booking.stationImage || "",
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── GET /Bookings/:id/location  — Read latest car location (polling) ─────
export const GetUserLocationService = async (user_id, bookingId) => {
  try {
    const booking = await BookingModel.findOne({ _id: bookingId, userId: user_id });
    if (!booking) {
      return { status: "fail", message: "Booking not found." };
    }

    const station = await NearestStationModel.findById(booking.stationId);

    return {
      status: "Success",
      message: "Location fetched.",
      data: {
        bookingId:      booking._id,
        userLat:        booking.userLat,
        userLng:        booking.userLng,
        lastLocationAt: booking.lastLocationAt,
        hasArrived:     booking.hasArrived,
        stationLat:     station?.latitude  || null,
        stationLng:     station?.longitude || null,
        stationName:    station?.name      || booking.stationName,
        stationImage:   station?.images?.[0] || booking.stationImage || "",
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// CHARGING SESSION SERVICES
// ════════════════════════════════════════════════════════════

// ── Helper: parse booking date + slotStart into a JS Date ──────────────────
// date  → "Fri, January 02, 2026"  |  slotStart → "10:30 AM"
const parseBookingSlotDate = (dateStr, timeStr) => {
  // Remove leading day name ("Fri, ") if present
  const cleaned = dateStr.replace(/^[A-Za-z]+,\s*/, "");  // "January 02, 2026"
  const slotDate = new Date(`${cleaned} ${timeStr}`);
  return isNaN(slotDate.getTime()) ? null : slotDate;
};

// ── Helper: check if now is within 5 minutes before slotStart ──────────────
// Returns null if OK, or an error response object if too early
const checkTooEarly = (booking) => {
  const slotDate = parseBookingSlotDate(booking.date, booking.slotStart);
  if (!slotDate) return null;  // can't parse → skip check

  const now = new Date();
  const diffMs = slotDate.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMs > 5 * 60 * 1000) {
    // More than 5 minutes early
    return {
      status: "fail",
      message: `Too early! Your slot starts at ${booking.slotStart} on ${booking.date}. You can start ${diffMins} minute(s) before. Please come back at the right time.`,
      data: {
        tooEarly: true,
        slotStart: booking.slotStart,
        bookingDate: booking.date,
        minutesUntilSlot: diffMins,
      },
    };
  }
  return null; // OK — within 5-minute window or slot already started
};

// ─── Validate QR Code (after Flutter scans the station QR) ─────────────────
export const ValidateQRService = async (user_id, body) => {
  try {
    const { stationId, qrToken } = body;
    if (!stationId || !qrToken) {
      return { status: "fail", message: "stationId and qrToken are required." };
    }

    // 1. Validate QR belongs to this station
    const station = await NearestStationModel.findById(stationId);
    if (!station) return { status: "fail", message: "Station not found." };
    if (station.qrToken !== qrToken) {
      return { status: "fail", message: "Invalid QR code. This QR does not belong to the station." };
    }

    // 2. Find the user's active booking for this station (paid + arrived + upcoming)
    const booking = await BookingModel.findOne({
      userId: user_id,
      stationId,
      isPaid: true,
      hasArrived: true,
      status: "Upcoming",
    }).sort({ createdAt: -1 });

    if (!booking) {
      return { status: "fail", message: "No active booking found for this station. Please book a slot first." };
    }

    // 3. Find or create session
    let session = await ChargingSessionModel.findOne({ bookingId: booking._id, userId: user_id });
    if (!session) {
      session = await ChargingSessionModel.create({
        bookingId:        booking._id,
        userId:           user_id,
        stationId:        booking.stationId,
        stationName:      booking.stationName,
        address:          booking.address,
        stationImage:     booking.stationImage,
        slotLabel:        booking.chargingSlot   || "Slot A",
        connectorType:    booking.connectorType  || "Type A",
        chargingDuration: booking.chargingDuration || "60 Min",
        sessionTime:      booking.time            || "",
        status:           "NotStarted",
      });
    }

    return {
      status: "Success",
      message: "QR code validated. Ready to start charging.",
      data: {
        sessionId:        session._id,
        bookingId:        booking._id,
        stationName:      session.stationName,
        address:          session.address,
        stationImage:     session.stationImage,
        slotLabel:        session.slotLabel,
        connectorType:    session.connectorType,
        chargingDuration: session.chargingDuration,
        sessionTime:      session.sessionTime,
        status:           session.status,
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Screen 1: GET /ChargingStation/:bookingId ────────────────────────────
// "In Charging Station" screen — "View Details" from Arrival Confirm popup
export const GetChargingStationService = async (user_id, bookingId) => {
  try {
    const booking = await BookingModel.findOne({ _id: bookingId, userId: user_id });
    if (!booking) return { status: "fail", message: "Booking not found." };
    if (!booking.isPaid)  return { status: "fail", message: "Booking is not yet paid." };
    if (!booking.hasArrived) return { status: "fail", message: "Arrival not confirmed yet." };

    // ── 5-minute early check ──
    const earlyCheck = checkTooEarly(booking);
    if (earlyCheck) return earlyCheck;

    // Create session doc if not already created
    let session = await ChargingSessionModel.findOne({ bookingId, userId: user_id });
    if (!session) {
      session = await ChargingSessionModel.create({
        bookingId:       booking._id,
        userId:          user_id,
        stationId:       booking.stationId,
        stationName:     booking.stationName,
        address:         booking.address,
        stationImage:    booking.stationImage,
        slotLabel:       booking.chargingSlot   || "Slot A",
        connectorType:   booking.connectorType  || "Type A",
        chargingDuration:booking.chargingDuration || "60 Min",
        sessionTime:     booking.time            || "",
        status:          "NotStarted",
      });
    }

    return {
      status: "Success",
      message: "Charging station info fetched.",
      data: {
        sessionId:        session._id,
        bookingId:        booking._id,
        // ── Header ──
        stationName:      session.stationName,
        address:          session.address,
        stationImage:     session.stationImage,
        // ── Info cards ──
        slotLabel:        session.slotLabel,        // "Slot A"
        connectorType:    session.connectorType,     // "Type A"
        chargingDuration: session.chargingDuration,  // "60 Min"
        sessionTime:      session.sessionTime,       // "3:30 PM"
        // ── Session state ──
        status:           session.status,            // "NotStarted"
        canScan:          session.status === "NotStarted",
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Screen 2: POST /ChargingSession/:id/start ───────────────────────────
// "Charging Started Successfully" popup — user presses "Start Charging"
// id = sessionId (from QR scan response or GetChargingStation)
export const StartChargingService = async (user_id, sessionId) => {
  try {
    const session = await ChargingSessionModel.findOne({ _id: sessionId, userId: user_id });
    if (!session) return { status: "fail", message: "Session not found." };
    if (session.status === "Charging")   return { status: "fail", message: "Charging already started." };
    if (session.status === "Stopped" || session.status === "Completed")
      return { status: "fail", message: "Session already ended." };

    // ── 5-minute early check ──
    const booking = await BookingModel.findOne({ _id: session.bookingId, userId: user_id });
    if (booking) {
      const earlyCheck = checkTooEarly(booking);
      if (earlyCheck) return earlyCheck;
    }

    // Parse chargingDuration → milliseconds for countdown (e.g. "60 Min" → 3600000)
    const durationMatch = session.chargingDuration.match(/(\d+)/);
    const durationMins  = durationMatch ? parseInt(durationMatch[1]) : 60;
    const durationMs    = durationMins * 60 * 1000;

    session.status        = "Charging";
    session.startedAt     = new Date();
    session.timeRemainingMs = durationMs;
    await session.save();

    // Fetch station for costPerKwh
    const station = await NearestStationModel.findById(session.stationId);
    const costPerKwh = station?.pricePerHourValue || 0.75;
    session.costPerKwh = costPerKwh;
    await session.save();

    return {
      status:  "Success",
      message: "Charging started successfully.",
      data: {
        sessionId:          session._id,
        bookingId:          session.bookingId,
        // ── "Charging Started Successfully" popup ──
        popupTitle:         "Charging Started Successfully",
        batteryPercent:     session.batteryPercent,   // 85
        kwhUsedSoFar:       session.kwhUsed,          // 25.4
        confirmMessage:     `Your car is ${session.batteryPercent}% charged and has used ${session.kwhUsed} kwh so far.`,
        // ── Live data ──
        chargingDuration:   session.chargingDuration,
        timeRemainingMs:    session.timeRemainingMs,
        startedAt:          session.startedAt,
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Screen 3: GET /ChargingSession/:id/status ───────────────────────────
// "Charging" live screen — shows 45%, 00:18:30, Stop / Extend buttons
export const GetChargingStatusService = async (user_id, sessionId) => {
  try {
    const session = await ChargingSessionModel.findOne({ _id: sessionId, userId: user_id });
    if (!session) return { status: "fail", message: "Session not found." };

    // Recalculate timeRemaining if Charging
    let timeRemainingMs = session.timeRemainingMs;
    if (session.status === "Charging" && session.startedAt) {
      const elapsed = Date.now() - new Date(session.startedAt).getTime();
      timeRemainingMs = Math.max(0, session.timeRemainingMs - elapsed);

      // Recalculate elapsed minutes → kwhUsed + batteryPercent estimate
      const elapsedMins  = elapsed / 60000;
      const kwhPerMin    = (session.costPerKwh || 0.75) / 60 * 40; // ~40kWh charger
      const newKwh       = parseFloat((session.kwhUsed + elapsedMins * kwhPerMin).toFixed(1));
      const newBattery   = Math.min(100, session.batteryPercent + Math.round(elapsedMins * 0.5));

      session.kwhUsed        = newKwh;
      session.batteryPercent = newBattery;
      session.timeRemainingMs = timeRemainingMs;
      await session.save();
    }

    // Format 00:18:30
    const totalSecs = Math.floor(timeRemainingMs / 1000);
    const hh = String(Math.floor(totalSecs / 3600)).padStart(2, "0");
    const mm = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, "0");
    const ss = String(totalSecs % 60).padStart(2, "0");
    const timeRemaining = `${hh}:${mm}:${ss}`;

    return {
      status:  "Success",
      message: "Charging status fetched.",
      data: {
        sessionId:      session._id,
        bookingId:      session.bookingId,
        // ── Live display ──
        chargingStatus: session.status,          // "Charging"
        batteryPercent: session.batteryPercent,  // 45
        timeRemaining,                           // "00:18:30"
        kwhUsed:        session.kwhUsed,         // 25.4
        // ── Buttons ──
        canStop:   session.status === "Charging",
        canExtend: session.status === "Charging",
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Screen 4: POST /ChargingSession/:id/stop ────────────────────────────
// "Stop Charging?" confirm popup → user presses "Stop Charging"
export const StopChargingService = async (user_id, sessionId) => {
  try {
    const session = await ChargingSessionModel.findOne({ _id: sessionId, userId: user_id });
    if (!session) return { status: "fail", message: "Session not found." };
    if (session.status !== "Charging") return { status: "fail", message: "Session is not currently charging." };

    const now          = new Date();
    const elapsedMins  = (now - new Date(session.startedAt)) / 60000;
    const kwhDelivered = parseFloat((session.kwhUsed + (elapsedMins * 0.67)).toFixed(1));
    const costPerKwh   = session.costPerKwh || 0.75;

    // Extend session total cost
    const extendCharge = session.extensions.reduce((sum, e) => sum + (e.estimatedCost || 0), 0);
    const totalAmount  = parseFloat((kwhDelivered * costPerKwh + extendCharge).toFixed(2));

    const hasExtensions = extendCharge > 0;

    // If no extensions → directly Completed (booking already paid)
    // If extensions → Stopped (needs extension payment via /pay)
    session.status           = hasExtensions ? "Stopped" : "Completed";
    session.stoppedAt        = now;
    session.energyDelivered  = kwhDelivered;
    session.extendSessionCharge = extendCharge;
    session.totalAmount      = totalAmount;
    await session.save();
    if (session.status === "Completed") await recordEmissionsForSession(session);

    // Mark booking as Completed in both cases
    await BookingModel.findByIdAndUpdate(session.bookingId, { status: "Completed" });
    await updateUserTrustScore(user_id);

    // Load currency settings
    const settings = await AppSettingsModel.getSettings();

    return {
      status:  "Success",
      message: hasExtensions
        ? "Charging stopped. Please pay extension charges to complete."
        : "Charging stopped. Booking confirmed.",
      data: {
        sessionId:    session._id,
        bookingId:    session.bookingId,
        // ── "Charging Stopped" screen ──
        popupTitle:   "Charging Stopped",
        subTitle:     hasExtensions
          ? "Please complete extension payment."
          : "Your booking is confirmed!",
        // ── Summary breakdown ──
        energyDelivered:    kwhDelivered,    // 25.4 kwh
        costPerKwh:         costPerKwh,      // $0.75
        extendSessionCharge:extendCharge,    // $175
        totalAmount:        totalAmount,     // $455
        // ── Currency ──
        currencyCode:   settings.currencyCode,
        currencySymbol: settings.currencySymbol,
        currencyIcon:   settings.currencyIcon,
        // ── Flutter decides which button to show ──
        needsPayment:       hasExtensions,   // true → "Proceed to Pay"  |  false → "Confirm"
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Screen 5: POST /ChargingSession/:id/extend ──────────────────────────
// "Extend Session" bottom-sheet — user picks 10/20/30/50 Min
export const ExtendSessionService = async (user_id, sessionId, body) => {
  try {
    const { extendMins } = body;  // 10 | 20 | 30 | 50

    if (!extendMins) return { status: "fail", message: "extendMins is required." };

    const session = await ChargingSessionModel.findOne({ _id: sessionId, userId: user_id });
    if (!session) return { status: "fail", message: "Session not found." };
    if (session.status !== "Charging") return { status: "fail", message: "Session is not currently charging." };

    // Cost estimate: $40 per extra 10 min (matches UI: 10→$40, 20→$70, 30→$100, 50→$120)
    const costMap = { 10: 40, 20: 70, 30: 100, 50: 120 };
    const estimatedCost = costMap[extendMins] || Math.round((extendMins / 10) * 40);

    // Add time to remaining
    const addedMs = extendMins * 60 * 1000;
    session.timeRemainingMs += addedMs;
    session.extensions.push({ extendMins, estimatedCost });
    await session.save();

    // Load currency settings
    const settings = await AppSettingsModel.getSettings();

    return {
      status:  "Success",
      message: `Session extended by ${extendMins} minutes.`,
      data: {
        sessionId:       session._id,
        extendMins,
        estimatedCost,
        newTimeRemainingMs: session.timeRemainingMs,
        // ── Currency ──
        currencyCode:   settings.currencyCode,
        currencySymbol: settings.currencySymbol,
        currencyIcon:   settings.currencyIcon,
        // Options list (for UI to render radio buttons)
        options: [
          { label: "Extend For 10 Min", mins: 10, cost: 40  },
          { label: "Extend For 20 Min", mins: 20, cost: 70  },
          { label: "Extend For 30 Min", mins: 30, cost: 100 },
          { label: "Extend For 50 Min", mins: 50, cost: 120 },
        ],
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── Screen 6: GET /ChargingSession/:id/summary ──────────────────────────
// "Charging Stopped" summary + "Proceed to Pay" button data
export const GetChargingSummaryService = async (user_id, sessionId) => {
  try {
    const session = await ChargingSessionModel.findOne({ _id: sessionId, userId: user_id });
    if (!session) return { status: "fail", message: "Session not found." };
    if (session.status === "NotStarted" || session.status === "Charging")
      return { status: "fail", message: "Session has not ended yet." };

    const needsPayment = session.status === "Stopped" && session.extendSessionCharge > 0;

    // Load currency settings
    const settings = await AppSettingsModel.getSettings();

    return {
      status:  "Success",
      message: "Charging summary fetched.",
      data: {
        sessionId:      session._id,
        bookingId:      session.bookingId,
        // ── "Charging Stopped" heading ──
        heading:        "Charging Stopped",
        subHeading:     needsPayment
          ? "Please complete extension payment."
          : "Your booking is confirmed!",
        // ── Summary rows ──
        energyDelivered:     session.energyDelivered,
        costPerKwh:          session.costPerKwh,
        extendSessionCharge: session.extendSessionCharge,
        totalAmount:         session.totalAmount,
        // ── Currency ──
        currencyCode:   settings.currencyCode,
        currencySymbol: settings.currencySymbol,
        currencyIcon:   settings.currencyIcon,
        // ── CTA ──
        needsPayment,
        // ── Review prompt (after payment is done) ──
        showReviewPrompt: session.status === "Completed",
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ─── POST /ChargingSession/:id/pay — Pay extension charges ───────────────
// "Proceed to Pay" button on Charging Stopped screen (only when extensions exist)
// body: { paymentMethod: "sslcommerz" | "stripe" | "card", stripePaymentIntentId? }
export const PayChargingSessionService = async (user_id, sessionId, body = {}) => {
  try {
    const { paymentMethod, stripePaymentIntentId } = body;

    const session = await ChargingSessionModel.findOne({ _id: sessionId, userId: user_id });
    if (!session) return { status: "fail", message: "Session not found." };

    if (session.status === "Completed") {
      return { status: "fail", message: "Payment already completed." };
    }
    if (session.status !== "Stopped") {
      return { status: "fail", message: "Session must be stopped before payment." };
    }
    if (session.extendSessionCharge <= 0) {
      return { status: "fail", message: "No extension charges to pay." };
    }

    const user = await UserModel.findById(user_id);
    const customerName  = user?.fullName || "Customer";
    const customerEmail = user?.email    || "";

    // Load currency settings
    const settings = await AppSettingsModel.getSettings();

    // ──────────────────────── SSLCommerz ────────────────────────
    if (paymentMethod === "sslcommerz") {
      const result = await initSSLCommerz({
        paymentType:   "session",
        referenceId:   sessionId,
        amount:        session.extendSessionCharge,
        customerName,
        customerEmail,
        customerPhone: "01700000000",
        productName:   session.stationName || "EV Extension",
      });

      if (result.status !== "Success") {
        return { status: "fail", message: result.message || "SSLCommerz init failed." };
      }

      session.paymentGateway         = "sslcommerz";
      session.extensionTransactionId = result.transactionId;
      session.extensionPaymentStatus = "pending";
      await session.save();

      return {
        status:  "Success",
        message: "Redirecting to SSLCommerz for extension payment.",
        data: {
          sessionId:     session._id,
          paymentMethod: "sslcommerz",
          gatewayUrl:    result.gatewayUrl,
          transactionId: result.transactionId,
          currencyCode:   settings.currencyCode,
          currencySymbol: settings.currencySymbol,
          currencyIcon:   settings.currencyIcon,
        },
      };
    }

    // ──────────────────────── Stripe ────────────────────────
    if (paymentMethod === "stripe") {
      // If Flutter already confirmed, verify the PaymentIntent
      if (stripePaymentIntentId) {
        const pi = await retrieveStripePaymentIntent(stripePaymentIntentId);
        if (!pi) {
          return { status: "fail", message: "Could not verify Stripe payment." };
        }
        if (pi.status === "succeeded") {
          session.status                 = "Completed";
          session.paymentGateway         = "stripe";
          session.extensionTransactionId = pi.id;
          session.stripePaymentIntentId  = pi.id;
          session.extensionPaymentStatus = "paid";
          await session.save();
          await recordEmissionsForSession(session);

          return {
            status:  "Success",
            message: "Extension payment completed. Charging session confirmed!",
            data: {
              sessionId:        session._id,
              bookingId:        session.bookingId,
              extensionPaid:    session.extendSessionCharge,
              totalAmount:      session.totalAmount,
              status:           session.status,
              paymentMethod:    "stripe",
              showReviewPrompt: true,
              currencyCode:   settings.currencyCode,
              currencySymbol: settings.currencySymbol,
              currencyIcon:   settings.currencyIcon,
            },
          };
        }
        return { status: "fail", message: `Stripe payment status: ${pi.status}` };
      }

      // Create a new PaymentIntent
      const result = await createStripePaymentIntent({
        paymentType:   "session",
        referenceId:   sessionId,
        amount:        session.extendSessionCharge,
        customerEmail,
      });

      if (result.status !== "Success") {
        return { status: "fail", message: result.message || "Stripe PaymentIntent creation failed." };
      }

      session.paymentGateway        = "stripe";
      session.stripePaymentIntentId = result.paymentIntentId;
      session.extensionPaymentStatus = "pending";
      await session.save();

      return {
        status:  "Success",
        message: "Stripe PaymentIntent created. Confirm on device.",
        data: {
          sessionId:       session._id,
          paymentMethod:   "stripe",
          clientSecret:    result.clientSecret,
          paymentIntentId: result.paymentIntentId,
          publishableKey:  await getStripePublishableKey(),
          currencyCode:   settings.currencyCode,
          currencySymbol: settings.currencySymbol,
          currencyIcon:   settings.currencyIcon,
        },
      };
    }

    // ──────────────────────── Card (legacy / default) ────────────────────────
    session.status                 = "Completed";
    session.paymentGateway         = "card";
    session.extensionPaymentStatus = "paid";
    await session.save();
    await recordEmissionsForSession(session);

    return {
      status: "Success",
      message: "Extension payment completed. Charging session confirmed!",
      data: {
        sessionId:           session._id,
        bookingId:           session.bookingId,
        extensionPaid:       session.extendSessionCharge,
        totalAmount:         session.totalAmount,
        status:              session.status,
        paymentMethod:       "card",
        showReviewPrompt:    true,
        currencyCode:   settings.currencyCode,
        currencySymbol: settings.currencySymbol,
        currencyIcon:   settings.currencyIcon,
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// SUBMIT CHARGING REVIEW SERVICE
// ════════════════════════════════════════════════════════════

// ─── POST /ChargingSession/:id/review ────────────────────────────────────
// "Give Review" bottom-sheet after Proceed to Pay
// stationId is resolved automatically from session — user only sends rating + description
export const SubmitChargingReviewService = async (user_id, sessionId, body) => {
  try {
    const { rating, description, workingStatus } = body;

    if (!rating || rating < 1 || rating > 5) {
      return { status: "fail", message: "Rating must be between 1 and 5." };
    }
    if (workingStatus && !["working", "partially_working", "not_working"].includes(workingStatus)) {
      return { status: "fail", message: "Invalid working status." };
    }

    const session = await ChargingSessionModel.findOne({ _id: sessionId, userId: user_id });
    if (!session) return { status: "fail", message: "Session not found." };
    if (session.status === "NotStarted" || session.status === "Charging") {
      return { status: "fail", message: "Session has not ended yet." };
    }

    // Prevent duplicate review for same session
    const existing = await ReviewModel.findOne({ sessionId });
    if (existing) return { status: "fail", message: "Review already submitted for this session." };

    const review = await ReviewModel.create({
      userId:      user_id,
      stationId:   session.stationId,
      sessionId:   session._id,
      bookingId:   session.bookingId,
      rating,
      description: description || "",
      workingStatus: workingStatus || "working",
    });

    // Update station's average rating & community-verified working status
    await updateStationRating(session.stationId);
    await updateStationCommunityStatus(session.stationId);

    return {
      status:  "Success",
      message: "Review submitted successfully.",
      data: {
        reviewId:    review._id,
        sessionId:   session._id,
        bookingId:   session.bookingId,
        stationName: session.stationName,
        rating:      review.rating,
        description: review.description,
        workingStatus: review.workingStatus,
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};

// ════════════════════════════════════════════════════════════
// PUBLIC APP SETTINGS  (no auth — Flutter calls at startup)
// ════════════════════════════════════════════════════════════

export const GetAppSettingsService = async () => {
  try {
    const s = await AppSettingsModel.getSettings();

    // Build available gateways list — only include enabled ones
    const gateways = [];
    if (s.sslcommerzEnabled) {
      gateways.push({
        id:          "sslcommerz",
        name:        "SSLCommerz",
        description: "Pay via bKash, Nagad, Cards, Mobile Banking",
        minAmount:   s.sslMinAmount,
      });
    }
    if (s.stripeEnabled) {
      gateways.push({
        id:          "stripe",
        name:        "Stripe",
        description: "Pay via International Cards",
        minAmount:   s.stripeMinAmount,
      });
    }
    if (s.savedCardEnabled) {
      gateways.push({
        id:          "card",
        name:        "Saved Card",
        description: "Pay using a saved payment card",
        minAmount:   0,
      });
    }

    return {
      status: "Success",
      message: "App settings retrieved.",
      data: {
        // Gateway toggles
        stripeEnabled:     s.stripeEnabled,
        sslcommerzEnabled: s.sslcommerzEnabled,
        savedCardEnabled:  s.savedCardEnabled,

        // Stripe publishable key only (Flutter needs this for SDK init — NO secret keys!)
        stripePublishableKey: s.stripeEnabled ? await getStripePublishableKey() : "",

        // SSLCommerz — only expose sandbox/live flag (NO store_id / password to client!)
        sslIsLive: s.sslIsLive,

        // Currency
        currencyCode:   s.currencyCode,
        currencySymbol: s.currencySymbol,
        currencyIcon:   s.currencyIcon,

        // Min amounts
        sslMinAmount:    s.sslMinAmount,
        stripeMinAmount: s.stripeMinAmount,

        // Available gateways (filtered by enabled)
        availableGateways: gateways,
      },
    };
  } catch (e) {
    return { status: "fail", message: e.toString() };
  }
};