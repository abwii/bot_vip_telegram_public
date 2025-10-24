import mongoose, { Schema, Document } from 'mongoose';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentProvider = 'paypal' | 'revolut' | 'stripe';

export interface IPayment extends Document {
  userId: mongoose.Types.ObjectId;
  telegramId: number;
  subscriptionId?: mongoose.Types.ObjectId;
  provider: PaymentProvider;
  externalPaymentId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    telegramId: {
      type: Number,
      required: true,
      index: true,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'Subscription',
      index: true,
    },
    provider: {
      type: String,
      enum: ['paypal', 'revolut', 'stripe'],
      required: true,
    },
    externalPaymentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      default: 'USD',
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Index composé pour les recherches fréquentes
PaymentSchema.index({ telegramId: 1, status: 1 });
PaymentSchema.index({ provider: 1, externalPaymentId: 1 });

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);
