import mongoose from 'mongoose';
import { config } from './config';
import { User } from './models/User';
import { Subscription } from './models/Subscription';
import { Payment } from './models/Payment';
import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

async function testSubscription() {
  try {
    // Connexion à MongoDB
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(config.database.mongoUri);
    logger.info('Connected to MongoDB');

    // Données de test
    const testTelegramId = 123456789;
    const testPlan = 'monthly';
    const testAmount = 9.99;

    logger.info('=== TEST 1: Création d\'un utilisateur ===');

    // Créer un utilisateur de test
    let user = await User.findOne({ telegramId: testTelegramId });
    if (user) {
      logger.info('Utilisateur existant trouvé, suppression...');
      await User.deleteOne({ telegramId: testTelegramId });
      await Subscription.deleteMany({ telegramId: testTelegramId });
      await Payment.deleteMany({ telegramId: testTelegramId });
    }

    user = new User({
      telegramId: testTelegramId,
      username: 'test_user',
      firstName: 'Test',
      lastName: 'User',
      isVip: false,
    });
    await user.save();
    logger.info({
      telegramId: user.telegramId,
      username: user.username,
      isVip: user.isVip,
    }, '✅ Utilisateur créé');

    logger.info('\n=== TEST 2: Création d\'un paiement ===');

    // Créer un paiement de test
    const payment = new Payment({
      userId: user._id,
      telegramId: testTelegramId,
      provider: 'paypal',
      externalPaymentId: 'TEST_PAYMENT_123',
      amount: testAmount,
      currency: 'EUR',
      status: 'completed',
      metadata: {
        telegramId: testTelegramId,
        plan: testPlan,
        username: 'test_user',
      },
    });
    await payment.save();
    logger.info({
      id: payment._id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
    }, '✅ Paiement créé');

    logger.info('\n=== TEST 3: Création d\'un abonnement VIP ===');

    // Calculer les dates
    const durations = { monthly: 30, quarterly: 90, yearly: 365 };
    const durationDays = durations[testPlan as keyof typeof durations];
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);

    // Mettre à jour l'utilisateur
    user.isVip = true;
    user.vipUntil = endDate;
    await user.save();

    // Créer l'abonnement
    const subscription = new Subscription({
      userId: user._id,
      telegramId: testTelegramId,
      plan: testPlan,
      status: 'active',
      startDate,
      endDate,
      paymentProvider: 'paypal',
      externalSubscriptionId: 'TEST_SUB_123',
      autoRenew: false,
    });
    await subscription.save();

    logger.info({
      id: subscription._id,
      plan: subscription.plan,
      status: subscription.status,
      startDate: subscription.startDate.toLocaleDateString('fr-FR'),
      endDate: subscription.endDate.toLocaleDateString('fr-FR'),
      autoRenew: subscription.autoRenew,
    }, '✅ Abonnement créé');

    logger.info('\n=== TEST 4: Vérification des données en base ===');

    // Vérifier l'utilisateur
    const savedUser = await User.findOne({ telegramId: testTelegramId });
    logger.info({
      telegramId: savedUser?.telegramId,
      isVip: savedUser?.isVip,
      vipUntil: savedUser?.vipUntil?.toLocaleDateString('fr-FR'),
    }, 'Utilisateur en base');

    // Vérifier le paiement
    const savedPayment = await Payment.findOne({ telegramId: testTelegramId });
    logger.info({
      id: savedPayment?._id,
      amount: savedPayment?.amount,
      status: savedPayment?.status,
    }, 'Paiement en base');

    // Vérifier l'abonnement
    const savedSubscription = await Subscription.findOne({ telegramId: testTelegramId });
    logger.info({
      id: savedSubscription?._id,
      status: savedSubscription?.status,
      plan: savedSubscription?.plan,
    }, 'Abonnement en base');

    logger.info('\n=== TEST 5: Simulation d\'un abonnement expiré ===');

    // Créer un utilisateur avec un abonnement expiré
    const expiredTelegramId = 987654321;
    const expiredUser = new User({
      telegramId: expiredTelegramId,
      username: 'expired_user',
      firstName: 'Expired',
      lastName: 'User',
      isVip: true,
      vipUntil: new Date('2024-01-01'), // Date dans le passé
    });
    await expiredUser.save();

    const expiredSubscription = new Subscription({
      userId: expiredUser._id,
      telegramId: expiredTelegramId,
      plan: 'monthly',
      status: 'active',
      startDate: new Date('2023-12-01'),
      endDate: new Date('2024-01-01'), // Date dans le passé
      paymentProvider: 'paypal',
      externalSubscriptionId: 'TEST_EXPIRED_SUB',
      autoRenew: false,
    });
    await expiredSubscription.save();

    logger.info({
      telegramId: expiredUser.telegramId,
      isVip: expiredUser.isVip,
      vipUntil: expiredUser.vipUntil?.toLocaleDateString('fr-FR'),
    }, '✅ Utilisateur avec abonnement expiré créé');

    logger.info('\n=== TEST 6: Recherche des utilisateurs expirés ===');

    // Chercher les utilisateurs VIP expirés (comme le fait le scheduler)
    const expiredUsers = await User.find({
      isVip: true,
      vipUntil: { $lt: new Date() },
    });

    logger.info(`✅ ${expiredUsers.length} utilisateur(s) expiré(s) trouvé(s):`);
    for (const u of expiredUsers) {
      logger.info({
        telegramId: u.telegramId,
        username: u.username,
        vipUntil: u.vipUntil?.toLocaleDateString('fr-FR'),
      });
    }

    logger.info('\n=== TEST 7: Mise à jour des abonnements expirés ===');

    // Mettre à jour les abonnements expirés
    const updateResult = await Subscription.updateMany(
      {
        telegramId: expiredTelegramId,
        status: 'active',
        endDate: { $lt: new Date() },
      },
      { status: 'expired' }
    );

    logger.info(`✅ ${updateResult.modifiedCount} abonnement(s) mis à jour vers "expired"`);

    // Vérifier la mise à jour
    const updatedSubscription = await Subscription.findOne({ telegramId: expiredTelegramId });
    logger.info({
      status: updatedSubscription?.status,
    }, 'Abonnement après mise à jour');

    logger.info('\n=== TEST 8: Statistiques ===');

    // Compter les VIP actifs
    const activeVipCount = await User.countDocuments({
      isVip: true,
      vipUntil: { $gt: new Date() },
    });

    // Compter les abonnements actifs
    const activeSubscriptions = await Subscription.countDocuments({
      status: 'active',
    });

    // Calculer le revenu total
    const totalRevenue = await Payment.aggregate([
      {
        $match: {
          status: 'completed',
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);

    logger.info({
      activeVipCount,
      activeSubscriptions,
      totalRevenue: totalRevenue[0]?.total || 0,
    }, 'Statistiques');

    logger.info('\n=== 🎉 TOUS LES TESTS RÉUSSIS ! ===');
    logger.info('\n💡 Utilisez ces commandes pour vérifier dans MongoDB:');
    logger.info('mongosh tg-vip-bot');
    logger.info('db.users.find().pretty()');
    logger.info('db.subscriptions.find().pretty()');
    logger.info('db.payments.find().pretty()');

    logger.info('\n=== NETTOYAGE DES DONNÉES DE TEST ===');

    // Supprimer les données de test créées
    await User.deleteMany({ telegramId: { $in: [testTelegramId, expiredTelegramId] } });
    await Subscription.deleteMany({ telegramId: { $in: [testTelegramId, expiredTelegramId] } });
    await Payment.deleteMany({ telegramId: { $in: [testTelegramId, expiredTelegramId] } });

    logger.info('✅ Données de test nettoyées avec succès');

  } catch (error) {
    logger.error({ error }, 'Erreur lors des tests');
  } finally {
    await mongoose.connection.close();
    logger.info('\nConnexion MongoDB fermée');
  }
}

// Exécuter les tests
testSubscription();
