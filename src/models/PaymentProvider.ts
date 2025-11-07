import mongoose, { Schema, Document } from 'mongoose';

export type ProviderName = 'paypal' | 'revolut' | 'stripe' | 'other';

export interface IPaymentProvider extends Document {
  name: ProviderName;
  enabled: boolean;
  displayName: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentProviderSchema: Schema = new Schema(
  {
    name: {
      type: String,
      enum: ['paypal', 'revolut', 'stripe', 'other'],
      required: true,
      unique: true,
      index: true,
    },
    enabled: {
      type: Boolean,
      default: true,
      required: true,
    },
    displayName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const PaymentProvider = mongoose.model<IPaymentProvider>(
  'PaymentProvider',
  PaymentProviderSchema
);
