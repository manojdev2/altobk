
import "dotenv/config";
import { PORT } from "./config/config.js";
import app from "./app.js"; // also initiates the MongoDB connection, see app.js

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

// Only relevant for local dev — on Vercel, app.js is imported directly as
// the serverless handler and this file never runs.
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
