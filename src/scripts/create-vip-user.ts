import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';
import { Payment } from '../models/Payment';
import { PricingConfig } from '../models/PricingConfig';
import * as readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function createVipUser(): Promise<void> {
  try {
    // Connexion à MongoDB
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('❌ MONGO_URI non défini dans .env');
      process.exit(1);
    }

    console.log('🔄 Connexion à MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB\n');

    // Demander les informations de l'utilisateur
    console.log('📝 Création d\'un client VIP manuellement\n');

    const telegramIdStr = await question('Telegram ID de l\'utilisateur: ');
    const telegramId = parseInt(telegramIdStr);
    if (!telegramId || isNaN(telegramId) || telegramId <= 0) {
      console.error('❌ Telegram ID invalide');
      process.exit(1);
    }

    // Vérifier si l'utilisateur existe déjà
    let user = await User.findOne({ telegramId });
    const isNewUser = !user;

    if (user) {
      console.log(`ℹ️  Utilisateur existant trouvé:`);
      console.log(`   Telegram ID: ${user.telegramId}`);
      console.log(`   Username: ${user.username || 'N/A'}`);
      console.log(`   VIP actuel: ${user.isVip ? 'Oui' : 'Non'}`);
      if (user.vipUntil) {
        console.log(`   VIP jusqu'au: ${user.vipUntil.toLocaleDateString('fr-FR')}`);
      }
      console.log('');
    }

    console.log('Plans disponibles:');
    console.log('  1. monthly (30 jours)');
    console.log('  2. quarterly (90 jours)');
    console.log('  3. sixmonth (180 jours)');
    console.log('  4. yearly (365 jours)');
    console.log('');

    const planInput = await question('Plan (monthly/quarterly/sixmonth/yearly): ');
    const validPlans = ['monthly', 'quarterly', 'sixmonth', 'yearly'];
    if (!validPlans.includes(planInput)) {
      console.error('❌ Plan invalide');
      process.exit(1);
    }
    const plan = planInput as 'monthly' | 'quarterly' | 'sixmonth' | 'yearly';

    // Récupérer le prix du plan
    const pricing = await PricingConfig.findOne({ plan });
    if (!pricing) {
      console.error('❌ Prix non trouvé pour ce plan');
      process.exit(1);
    }

    // Durées par défaut selon le plan
    const defaultDurations: Record<string, number> = {
      monthly: 30,
      quarterly: 90,
      sixmonth: 180,
      yearly: 365,
    };
    const defaultDuration = defaultDurations[plan];

    console.log(`ℹ️  Prix du plan ${plan}: ${pricing.price} ${pricing.currency}`);

    const durationInput = await question(`Durée en jours [${defaultDuration}]: `);
    const duration = durationInput ? parseInt(durationInput) : defaultDuration;
    if (!duration || isNaN(duration) || duration <= 0) {
      console.error('❌ Durée invalide');
      process.exit(1);
    }

    const paymentMethodInput = await question('Moyen de paiement (paypal/revolut/stripe/other) [other]: ');
    const paymentMethod = paymentMethodInput.trim() || 'other';
    const validMethods = ['paypal', 'revolut', 'stripe', 'other'];
    if (!validMethods.includes(paymentMethod)) {
      console.error('❌ Moyen de paiement invalide');
      process.exit(1);
    }

    const noteInput = await question('Note/commentaire [Paiement manuel]: ');
    const note = noteInput || 'Paiement manuel';

    const createdByInput = await question('Créé par [admin]: ');
    const createdBy = createdByInput || 'admin';

    // Confirmation
    console.log('\n📋 Résumé:');
    console.log(`   Telegram ID: ${telegramId}`);
    console.log(`   Nouveau utilisateur: ${isNewUser ? 'Oui' : 'Non'}`);
    console.log(`   Plan: ${plan}`);
    console.log(`   Durée: ${duration} jours`);
    console.log(`   Prix: ${pricing.price} ${pricing.currency}`);
    console.log(`   Moyen de paiement: ${paymentMethod}`);
    console.log(`   Note: ${note}`);
    console.log(`   Créé par: ${createdBy}`);
    console.log('');

    const confirm = await question('Confirmer la création ? (oui/non): ');
    if (confirm.toLowerCase() !== 'oui' && confirm.toLowerCase() !== 'o') {
      console.log('❌ Création annulée');
      process.exit(0);
    }

    // Calculer les dates
    const startDate = new Date();
    const endDate = new Date(startDate);

    // Créer ou mettre à jour l'utilisateur
    if (!user) {
      endDate.setDate(endDate.getDate() + duration);
      user = new User({
        telegramId,
        isVip: true,
        vipUntil: endDate,
      });
    } else {
      // Si l'utilisateur a déjà un accès VIP, prolonger à partir de la date actuelle d'expiration
      const currentExpiry = user.vipUntil && user.vipUntil > startDate ? user.vipUntil : startDate;
      const newExpiry = new Date(currentExpiry);
      newExpiry.setDate(newExpiry.getDate() + duration);

      user.isVip = true;
      user.vipUntil = newExpiry;
      endDate.setTime(newExpiry.getTime());
    }
    await user.save();

    // Créer la souscription
    const subscription = new Subscription({
      userId: user._id,
      telegramId: user.telegramId,
      plan,
      status: 'active',
      startDate,
      endDate: user.vipUntil,
      autoRenew: false,
      paymentProvider: paymentMethod === 'other' ? 'test' : paymentMethod,
      externalSubscriptionId: `manual-${Date.now()}-${telegramId}`,
    });
    await subscription.save();

    // Créer le paiement
    const payment = new Payment({
      userId: user._id,
      telegramId: user.telegramId,
      subscriptionId: subscription._id,
      provider: paymentMethod as any,
      externalPaymentId: `manual-${Date.now()}-${telegramId}`,
      amount: pricing.price,
      currency: pricing.currency,
      status: 'completed',
      metadata: {
        manual: true,
        createdBy,
        note,
      },
    });
    await payment.save();

    console.log('\n✅ Client VIP créé avec succès !');
    console.log(`   Utilisateur: ${user.telegramId}`);
    console.log(`   VIP jusqu'au: ${user.vipUntil?.toLocaleDateString('fr-FR')}`);
    console.log(`   Abonnement ID: ${subscription._id}`);
    console.log(`   Paiement ID: ${payment._id}`);
    console.log('\n💡 Note: L\'utilisateur recevra une notification lors de sa prochaine connexion au bot');
  } catch (error) {
    console.error('❌ Erreur lors de la création du client VIP:', error);
    process.exit(1);
  } finally {
    rl.close();
    await mongoose.connection.close();
  }
}

createVipUser();
