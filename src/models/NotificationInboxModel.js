import mongoose from "mongoose";

const NotificationInboxSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: [
        "charging_booking",
        "charging_started",
        "low_battery",
        "station_update",
        "payment",
        "general",
      ],
      default: "general",
    },
    isRead: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const NotificationInboxModel = mongoose.model(
  "NotificationInbox",
  NotificationInboxSchema
);
export default NotificationInboxModel;
