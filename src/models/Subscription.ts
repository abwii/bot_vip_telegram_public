import mongoose, { Schema, Document } from 'mongoose';

export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'pending';
export type SubscriptionPlan = 'monthly' | 'quarterly' | 'yearly';

export interface ISubscription extends Document {
  userId: mongoose.Types.ObjectId;
  telegramId: number;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date;
  autoRenew: boolean;
  paymentProvider: 'paypal' | 'revolut' | 'test';
  externalSubscriptionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema: Schema = new Schema(
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
    plan: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly'],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'pending'],
      default: 'pending',
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    autoRenew: {
      type: Boolean,
      default: false,
    },
    paymentProvider: {
      type: String,
      enum: ['paypal', 'revolut', 'test'],
      required: true,
    },
    externalSubscriptionId: {
      type: String,
      sparse: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index composé pour les recherches fréquentes
SubscriptionSchema.index({ status: 1, endDate: 1 });
SubscriptionSchema.index({ telegramId: 1, status: 1 });

export const Subscription = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
