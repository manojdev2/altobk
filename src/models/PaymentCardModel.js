import mongoose from "mongoose";

const PaymentCardSchema = new mongoose.Schema(
  {
    userId:     {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    cardHolder:  { type: String, default: "" },        // "John Doe"
    cardNumber:  { type: String, required: true },     // full encrypted — display as "XXXX XXXX 2345"
    last4:       { type: String, required: true },     // "2345"
    expiryDate:  { type: String, default: "" },        // "12/27"
    cardType:    { type: String, default: "Card" },    // "Visa", "Mastercard", "Card"
    isDefault:   { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const PaymentCardModel = mongoose.model("PaymentCard", PaymentCardSchema);
export default PaymentCardModel;
