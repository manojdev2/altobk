import jwt from "jsonwebtoken";
import AdminModel from "../models/AdminModel.js";

export const AdminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
      return res.status(401).json({ status: "fail", message: "Unauthorised." });

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await AdminModel.findById(decoded.id).select("-password");
    if (!admin) return res.status(401).json({ status: "fail", message: "Admin not found." });

    req.admin = admin;
    next();
  } catch (e) {
    return res.status(401).json({ status: "fail", message: "Invalid or expired token." });
  }
};
