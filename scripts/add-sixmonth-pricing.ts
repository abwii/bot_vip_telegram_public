/**
 * Script pour ajouter les prix du plan "sixmonth" (6 mois) dans la base de données
 *
 * Usage: npx ts-node scripts/add-sixmonth-pricing.ts
 */

import mongoose from 'mongoose';
import { config } from '../src/config';
import { PricingConfig } from '../src/models/PricingConfig';

async function addSixMonthPricing() {
  console.log('🔄 Ajout des prix pour le plan 6 mois (ALL STAR)...\n');

  try {
    // Connexion à la base de données
    await mongoose.connect(config.database.mongoUri);
    console.log('✅ Connecté à la base de données\n');

    // Vérifier si le plan existe déjà
    const existingPrices = await PricingConfig.find({ plan: 'sixmonth' });

    if (existingPrices.length > 0) {
      console.log('ℹ️  Le plan sixmonth existe déjà en base de données:');
      for (const price of existingPrices) {
        console.log(`   - ${price.provider}: ${price.price}${price.currency}`);
      }
      console.log('\n❓ Voulez-vous les remplacer ? (Ctrl+C pour annuler)\n');

      // Attendre 5 secondes avant de continuer
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Supprimer les prix existants
      await PricingConfig.deleteMany({ plan: 'sixmonth' });
      console.log('✅ Anciens prix supprimés\n');
    }

    // Prix par défaut pour le plan ALL STAR (6 mois)
    const defaultPrice = 44.99;
    const providers: Array<'paypal' | 'revolut' | 'stripe' | 'all'> = ['all'];

    console.log(`💰 Création des prix pour le plan sixmonth (${defaultPrice}€)...`);

    for (const provider of providers) {
      await PricingConfig.create({
        plan: 'sixmonth',
        provider,
        price: defaultPrice,
        currency: 'EUR',
        description: '🥇 Plan ALL STAR - 6 mois d\'accès VIP',
      });
      console.log(`   ✅ Prix créé pour ${provider}`);
    }

    console.log('\n✅ Prix du plan sixmonth ajoutés avec succès !');
    console.log('\n📊 Récapitulatif des plans disponibles:');

    const allPlans = await PricingConfig.find({ provider: 'all' }).sort({ plan: 1 });
    for (const plan of allPlans) {
      const displayNames: Record<string, string> = {
        monthly: '🥉 ROOKIE (1 mois)',
        quarterly: '🥈 SOPHOMORE (3 mois)',
        sixmonth: '🥇 ALL STAR (6 mois)',
        yearly: '🏆 MVP (12 mois)',
      };
      console.log(`   ${displayNames[plan.plan] || plan.plan}: ${plan.price}${plan.currency}`);
    }

    console.log('\n⚠️  N\'oubliez pas de :');
    console.log('   1. Ajuster le prix si nécessaire dans le dashboard admin');
    console.log('   2. Redémarrer l\'application pour voir les changements');

  } catch (error) {
    console.error('❌ Erreur lors de l\'ajout des prix:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Déconnecté de la base de données');
    process.exit(0);
  }
}

// Exécuter le script
addSixMonthPricing();
