import mongoose from "mongoose";

const ProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    avatar: { type: String, default: "" },
    dateOfBirth: { type: String, default: "" },
    sessions: { type: Number, default: 0 },
    kwhUsed: { type: Number, default: 0 },
    favourites: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const ProfileModel = mongoose.model("Profile", ProfileSchema);
export default ProfileModel;
