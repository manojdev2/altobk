import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    fullName: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, default: "" },
    otp: { type: String, default: "0" },
    otpExpires: { type: Date, default: null },
    isVerified: { type: Boolean, default: false },
    resetVerified: { type: Boolean, default: false },

    // ── Driver trust score (from real booking/session completion history) ──
    trustScore: { type: Number, default: 100 },
    trustTier: {
      type: String,
      enum: ["new", "trusted", "building", "flagged"],
      default: "new",
    },
    completedSessionsCount: { type: Number, default: 0 },
    noShowCount: { type: Number, default: 0 },

    // ── Commercial fleet membership (consolidated billing) ──
    fleetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Fleet",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const UserModel = mongoose.model("User", UserSchema);

export default UserModel;
