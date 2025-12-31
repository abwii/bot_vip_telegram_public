import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  isVip: boolean;
  vipUntil?: Date;
  hasUsedTrial: boolean;
  expirationNotificationSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    telegramId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      sparse: true,
    },
    firstName: {
      type: String,
    },
    lastName: {
      type: String,
    },
    isVip: {
      type: Boolean,
      default: false,
      index: true,
    },
    vipUntil: {
      type: Date,
      index: true,
    },
    hasUsedTrial: {
      type: Boolean,
      default: false,
    },
    expirationNotificationSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index pour retrouver les utilisateurs VIP qui expirent bientôt
UserSchema.index({ isVip: 1, vipUntil: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);
