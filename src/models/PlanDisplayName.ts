import mongoose, { Document, Schema } from 'mongoose';
import { SubscriptionPlan } from './Subscription';

export interface IPlanDisplayName extends Document {
  plan: SubscriptionPlan;
  displayName: string;
  emoji: string;
  description: string;
  features: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const PlanDisplayNameSchema = new Schema<IPlanDisplayName>(
  {
    plan: {
      type: String,
      enum: ['monthly', 'quarterly', 'sixmonth', 'yearly'],
      required: true,
      unique: true,
    },
    displayName: {
      type: String,
      required: true,
      default: function() {
        const defaults: Record<string, string> = {
          monthly: 'ROOKIE',
          quarterly: 'SOPHOMORE',
          sixmonth: 'ALL STAR',
          yearly: 'MVP',
        };
        return defaults[this.plan as string] || this.plan;
      },
    },
    emoji: {
      type: String,
      default: function() {
        const defaults: Record<string, string> = {
          monthly: '🥉',
          quarterly: '🥈',
          sixmonth: '🥇',
          yearly: '🏆',
        };
        return defaults[this.plan as string] || '💎';
      },
    },
    description: {
      type: String,
      default: function() {
        const defaults: Record<string, string> = {
          monthly: 'Plan débutant - 1 mois d\'accès VIP',
          quarterly: 'Plan intermédiaire - 3 mois d\'accès VIP',
          sixmonth: 'Plan avancé - 6 mois d\'accès VIP',
          yearly: 'Plan premium - 12 mois d\'accès VIP',
        };
        return defaults[this.plan as string] || '';
      },
    },
    features: {
      type: [String],
      default: function() {
        const defaults: Record<string, string[]> = {
          monthly: [
            'Accès complet au groupe VIP',
            'Support prioritaire',
            'Contenu exclusif',
          ],
          quarterly: [
            'Accès complet au groupe VIP',
            'Support prioritaire',
            'Contenu exclusif',
            'Économies par rapport au plan mensuel',
          ],
          sixmonth: [
            'Accès complet au groupe VIP',
            'Support prioritaire',
            'Contenu exclusif',
            'Économies importantes',
            'Badge exclusif ALL STAR',
          ],
          yearly: [
            'Accès complet au groupe VIP',
            'Support prioritaire',
            'Contenu exclusif',
            'Économies maximales',
            'Badge exclusif MVP',
            'Accès prioritaire aux nouveautés',
          ],
        };
        return defaults[this.plan as string] || [];
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: function() {
        const orders: Record<string, number> = {
          monthly: 1,
          quarterly: 2,
          sixmonth: 3,
          yearly: 4,
        };
        return orders[this.plan as string] || 0;
      },
    },
  },
  {
    timestamps: true,
  }
);

export const PlanDisplayName = mongoose.model<IPlanDisplayName>('PlanDisplayName', PlanDisplayNameSchema);

/**
 * Initialiser les noms de plans par défaut
 */
export async function initializeDefaultPlanNames(): Promise<void> {
  const plans: SubscriptionPlan[] = ['monthly', 'quarterly', 'sixmonth', 'yearly'];

  for (const plan of plans) {
    const existing = await PlanDisplayName.findOne({ plan });
    if (!existing) {
      await PlanDisplayName.create({ plan });
    }
  }
}

/**
 * Récupérer les noms d'affichage de tous les plans
 */
export async function getAllPlanDisplayNames(): Promise<Record<SubscriptionPlan, IPlanDisplayName>> {
  const plans = await PlanDisplayName.find().sort({ sortOrder: 1 });
  const result: any = {};

  for (const plan of plans) {
    result[plan.plan] = plan;
  }

  return result;
}
