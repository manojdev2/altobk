import mongoose from "mongoose";

const RecurringDepotScheduleSchema = new mongoose.Schema(
  {
    fleetId: { type: mongoose.Schema.Types.ObjectId, ref: "Fleet", required: true },
    stationId: { type: mongoose.Schema.Types.ObjectId, ref: "NearestStation", required: true },
    windowStart: { type: String, required: true }, // "10:00 PM"
    windowEnd: { type: String, required: true },   // "06:00 AM"
    memberUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // the nightly roster
    runHour: { type: Number, default: 21, min: 0, max: 23 }, // server-local hour to trigger the run
    active: { type: Boolean, default: true },
    lastRunDate: { type: String, default: null }, // "30 Jul, Thu" — prevents double-running the same night
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const RecurringDepotScheduleModel = mongoose.model("RecurringDepotSchedule", RecurringDepotScheduleSchema);
export default RecurringDepotScheduleModel;
