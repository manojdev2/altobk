import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stationId: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    // Only settable from a completed charging session — a real driver who
    // was physically at the charger, not an open/anonymous report.
    workingStatus: {
      type: String,
      enum: ["working", "partially_working", "not_working"],
      default: "working",
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    // Link to charging session (optional — set when review comes from charging flow)
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChargingSession",
      default: null,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const ReviewModel = mongoose.model("Review", ReviewSchema);
export default ReviewModel;
