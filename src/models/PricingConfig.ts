import mongoose, { Document, Schema } from 'mongoose';

export interface IPricingConfig extends Document {
  plan: 'monthly' | 'quarterly' | 'yearly';
  provider: 'paypal' | 'revolut' | 'stripe' | 'all';
  price: number;
  currency: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PricingConfigSchema = new Schema<IPricingConfig>(
  {
    plan: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly'],
      required: true,
    },
    provider: {
      type: String,
      enum: ['paypal', 'revolut', 'stripe', 'all'],
      required: true,
      default: 'all',
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: 'EUR',
    },
    description: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure one price per plan-provider combination
PricingConfigSchema.index({ plan: 1, provider: 1 }, { unique: true });

export const PricingConfig = mongoose.model<IPricingConfig>(
  'PricingConfig',
  PricingConfigSchema
);
