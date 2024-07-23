import mongoose from "mongoose";

const customerSchema = new mongoose.Schema({
  customer_name: { type: String, required: true },
  dob: { type: Date, required: true },
  monthly_income: { type: Number, required: String },
  createdAt: { type: Date, default: Date.now },
});

export const Customer = mongoose.model("Customer", customerSchema);
