import { SubscriptionPlan } from '../models/Subscription';
import { getAllPlanDisplayNames } from '../models/PlanDisplayName';

// Fallback values si la base de données n'est pas disponible
const FALLBACK_DISPLAY_NAMES: Record<SubscriptionPlan, string> = {
  monthly: '🥉 ROOKIE',
  quarterly: '🥈 SOPHOMORE',
  sixmonth: '🥇 ALL STAR',
  yearly: '🏆 MVP',
};

// Durées en jours pour chaque plan
export const PLAN_DURATIONS: Record<SubscriptionPlan, number> = {
  monthly: 30,
  quarterly: 90,
  sixmonth: 180,
  yearly: 365,
};

// Descriptions courtes pour chaque plan
export const PLAN_SHORT_DESCRIPTIONS: Record<SubscriptionPlan, string> = {
  monthly: '1 mois',
  quarterly: '3 mois',
  sixmonth: '6 mois',
  yearly: '12 mois',
};

// Cache pour les noms de plans
let planNamesCache: Record<SubscriptionPlan, any> | null = null;
let lastCacheUpdate = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Obtenir les noms de plans depuis la base de données (avec cache)
 */
async function getCachedPlanNames() {
  const now = Date.now();

  if (!planNamesCache || now - lastCacheUpdate > CACHE_DURATION) {
    try {
      planNamesCache = await getAllPlanDisplayNames();
      lastCacheUpdate = now;
    } catch (error) {
      console.error('Error loading plan names from database:', error);
      // Retourner les valeurs par défaut en cas d'erreur
      return null;
    }
  }

  return planNamesCache;
}

/**
 * Obtenir le nom d'affichage complet d'un plan (emoji + nom)
 */
export async function getPlanDisplayName(plan: SubscriptionPlan): Promise<string> {
  const planNames = await getCachedPlanNames();

  if (planNames && planNames[plan]) {
    return `${planNames[plan].emoji} ${planNames[plan].displayName}`;
  }

  return FALLBACK_DISPLAY_NAMES[plan] || plan;
}

/**
 * Obtenir le nom d'affichage synchrone (pour compatibilité)
 */
export function getPlanDisplayNameSync(plan: SubscriptionPlan): string {
  return FALLBACK_DISPLAY_NAMES[plan] || plan;
}

/**
 * Obtenir tous les noms d'affichage (format compatible avec le code existant)
 */
export async function getAllPlanDisplayNamesFormatted(): Promise<Record<SubscriptionPlan, string>> {
  const planNames = await getCachedPlanNames();

  if (planNames) {
    const formatted: any = {};
    for (const [key, value] of Object.entries(planNames)) {
      formatted[key] = `${value.emoji} ${value.displayName}`;
    }
    return formatted;
  }

  return FALLBACK_DISPLAY_NAMES;
}

/**
 * Version synchrone pour export (utilise les valeurs par défaut)
 */
export const PLAN_DISPLAY_NAMES = FALLBACK_DISPLAY_NAMES;

/**
 * Obtenir la durée d'un plan en jours
 */
export function getPlanDuration(plan: SubscriptionPlan): number {
  return PLAN_DURATIONS[plan] || 30;
}

/**
 * Obtenir la description courte d'un plan
 */
export function getPlanShortDescription(plan: SubscriptionPlan): string {
  return PLAN_SHORT_DESCRIPTIONS[plan] || '';
}

/**
 * Invalider le cache (à appeler après modification des noms)
 */
export function invalidatePlanNamesCache(): void {
  planNamesCache = null;
  lastCacheUpdate = 0;
}
