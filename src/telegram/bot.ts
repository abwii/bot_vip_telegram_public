import { Telegraf, Markup } from 'telegraf';
import { config } from '../config';
import { VipManager } from './vip';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';
// import { Payment } from '../models/Payment';
import { paypalService } from '../payments/paypal';
import { revolutService } from '../payments/revolut';
import { logger } from '../index';

export class TelegramBot {
  public bot: Telegraf;
  public vipManager: VipManager;

  constructor() {
    this.bot = new Telegraf(config.telegram.token);
    this.vipManager = new VipManager(this.bot);
    this.setupCommands();
    this.setupHandlers();
  }

  private setupCommands(): void {
    // Commande de démarrage
    this.bot.command('start', async (ctx) => {
      const user = ctx.from;
      if (!user) return;

      // Créer ou mettre à jour l'utilisateur
      await User.findOneAndUpdate(
        { telegramId: user.id },
        {
          telegramId: user.id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
        },
        { upsert: true, new: true }
      );

      await ctx.reply(
        `👋 Bienvenue ${user.first_name} !\n\n` +
        `Je suis votre assistant pour gérer l'accès VIP.\n\n` +
        `Commandes disponibles :\n` +
        `/subscribe - S'abonner au service VIP\n` +
        `/status - Voir votre statut VIP\n` +
        `/plans - Voir les plans disponibles\n` +
        `/cancel - Annuler votre abonnement\n` +
        `/unsubscribe - Se désinscrire du VIP\n` +
        `/help - Aide`
      );
    });

    // Commande d'abonnement
    this.bot.command('subscribe', async (ctx) => {
      await ctx.reply(
        '💎 Choisissez votre plan VIP :',
        Markup.inlineKeyboard([
          [Markup.button.callback('Mensuel - 9.99€', 'plan_monthly')],
          [Markup.button.callback('Trimestriel - 24.99€', 'plan_quarterly')],
          [Markup.button.callback('Annuel - 89.99€', 'plan_yearly')],
        ])
      );
    });

    // Commande de statut
    this.bot.command('status', async (ctx) => {
      const user = ctx.from;
      if (!user) return;

      const dbUser = await User.findOne({ telegramId: user.id });

      if (!dbUser || !dbUser.isVip) {
        await ctx.reply(
          '❌ Vous n\'avez pas d\'accès VIP actif.\n\n' +
          'Utilisez /subscribe pour vous abonner.'
        );
        return;
      }

      const isValid = await this.vipManager.checkVipStatus(user.id);

      if (!isValid) {
        await ctx.reply(
          '❌ Votre accès VIP a expiré.\n\n' +
          'Utilisez /subscribe pour renouveler.'
        );
        return;
      }

      const subscription = await Subscription.findOne({
        telegramId: user.id,
        status: 'active',
      }).sort({ createdAt: -1 });

      await ctx.reply(
        `✅ Statut VIP : Actif\n\n` +
        `📅 Expire le : ${dbUser.vipUntil?.toLocaleDateString('fr-FR')}\n` +
        `📦 Plan : ${subscription?.plan || 'N/A'}\n` +
        `🔄 Renouvellement auto : ${subscription?.autoRenew ? 'Oui' : 'Non'}`
      );
    });

    // Commande des plans
    this.bot.command('plans', async (ctx) => {
      await ctx.reply(
        '💎 Plans VIP disponibles :\n\n' +
        '📅 Mensuel - 9.99€/mois\n' +
        '• Accès complet au groupe VIP\n' +
        '• Support prioritaire\n' +
        '• Contenu exclusif\n\n' +
        '📅 Trimestriel - 24.99€ (3 mois)\n' +
        '• Économisez 5€\n' +
        '• Tous les avantages mensuels\n\n' +
        '📅 Annuel - 89.99€ (12 mois)\n' +
        '• Économisez 30€\n' +
        '• Tous les avantages mensuels\n\n' +
        'Utilisez /subscribe pour commencer !'
      );
    });

    // Commande d'annulation
    this.bot.command('cancel', async (ctx) => {
      const user = ctx.from;
      if (!user) return;

      const subscription = await Subscription.findOne({
        telegramId: user.id,
        status: 'active',
      }).sort({ createdAt: -1 });

      if (!subscription) {
        await ctx.reply('❌ Aucun abonnement actif trouvé.');
        return;
      }

      await ctx.reply(
        '⚠️ Êtes-vous sûr de vouloir annuler votre abonnement ?\n\n' +
        'Vous conserverez l\'accès VIP jusqu\'à la fin de votre période payée.',
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Confirmer', `cancel_confirm_${subscription._id}`),
            Markup.button.callback('❌ Annuler', 'cancel_abort'),
          ],
        ])
      );
    });

    // Commande de désinscription
    this.bot.command('unsubscribe', async (ctx) => {
      const user = ctx.from;
      if (!user) return;

      const dbUser = await User.findOne({ telegramId: user.id });

      if (!dbUser || !dbUser.isVip) {
        await ctx.reply(
          '❌ Vous n\'avez pas d\'accès VIP actif.\n\n' +
          'Rien à désinscrire.'
        );
        return;
      }

      await ctx.reply(
        '⚠️ Êtes-vous sûr de vouloir vous désinscrire du VIP ?\n\n' +
        '• Votre accès VIP sera immédiatement révoqué\n' +
        '• Vous serez retiré du groupe VIP\n' +
        '• Cette action est irréversible\n\n' +
        'Si vous avez un abonnement actif, pensez à utiliser /cancel pour l\'annuler d\'abord.',
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Confirmer la désinscription', 'unsubscribe_confirm'),
            Markup.button.callback('❌ Annuler', 'unsubscribe_abort'),
          ],
        ])
      );
    });

    // Commande d'aide
    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        '📖 Aide - Bot VIP\n\n' +
        'Commandes disponibles :\n\n' +
        '/start - Commencer\n' +
        '/subscribe - S\'abonner au VIP\n' +
        '/status - Voir votre statut\n' +
        '/plans - Plans disponibles\n' +
        '/cancel - Annuler l\'abonnement\n' +
        '/unsubscribe - Se désinscrire du VIP\n' +
        '/help - Cette aide\n\n' +
        '💳 Moyens de paiement :\n' +
        '• PayPal\n' +
        '• Revolut\n\n' +
        '❓ Besoin d\'aide ? Contactez @support'
      );
    });

    // Commande de test (bypass paiement) - à retirer en production
    this.bot.command('testvip', async (ctx) => {
      const user = ctx.from;
      if (!user) return;

      await ctx.reply('🧪 Mode test activé - Attribution de l\'accès VIP...');

      try {
        // Créer ou mettre à jour l'utilisateur
        await User.findOneAndUpdate(
          { telegramId: user.id },
          {
            telegramId: user.id,
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name,
          },
          { upsert: true, new: true }
        );

        // Accorder l'accès VIP pour 30 jours (plan mensuel)
        await this.vipManager.grantVipAccess(user.id, 30);

        // Créer un abonnement de test en base de données
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 30);

        const subscription = new Subscription({
          userId: (await User.findOne({ telegramId: user.id }))?._id,
          telegramId: user.id,
          plan: 'monthly',
          status: 'active',
          startDate,
          endDate,
          paymentProvider: 'test',
          externalSubscriptionId: `test_${user.id}_${Date.now()}`,
        });

        await subscription.save();

        logger.info(`Test VIP access granted to user ${user.id}`);

        await ctx.reply(
          '✅ Accès VIP de test accordé avec succès !\n\n' +
          `📅 Expire le : ${endDate.toLocaleDateString('fr-FR')}\n` +
          `📦 Plan : Mensuel (test)\n\n` +
          'Utilisez /status pour vérifier votre statut.'
        );
      } catch (error) {
        logger.error({ error }, 'Test VIP grant error');
        await ctx.reply('❌ Erreur lors de l\'attribution de l\'accès VIP de test.');
      }
    });
  }

  private setupHandlers(): void {
    // Gestion des callbacks pour les plans
    this.bot.action(/plan_(monthly|quarterly|yearly)/, async (ctx) => {
      const plan = ctx.match[1] as 'monthly' | 'quarterly' | 'yearly';

      await ctx.answerCbQuery();
      await ctx.reply(
        'Choisissez votre méthode de paiement :',
        Markup.inlineKeyboard([
          [Markup.button.callback('💳 PayPal', `payment_paypal_${plan}`)],
          [Markup.button.callback('💰 Revolut', `payment_revolut_${plan}`)],
        ])
      );
    });

    // Gestion des paiements PayPal
    this.bot.action(/payment_paypal_(monthly|quarterly|yearly)/, async (ctx) => {
      const plan = ctx.match[1] as 'monthly' | 'quarterly' | 'yearly';
      const user = ctx.from;
      if (!user) return;

      await ctx.answerCbQuery();
      await ctx.reply('⏳ Création de votre commande PayPal...');

      try {
        const amounts = {
          monthly: 9.99,
          quarterly: 24.99,
          yearly: 89.99,
        };

        const order = await paypalService.createOrder(
          amounts[plan],
          'EUR',
          {
            telegramId: user.id,
            plan,
            username: user.username,
          }
        );

        const approveLink = order.links.find(link => link.rel === 'approve');

        if (approveLink) {
          await ctx.reply(
            `✅ Commande créée !\n\n` +
            `Cliquez sur le lien ci-dessous pour payer :\n` +
            `${approveLink.href}\n\n` +
            `Une fois le paiement effectué, votre accès VIP sera activé automatiquement.`,
            Markup.inlineKeyboard([
              [Markup.button.url('💳 Payer avec PayPal', approveLink.href)],
            ])
          );
        }
      } catch (error) {
        logger.error({ error }, 'PayPal order creation error');
        await ctx.reply('❌ Erreur lors de la création de la commande. Veuillez réessayer.');
      }
    });

    // Gestion des paiements Revolut
    this.bot.action(/payment_revolut_(monthly|quarterly|yearly)/, async (ctx) => {
      const plan = ctx.match[1] as 'monthly' | 'quarterly' | 'yearly';
      const user = ctx.from;
      if (!user) return;

      await ctx.answerCbQuery();
      await ctx.reply('⏳ Création de votre commande Revolut...');

      try {
        const amounts = {
          monthly: 9.99,
          quarterly: 24.99,
          yearly: 89.99,
        };

        const order = await revolutService.createOrder(
          amounts[plan],
          'EUR',
          {
            telegramId: user.id,
            plan,
            username: user.username,
          }
        );

        await ctx.reply(
          `✅ Commande créée !\n\n` +
          `Cliquez sur le lien ci-dessous pour payer :\n` +
          `${order.checkout_url}\n\n` +
          `Une fois le paiement effectué, votre accès VIP sera activé automatiquement.`,
          Markup.inlineKeyboard([
            [Markup.button.url('💰 Payer avec Revolut', order.checkout_url)],
          ])
        );
      } catch (error) {
        logger.error({ error }, 'Revolut order creation error');
        await ctx.reply('❌ Erreur lors de la création de la commande. Veuillez réessayer.');
      }
    });

    // Gestion de l'annulation d'abonnement
    this.bot.action(/cancel_confirm_(.+)/, async (ctx) => {
      const subscriptionId = ctx.match[1];
      const user = ctx.from;
      if (!user) return;

      await ctx.answerCbQuery();

      try {
        const subscription = await Subscription.findById(subscriptionId);

        if (!subscription) {
          await ctx.reply('❌ Abonnement non trouvé.');
          return;
        }

        subscription.status = 'cancelled';
        subscription.autoRenew = false;
        await subscription.save();

        // Annuler sur le provider de paiement si nécessaire
        if (subscription.externalSubscriptionId) {
          if (subscription.paymentProvider === 'paypal') {
            await paypalService.cancelSubscription(
              subscription.externalSubscriptionId,
              'User requested cancellation'
            );
          } else if (subscription.paymentProvider === 'revolut') {
            await revolutService.cancelOrder(subscription.externalSubscriptionId);
          }
        }

        await ctx.reply(
          '✅ Votre abonnement a été annulé.\n\n' +
          `Vous conserverez l'accès VIP jusqu'au ${subscription.endDate.toLocaleDateString('fr-FR')}.`
        );
      } catch (error) {
        logger.error({ error }, 'Subscription cancellation error');
        await ctx.reply('❌ Erreur lors de l\'annulation. Veuillez contacter le support.');
      }
    });

    this.bot.action('cancel_abort', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('✅ Annulation abandonnée. Votre abonnement reste actif.');
    });

    // Gestion de la désinscription VIP
    this.bot.action('unsubscribe_confirm', async (ctx) => {
      const user = ctx.from;
      if (!user) return;

      await ctx.answerCbQuery();

      try {
        // Révoquer l'accès VIP
        const revokedUser = await this.vipManager.revokeVipAccess(user.id);

        if (!revokedUser) {
          await ctx.reply('❌ Utilisateur non trouvé.');
          return;
        }

        // Marquer tous les abonnements comme annulés
        await Subscription.updateMany(
          { telegramId: user.id, status: 'active' },
          { status: 'cancelled', autoRenew: false }
        );

        logger.info(`User ${user.id} unsubscribed from VIP`);

        await ctx.reply(
          '✅ Vous avez été désinscrit du VIP avec succès.\n\n' +
          '• Votre accès VIP a été révoqué\n' +
          '• Vous avez été retiré du groupe VIP\n\n' +
          'Vous pouvez vous réabonner à tout moment avec /subscribe'
        );
      } catch (error) {
        logger.error({ error }, 'Unsubscribe error');
        await ctx.reply('❌ Erreur lors de la désinscription. Veuillez contacter le support.');
      }
    });

    this.bot.action('unsubscribe_abort', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('✅ Désinscription annulée. Votre accès VIP reste actif.');
    });

    // Gestion des erreurs
    this.bot.catch((err, ctx) => {
      logger.error({ error: err }, 'Bot error');
      ctx.reply('❌ Une erreur s\'est produite. Veuillez réessayer plus tard.');
    });
  }

  async start(): Promise<void> {
    try {
      await this.bot.launch({
        dropPendingUpdates: true,
      });
      logger.info('Telegram bot started successfully');
      logger.info(`Bot username: @${this.bot.botInfo?.username}`);
    } catch (error) {
      logger.error({ error }, 'Failed to start Telegram bot');
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.bot.stop();
    logger.info('Telegram bot stopped');
  }
}
