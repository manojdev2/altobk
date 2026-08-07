import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    chargingStatusAlerts: { type: Boolean, default: false },
    lowBatteryAlerts: { type: Boolean, default: false },
    bookingUpdates: { type: Boolean, default: false },
    stationUpdates: { type: Boolean, default: false },
    paymentAndSession: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const NotificationModel = mongoose.model("Notification", NotificationSchema);
export default NotificationModel;
