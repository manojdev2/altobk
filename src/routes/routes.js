
import express from "express";
import {
  Register, Login, VerifyOTP, ResendOTP,
  ForgotPassword, VerifyForgotOTP, ResetPassword, UserLgout,
  GetProfile, UpdateProfile,
  GetVehicles, GetSavedLocations, GetFavouriteStations,
  ToggleSavedLocation, ToggleFavouriteStation,
  GetNotifications, GetNotificationInbox,
  MarkNotificationRead, MarkAllNotificationsRead,
  UpdateNotifications,
  SubmitReview,
  DeleteVehicle,
  ToggleVehicle,
  GetNearestStations,
  RecommendStation,
  PlanTrip,
  HostCreateStation,
  HostGetMyStations,
  CreateFleet,
  JoinFleet,
  GetMyFleet,
  GetFleetDashboard,
  RecommendDepotPlan,
  ApproveDepotPlan,
  GetFleetChargingStations,
  PreviewDepotAssignment,
  AskFleetAssistant,
  GetFleetEmissionsSummary,
  ExportFleetEmissionsReport,
  GetStationDetail,
  GetAvailableSlots,
  GetVehicleBrands,
  GetVehicleModelsByBrand,
  GetVehicleModelDetail,
  GetConnectorTypes,
  AddVehicle,
  GetBookings,
  CreateBooking,
  ReBooking,
  CancelBooking,
  GetPaymentMethod,
  ConfirmPayment,
  AddPaymentCard,
  StripeCreateIntent,
  SSLCommerzInitiate,
  StripeVerifyPayment,
  GetPaymentMethods,
  GetNavigation,
  ConfirmArrival,
  UpdateUserLocation,
  GetUserLocation,
  GetChargingStation,
  ValidateQR,
  StartCharging,
  GetChargingStatus,
  StopCharging,
  ExtendSession,
  GetChargingSummary,
  PayChargingSession,
  SubmitChargingReview,
  GetAppSettings,
} from "../controllers/usercontroller.js";
import { AuthVerification } from "../middlewares/authverification.js";

const router = express.Router();

// Auth Routes (Public)
router.post("/Register", Register);
router.post("/Login", Login);
router.post("/VerifyOTP", VerifyOTP);
router.post("/ResendOTP", ResendOTP);
router.post("/ForgotPassword", ForgotPassword);
router.post("/VerifyForgotOTP", VerifyForgotOTP);
router.post("/ResetPassword", ResetPassword);
router.get("/UserLogout", UserLgout);

// App Settings (Public — no auth; Flutter calls at startup)
router.get("/app/settings", GetAppSettings);

// Profile Routes (Protected)
router.get("/Profile", AuthVerification, GetProfile);
router.put("/UpdateProfile", AuthVerification, UpdateProfile);

// Vehicle, Location, Favourite, Notification (Protected)
router.get("/MyVehicles", AuthVerification, GetVehicles);
router.post("/MyVehicles", AuthVerification, AddVehicle);
router.delete("/MyVehicles/:id", AuthVerification, DeleteVehicle);
router.put("/MyVehicles/:id/toggle", AuthVerification, ToggleVehicle);
router.get("/SavedLocations", AuthVerification, GetSavedLocations);
router.post("/SavedLocations/toggle", AuthVerification, ToggleSavedLocation);
router.get("/FavouriteStations", AuthVerification, GetFavouriteStations);
router.post("/FavouriteStations/toggle", AuthVerification, ToggleFavouriteStation);
router.get("/Notifications", AuthVerification, GetNotifications);
router.patch("/Notifications", AuthVerification, UpdateNotifications);
router.get("/NotificationInbox", AuthVerification, GetNotificationInbox);
router.put("/notifications/all/read", AuthVerification, MarkAllNotificationsRead);   // must be before :id
router.put("/notifications/:id/read", AuthVerification, MarkNotificationRead);

// Review (Protected)
router.post("/SubmitReview", AuthVerification, SubmitReview);

// Nearest Stations & Station Detail (Protected)
router.get("/NearestStations", AuthVerification, GetNearestStations);
router.get("/RecommendStation", AuthVerification, RecommendStation);
router.post("/PlanTrip", AuthVerification, PlanTrip);

// Host self-serve station listings (Protected)
router.post("/HostStations", AuthVerification, HostCreateStation);
router.get("/HostStations/mine", AuthVerification, HostGetMyStations);

// Commercial fleet accounts (Protected)
router.post("/Fleets", AuthVerification, CreateFleet);
router.post("/Fleets/join", AuthVerification, JoinFleet);
router.get("/Fleets/mine", AuthVerification, GetMyFleet);
router.get("/Fleets/dashboard", AuthVerification, GetFleetDashboard);
router.post("/Fleets/depot-schedule/preview", AuthVerification, PreviewDepotAssignment);
router.post("/Fleets/depot-schedule/recommend", AuthVerification, RecommendDepotPlan);
router.post("/Fleets/depot-schedule/approve", AuthVerification, ApproveDepotPlan);
router.post("/Fleets/ask", AuthVerification, AskFleetAssistant);
router.get("/Fleets/charging-stations", AuthVerification, GetFleetChargingStations);
router.get("/Fleets/emissions/summary", AuthVerification, GetFleetEmissionsSummary);
router.get("/Fleets/emissions/export", AuthVerification, ExportFleetEmissionsReport);
router.get("/StationDetail/:id", AuthVerification, GetStationDetail);
router.get("/StationDetails/:id", AuthVerification, GetStationDetail);  // alias (Flutter uses plural)
router.get("/Stations/:id/slots", AuthVerification, GetAvailableSlots); // date-wise slot availability

// Vehicle Brand & Model (Protected)
router.get("/VehicleBrands", AuthVerification, GetVehicleBrands);
router.get("/VehicleModels/:brandId", AuthVerification, GetVehicleModelsByBrand);
router.get("/VehicleModelDetail/:modelId", AuthVerification, GetVehicleModelDetail);
router.get("/ConnectorTypes", AuthVerification, GetConnectorTypes);

// Booking (Protected)
router.get("/Bookings", AuthVerification, GetBookings);
router.post("/Bookings", AuthVerification, CreateBooking);
router.put("/Bookings/:id/reschedule", AuthVerification, ReBooking);
router.put("/Bookings/:id/cancel", AuthVerification, CancelBooking);

// Payment (Protected)
router.get("/Bookings/:id/payment", AuthVerification, GetPaymentMethod);
router.post("/Bookings/:id/payment", AuthVerification, ConfirmPayment);
router.post("/PaymentCards", AuthVerification, AddPaymentCard);

// Payment — Flutter convenience endpoints (Protected)
router.post("/payment/stripe/create-intent",  AuthVerification, StripeCreateIntent);
router.post("/payment/stripe/verify",          AuthVerification, StripeVerifyPayment);
router.post("/payment/sslcommerz/initiate",    AuthVerification, SSLCommerzInitiate);
router.get("/payment-methods",                 AuthVerification, GetPaymentMethods);

// Navigation & Arrival (Protected)
router.get("/Bookings/:id/navigate", AuthVerification, GetNavigation);
router.post("/Bookings/:id/arrive", AuthVerification, ConfirmArrival);

// Real-time Car Location during Navigation (Protected)
router.put("/Bookings/:id/location", AuthVerification, UpdateUserLocation);
router.get("/Bookings/:id/location", AuthVerification, GetUserLocation);

// Charging Session (Protected)
router.get("/ChargingStation/:bookingId",       AuthVerification, GetChargingStation);   // Screen 1: In Charging Station
router.post("/ChargingSession/validate-qr",     AuthVerification, ValidateQR);           // QR Scan → validate & return session
router.post("/ChargingSession/:id/start",       AuthVerification, StartCharging);        // Screen 2: Start Charging → popup
router.get("/ChargingSession/:id/status",       AuthVerification, GetChargingStatus);    // Screen 3: Live 45% / 00:18:30
router.post("/ChargingSession/:id/stop",        AuthVerification, StopCharging);         // Screen 4: Stop Charging
router.post("/ChargingSession/:id/extend",      AuthVerification, ExtendSession);        // Screen 5: Extend Session
router.get("/ChargingSession/:id/summary",      AuthVerification, GetChargingSummary);   // Screen 6: Charging Stopped summary
router.post("/ChargingSession/:id/pay",         AuthVerification, PayChargingSession);   // Screen 7: Proceed to Pay (extension charges)
router.post("/ChargingSession/:id/review",      AuthVerification, SubmitChargingReview); // Give Review after Proceed to Pay

export default router;
