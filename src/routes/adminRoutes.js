import express from "express";
import { AdminAuth } from "../middlewares/adminAuth.js";
import { uploadImages } from "../middlewares/upload.js";
import {
  AdminLogin,
  AdminSeed,
  AdminDashboard,
  AdminGetBrands,
  AdminCreateBrand,
  AdminUpdateBrand,
  AdminDeleteBrand,
  AdminGetModels,
  AdminCreateModel,
  AdminUpdateModel,
  AdminDeleteModel,
  AdminGetStations,
  AdminGetStation,
  AdminCreateStation,
  AdminUpdateStation,
  AdminDeleteStation,
  AdminGenerateSlots,
  AdminGetAmenitiesList,
  AdminRegenerateQR,
  PublicGetStationQR,
  AdminGetUsers,
  AdminDeleteUser,
  AdminGetBookings,
  AdminGetReviews,
  AdminGetSettings,
  AdminUpdateSettings,
} from "../controllers/adminController.js";

const router = express.Router();

// â”€â”€ Public â”€â”€
router.post("/admin/login", AdminLogin);
router.post("/admin/seed",  AdminSeed);   // run once to create first admin

// â”€â”€ Protected (all below require admin JWT) â”€â”€
router.get("/admin/dashboard", AdminAuth, AdminDashboard);

// Brands
router.get   ("/admin/brands",      AdminAuth, AdminGetBrands);
router.post  ("/admin/brands",      AdminAuth, AdminCreateBrand);
router.put   ("/admin/brands/:id",  AdminAuth, AdminUpdateBrand);
router.delete("/admin/brands/:id",  AdminAuth, AdminDeleteBrand);

// Models
router.get   ("/admin/models",      AdminAuth, AdminGetModels);     // ?brandId= optional
router.post  ("/admin/models",      AdminAuth, AdminCreateModel);
router.put   ("/admin/models/:id",  AdminAuth, AdminUpdateModel);
router.delete("/admin/models/:id",  AdminAuth, AdminDeleteModel);

// Stations (with optional image upload)
router.get   ("/admin/stations",      AdminAuth, AdminGetStations);
router.get   ("/admin/stations/amenities", AdminAuth, AdminGetAmenitiesList);  // predefined amenity options
router.post  ("/admin/stations",      AdminAuth, uploadImages, AdminCreateStation);
router.get   ("/admin/stations/:id",  AdminAuth, AdminGetStation); // get single station (includes amenities)
router.put   ("/admin/stations/:id",  AdminAuth, uploadImages, AdminUpdateStation);
router.delete("/admin/stations/:id",  AdminAuth, AdminDeleteStation);
router.post  ("/admin/stations/:id/slots", AdminAuth, AdminGenerateSlots);  // Auto-generate time slots
router.post  ("/admin/stations/:id/qr",    AdminAuth, AdminRegenerateQR);   // Regenerate QR code

// Users
router.get   ("/admin/users",      AdminAuth, AdminGetUsers);
router.delete("/admin/users/:id",  AdminAuth, AdminDeleteUser);

// Bookings & Reviews (read-only)
router.get("/admin/bookings", AdminAuth, AdminGetBookings);
router.get("/admin/reviews",  AdminAuth, AdminGetReviews);

// App Settings (payment keys, currency, gateway toggles)
router.get("/admin/settings", AdminAuth, AdminGetSettings);
router.put("/admin/settings", AdminAuth, AdminUpdateSettings);

// Public (no auth) — for QR display page
router.get("/public/stations/:id/qr", PublicGetStationQR);

export default router;

