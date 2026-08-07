import {
  AdminLoginService,
  AdminDashboardService,
  AdminGetBrandsService,
  AdminCreateBrandService,
  AdminUpdateBrandService,
  AdminDeleteBrandService,
  AdminGetModelsService,
  AdminCreateModelService,
  AdminUpdateModelService,
  AdminDeleteModelService,
  AdminGetStationsService,
  AdminGetStationService,
  AdminCreateStationService,
  AdminUpdateStationService,
  AdminDeleteStationService,
  AdminGenerateSlotsService,
  AdminGetUsersService,
  AdminDeleteUserService,
  AdminGetBookingsService,
  AdminGetReviewsService,
  AdminGetAmenitiesListService,
  AdminRegenerateQRService,
  AdminGetSettingsService,
  AdminUpdateSettingsService,
  SeedAdminService,
} from "../services/adminService.js";

const ok  = (res, result) => res.status(result.status === "Success" ? 200 : 400).json(result);
const fail = (res, e) => res.status(500).json({ status: "fail", message: e.message || e.toString() });

// â”€â”€ Auth â”€â”€
export const AdminLogin    = (req, res) => AdminLoginService(req.body).then(r => ok(res, r)).catch(e => fail(res, e));
export const AdminSeed     = (req, res) => SeedAdminService().then(r => ok(res, r)).catch(e => fail(res, e));

// â”€â”€ Dashboard â”€â”€
export const AdminDashboard = (req, res) => AdminDashboardService().then(r => ok(res, r)).catch(e => fail(res, e));

// â”€â”€ Brands â”€â”€
export const AdminGetBrands    = (req, res) => AdminGetBrandsService().then(r => ok(res, r)).catch(e => fail(res, e));
export const AdminCreateBrand  = (req, res) => AdminCreateBrandService(req.body).then(r => ok(res, r)).catch(e => fail(res, e));
export const AdminUpdateBrand  = (req, res) => AdminUpdateBrandService(req.params.id, req.body).then(r => ok(res, r)).catch(e => fail(res, e));
export const AdminDeleteBrand  = (req, res) => AdminDeleteBrandService(req.params.id).then(r => ok(res, r)).catch(e => fail(res, e));

// â”€â”€ Models â”€â”€
export const AdminGetModels    = (req, res) => AdminGetModelsService(req.query.brandId).then(r => ok(res, r)).catch(e => fail(res, e));
export const AdminCreateModel  = (req, res) => AdminCreateModelService(req.body).then(r => ok(res, r)).catch(e => fail(res, e));
export const AdminUpdateModel  = (req, res) => AdminUpdateModelService(req.params.id, req.body).then(r => ok(res, r)).catch(e => fail(res, e));
export const AdminDeleteModel  = (req, res) => AdminDeleteModelService(req.params.id).then(r => ok(res, r)).catch(e => fail(res, e));

// â”€â”€ Stations â”€â”€
export const AdminGetStations    = (req, res) => AdminGetStationsService().then(r => ok(res, r)).catch(e => fail(res, e));
export const AdminGetStation     = (req, res) => AdminGetStationService(req.params.id, req.query.date).then(r => ok(res, r)).catch(e => fail(res, e));
export const AdminGetAmenitiesList = (_req, res) => ok(res, AdminGetAmenitiesListService());

export const AdminCreateStation = (req, res) => {
  // If files were uploaded via multer, build image URLs and add to body
  if (req.files && req.files.length > 0) {
    const host = `${req.protocol}://${req.get("host")}`;
    req.body.images = req.files.map(f => `${host}/uploads/${f.filename}`);
  }
  // Parse amenities if sent as JSON string (multipart/form-data)
  if (typeof req.body.amenities === "string") {
    try { req.body.amenities = JSON.parse(req.body.amenities); } catch { /* leave as-is */ }
  }
  AdminCreateStationService(req.body).then(r => ok(res, r)).catch(e => fail(res, e));
};

export const AdminUpdateStation = (req, res) => {
  if (req.files && req.files.length > 0) {
    const host = `${req.protocol}://${req.get("host")}`;
    req.body.images = req.files.map(f => `${host}/uploads/${f.filename}`);
  }
  // Parse amenities if sent as JSON string (multipart/form-data)
  if (typeof req.body.amenities === "string") {
    try { req.body.amenities = JSON.parse(req.body.amenities); } catch { /* leave as-is */ }
  }
  AdminUpdateStationService(req.params.id, req.body).then(r => ok(res, r)).catch(e => fail(res, e));
};

export const AdminDeleteStation  = (req, res) => AdminDeleteStationService(req.params.id).then(r => ok(res, r)).catch(e => fail(res, e));

// â”€â”€ Users â”€â”€
export const AdminGetUsers    = (req, res) => AdminGetUsersService().then(r => ok(res, r)).catch(e => fail(res, e));
export const AdminDeleteUser  = (req, res) => AdminDeleteUserService(req.params.id).then(r => ok(res, r)).catch(e => fail(res, e));

// â”€â”€ Bookings â”€â”€
export const AdminGetBookings = (req, res) => AdminGetBookingsService().then(r => ok(res, r)).catch(e => fail(res, e));

// â”€â”€ Reviews â”€â”€
export const AdminGetReviews  = (req, res) => AdminGetReviewsService().then(r => ok(res, r)).catch(e => fail(res, e));

// â”€â”€ Station Slots â”€â”€
export const AdminGenerateSlots = (req, res) => AdminGenerateSlotsService(req.params.id, req.body).then(r => ok(res, r)).catch(e => fail(res, e));

// â”€â”€ Station QR Code â”€â”€
export const AdminRegenerateQR = (req, res) => AdminRegenerateQRService(req.params.id).then(r => ok(res, r)).catch(e => fail(res, e));

// ── Public (no auth) ──
export const PublicGetStationQR = (req, res) =>
  AdminGetStationService(req.params.id).then(r => ok(res, r)).catch(e => fail(res, e));

// ── App Settings ──
export const AdminGetSettings    = (req, res) => AdminGetSettingsService().then(r => ok(res, r)).catch(e => fail(res, e));
export const AdminUpdateSettings = (req, res) => AdminUpdateSettingsService(req.body).then(r => ok(res, r)).catch(e => fail(res, e));
