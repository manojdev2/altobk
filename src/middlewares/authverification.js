import { DecodeToken } from "../utils/tokenHelper.js";

export const AuthVerification = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  const decoded = DecodeToken(token);

  if (!decoded) {
    return res.status(401).json({ status: "failed", message: "Unauthorised" });
  }

  req.headers.email = decoded.email;
  req.headers.user_id = decoded.user_id;

  next();
};