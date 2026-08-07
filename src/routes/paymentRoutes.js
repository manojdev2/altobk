/**
 * ════════════════════════════════════════════════════════════
 * PAYMENT CALLBACK ROUTES
 * ════════════════════════════════════════════════════════════
 *
 * SSLCommerz: success, fail, cancel, IPN (all POST, public — no auth)
 * Stripe:     webhook (POST, public, raw body for signature verification)
 */

import express from "express";
import BookingModel from "../models/BookingModel.js";
import ChargingSessionModel from "../models/ChargingSessionModel.js";
import { validateSSLCommerzIPN, verifyStripeWebhook, retrieveStripePaymentIntent } from "../services/paymentService.js";

const paymentRouter = express.Router();

// ════════════════════════════════════════════════════════════
//  SSLCommerz Callbacks
// ════════════════════════════════════════════════════════════

/**
 * Helper: mark booking or session as paid based on tran_id / value_a / value_b
 */
const handleSSLCommerzSuccess = async (body) => {
  const paymentType = body.value_a;   // "booking" | "session"
  const referenceId = body.value_b;   // bookingId or sessionId
  const tran_id     = body.tran_id;

  if (paymentType === "booking") {
    const booking = await BookingModel.findById(referenceId);
    if (booking && !booking.isPaid) {
      booking.isPaid        = true;
      booking.status        = "Upcoming";
      booking.paymentStatus = "paid";
      booking.transactionId = tran_id;
      await booking.save();
    }
    return booking;
  }

  if (paymentType === "session") {
    const session = await ChargingSessionModel.findById(referenceId);
    if (session && session.status === "Stopped") {
      session.status                 = "Completed";
      session.extensionPaymentStatus = "paid";
      session.extensionTransactionId = tran_id;
      await session.save();
    }
    return session;
  }

  return null;
};

const handleSSLCommerzFail = async (body) => {
  const paymentType = body.value_a;
  const referenceId = body.value_b;

  if (paymentType === "booking") {
    await BookingModel.findByIdAndUpdate(referenceId, { paymentStatus: "failed" });
  }
  if (paymentType === "session") {
    await ChargingSessionModel.findByIdAndUpdate(referenceId, { extensionPaymentStatus: "failed" });
  }
};

const handleSSLCommerzCancel = async (body) => {
  const paymentType = body.value_a;
  const referenceId = body.value_b;

  if (paymentType === "booking") {
    await BookingModel.findByIdAndUpdate(referenceId, { paymentStatus: "cancelled" });
  }
  if (paymentType === "session") {
    await ChargingSessionModel.findByIdAndUpdate(referenceId, { extensionPaymentStatus: "cancelled" });
  }
};

// ─── POST /payment/sslcommerz/success ─────────────────────────────────────
paymentRouter.post("/payment/sslcommerz/success", async (req, res) => {
  try {
    console.log("SSLCommerz SUCCESS:", req.body?.tran_id);
    await handleSSLCommerzSuccess(req.body);

    // Redirect user back to Flutter deep link or a success HTML page
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Payment Successful</title></head>
      <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#f0fdf4;">
        <div style="text-align:center;">
          <h1 style="color:#16a34a;">✅ Payment Successful!</h1>
          <p>You can close this window and return to the app.</p>
        </div>
      </body>
      </html>`;
    return res.status(200).send(html);
  } catch (e) {
    console.error("SSLCommerz success handler error:", e);
    return res.status(500).send("Error processing payment.");
  }
});

// ─── POST /payment/sslcommerz/fail ────────────────────────────────────────
paymentRouter.post("/payment/sslcommerz/fail", async (req, res) => {
  try {
    console.log("SSLCommerz FAIL:", req.body?.tran_id);
    await handleSSLCommerzFail(req.body);

    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Payment Failed</title></head>
      <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#fef2f2;">
        <div style="text-align:center;">
          <h1 style="color:#dc2626;">❌ Payment Failed</h1>
          <p>Please try again from the app.</p>
        </div>
      </body>
      </html>`;
    return res.status(200).send(html);
  } catch (e) {
    console.error("SSLCommerz fail handler error:", e);
    return res.status(500).send("Error processing payment.");
  }
});

// ─── POST /payment/sslcommerz/cancel ──────────────────────────────────────
paymentRouter.post("/payment/sslcommerz/cancel", async (req, res) => {
  try {
    console.log("SSLCommerz CANCEL:", req.body?.tran_id);
    await handleSSLCommerzCancel(req.body);

    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Payment Cancelled</title></head>
      <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#fffbeb;">
        <div style="text-align:center;">
          <h1 style="color:#d97706;">⚠️ Payment Cancelled</h1>
          <p>You can return to the app and try again.</p>
        </div>
      </body>
      </html>`;
    return res.status(200).send(html);
  } catch (e) {
    console.error("SSLCommerz cancel handler error:", e);
    return res.status(500).send("Error processing payment.");
  }
});

// ─── POST /payment/sslcommerz/ipn (Instant Payment Notification) ─────────
paymentRouter.post("/payment/sslcommerz/ipn", async (req, res) => {
  try {
    console.log("SSLCommerz IPN:", req.body?.tran_id, req.body?.status);

    // Validate the IPN
    const validation = await validateSSLCommerzIPN(req.body);

    if (req.body.status === "VALID" || req.body.status === "VALIDATED") {
      await handleSSLCommerzSuccess(req.body);
    } else if (req.body.status === "FAILED") {
      await handleSSLCommerzFail(req.body);
    } else if (req.body.status === "CANCELLED") {
      await handleSSLCommerzCancel(req.body);
    }

    return res.status(200).json({ status: "ok" });
  } catch (e) {
    console.error("SSLCommerz IPN handler error:", e);
    return res.status(500).json({ status: "error" });
  }
});

// ════════════════════════════════════════════════════════════
//  Stripe Webhook
// ════════════════════════════════════════════════════════════

// ─── POST /payment/stripe/webhook ─────────────────────────────────────────
// NOTE: This route needs raw body. We register it in app.js BEFORE json parser.
paymentRouter.post("/payment/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const sig = req.headers["stripe-signature"];
    const event = await verifyStripeWebhook(req.body, sig);

    // If webhook secret is not configured, parse body manually
    let eventData;
    if (event) {
      eventData = event;
    } else {
      // Fallback: parse raw body (for dev without webhook secret)
      eventData = JSON.parse(req.body.toString());
    }

    if (eventData.type === "payment_intent.succeeded") {
      const pi = eventData.data?.object || eventData.data;
      const paymentType = pi.metadata?.paymentType;
      const referenceId = pi.metadata?.referenceId;

      if (paymentType === "booking" && referenceId) {
        const booking = await BookingModel.findById(referenceId);
        if (booking && !booking.isPaid) {
          booking.isPaid                = true;
          booking.status                = "Upcoming";
          booking.paymentGateway        = "stripe";
          booking.transactionId         = pi.id;
          booking.stripePaymentIntentId = pi.id;
          booking.paymentStatus         = "paid";
          await booking.save();
          console.log("Stripe webhook: Booking paid", referenceId);
        }
      }

      if (paymentType === "session" && referenceId) {
        const session = await ChargingSessionModel.findById(referenceId);
        if (session && session.status === "Stopped") {
          session.status                 = "Completed";
          session.paymentGateway         = "stripe";
          session.extensionTransactionId = pi.id;
          session.stripePaymentIntentId  = pi.id;
          session.extensionPaymentStatus = "paid";
          await session.save();
          console.log("Stripe webhook: Session extension paid", referenceId);
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    console.error("Stripe webhook error:", e);
    return res.status(400).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
//  Payment Status Check (for Flutter polling after SSLCommerz redirect)
// ════════════════════════════════════════════════════════════

// ─── GET /payment/status/booking/:id ──────────────────────────────────────
paymentRouter.get("/payment/status/booking/:id", async (req, res) => {
  try {
    const booking = await BookingModel.findById(req.params.id);
    if (!booking) return res.status(404).json({ status: "fail", message: "Booking not found." });

    return res.status(200).json({
      status: "Success",
      data: {
        bookingId:      booking._id,
        isPaid:         booking.isPaid,
        paymentStatus:  booking.paymentStatus,
        paymentGateway: booking.paymentGateway,
        transactionId:  booking.transactionId,
      },
    });
  } catch (e) {
    return res.status(500).json({ status: "fail", message: e.toString() });
  }
});

// ─── GET /payment/status/session/:id ──────────────────────────────────────
paymentRouter.get("/payment/status/session/:id", async (req, res) => {
  try {
    const session = await ChargingSessionModel.findById(req.params.id);
    if (!session) return res.status(404).json({ status: "fail", message: "Session not found." });

    return res.status(200).json({
      status: "Success",
      data: {
        sessionId:              session._id,
        sessionStatus:          session.status,
        extensionPaymentStatus: session.extensionPaymentStatus,
        paymentGateway:         session.paymentGateway,
        transactionId:          session.extensionTransactionId,
      },
    });
  } catch (e) {
    return res.status(500).json({ status: "fail", message: e.toString() });
  }
});

export default paymentRouter;
