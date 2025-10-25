import mongoose, { Schema, Document } from 'mongoose';

export interface IInviteLink extends Document {
  telegramId: number;
  inviteLink: string;
  expiresAt: Date;
  isRevoked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const InviteLinkSchema: Schema = new Schema(
  {
    telegramId: {
      type: Number,
      required: true,
      index: true,
    },
    inviteLink: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index pour retrouver les liens actifs d'un utilisateur
InviteLinkSchema.index({ telegramId: 1, isRevoked: 1 });

// Index pour nettoyer les liens expirés
InviteLinkSchema.index({ expiresAt: 1, isRevoked: 1 });

export const InviteLink = mongoose.model<IInviteLink>('InviteLink', InviteLinkSchema);
