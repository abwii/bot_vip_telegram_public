import { Telegraf, Markup } from 'telegraf';
import { config } from '../config';
import { VipManager } from './vip';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';
import { PricingConfig } from '../models/PricingConfig';
import { PaymentProvider } from '../models/PaymentProvider';
// import { Payment } from '../models/Payment';
import { paypalService } from '../payments/paypal';
import { revolutService } from '../payments/revolut';
import { stripeService } from '../payments/stripe';
import { logger } from '../index';
import { PLAN_DISPLAY_NAMES, PLAN_SHORT_DESCRIPTIONS } from '../utils/planDisplayNames';

export class TelegramBot {
  public bot: Telegraf;
  public vipManager: VipManager;

  constructor() {
    this.bot = new Telegraf(config.telegram.token);
    this.vipManager = new VipManager(this.bot);
    this.setupCommands();
    this.setupHandlers();
    this.setupChatMemberHandlers();
  }

  // Helper method to get enabled payment providers
  private async getEnabledProviders(): Promise<string> {
    try {
      const providers = await PaymentProvider.find({ enabled: true }).sort({ name: 1 });

      if (providers.length === 0) {
        return '• Aucun moyen de paiement disponible pour le moment';
      }

      const providerEmojis: Record<string, string> = {
        paypal: '💳',
        revolut: '💰',
        stripe: '💎',
      };

      return providers
        .map(provider => `${providerEmojis[provider.name] || '•'} ${provider.displayName}`)
        .join('\n');
    } catch (error) {
      logger.error({ error }, 'Error fetching enabled providers');
      return '• PayPal\n• Revolut\n• Stripe';
    }
  }

  // Helper method to get prices from database
  private async getPrices(provider: 'paypal' | 'revolut' | 'stripe' = 'paypal'): Promise<{ monthly: number; quarterly: number; sixmonth: number; yearly: number }> {
    try {
      const prices = await PricingConfig.find({
        $or: [
          { provider: 'all' },
          { provider }
        ]
      });

      // Prioritize provider-specific prices over 'all'
      const getPrice = (plan: 'monthly' | 'quarterly' | 'sixmonth' | 'yearly') => {
        const providerPrice = prices.find(p => p.plan === plan && p.provider === provider);
        const allPrice = prices.find(p => p.plan === plan && p.provider === 'all');
        return providerPrice?.price ?? allPrice?.price ?? 0;
      };

      return {
        monthly: getPrice('monthly'),
        quarterly: getPrice('quarterly'),
        sixmonth: getPrice('sixmonth'),
        yearly: getPrice('yearly'),
      };
    } catch (error) {
      logger.error({ error }, 'Error fetching prices from database');
      // Fallback to default prices if database fails
      return {
        monthly: 29.90,
        quarterly: 79.90,
        sixmonth: 149.90,
        yearly: 279.90,
      };
    }
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
        `Utilisez le menu ci-dessous ou les commandes suivantes :`,
        Markup.keyboard([
          ['💎 S\'abonner', '📊 Mon statut'],
          ['📋 Voir les plans', '❌ Annuler abonnement'],
          ['📖 Aide'],
        ])
        .resize()
        .persistent()
      );
    });

    // Commande d'abonnement
    this.bot.command('subscribe', async (ctx) => {
      const prices = await this.getPrices();
      await ctx.reply(
        '💎 Choisissez votre plan VIP :',
        Markup.inlineKeyboard([
          [Markup.button.callback(`${PLAN_DISPLAY_NAMES.monthly} (${PLAN_SHORT_DESCRIPTIONS.monthly}) - ${prices.monthly.toFixed(2)}€`, 'plan_monthly')],
          [Markup.button.callback(`${PLAN_DISPLAY_NAMES.quarterly} (${PLAN_SHORT_DESCRIPTIONS.quarterly}) - ${prices.quarterly.toFixed(2)}€`, 'plan_quarterly')],
          [Markup.button.callback(`${PLAN_DISPLAY_NAMES.sixmonth} (${PLAN_SHORT_DESCRIPTIONS.sixmonth}) - ${prices.sixmonth.toFixed(2)}€`, 'plan_sixmonth')],
          [Markup.button.callback(`${PLAN_DISPLAY_NAMES.yearly} (${PLAN_SHORT_DESCRIPTIONS.yearly}) - ${prices.yearly.toFixed(2)}€`, 'plan_yearly')],
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
      const prices = await this.getPrices();
      const rookieTotal3 = prices.monthly * 3;
      const rookieTotal6 = prices.monthly * 6;
      const rookieTotal12 = prices.monthly * 12;
      const sophomoreSavings = (rookieTotal3 - prices.quarterly).toFixed(2);
      const allstarSavings = (rookieTotal6 - prices.sixmonth).toFixed(2);
      const mvpSavings = (rookieTotal12 - prices.yearly).toFixed(2);

      await ctx.reply(
        '💎 Plans VIP disponibles :\n\n' +
        `${PLAN_DISPLAY_NAMES.monthly} - ${prices.monthly.toFixed(2)}€ (${PLAN_SHORT_DESCRIPTIONS.monthly})\n` +
        '• Accès complet au groupe VIP\n' +
        '• Support prioritaire\n' +
        '• Contenu exclusif\n\n' +
        `${PLAN_DISPLAY_NAMES.quarterly} - ${prices.quarterly.toFixed(2)}€ (${PLAN_SHORT_DESCRIPTIONS.quarterly})\n` +
        `• Économisez ${sophomoreSavings}€\n` +
        '• Tous les avantages ROOKIE\n\n' +
        `${PLAN_DISPLAY_NAMES.sixmonth} - ${prices.sixmonth.toFixed(2)}€ (${PLAN_SHORT_DESCRIPTIONS.sixmonth})\n` +
        `• Économisez ${allstarSavings}€\n` +
        '• Tous les avantages ROOKIE\n\n' +
        `${PLAN_DISPLAY_NAMES.yearly} - ${prices.yearly.toFixed(2)}€ (${PLAN_SHORT_DESCRIPTIONS.yearly})\n` +
        `• Économisez ${mvpSavings}€\n` +
        '• Tous les avantages ROOKIE\n\n' +
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
      const paymentMethods = await this.getEnabledProviders();

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
        'Moyens de paiement :\n' +
        paymentMethods + '\n\n' +
        '❓ Besoin d\'aide ? Contactez @abwi_pv'
      );
    });

    // Commande /testvip - DEBUG: Accorde 7 jours VIP (à retirer en prod)
    this.bot.command('testvip', async (ctx) => {
      const user = ctx.from;
      if (!user) return;

      try {
        // Accorder 7 jours de VIP directement
        await this.vipManager.grantVipAccess(user.id, 7);

        logger.info(`[DEBUG] User ${user.id} (${user.username}) granted 7-day VIP via /testvip`);

        await ctx.reply(
          '🎉 [TEST] VIP accordé pour 7 jours !\n\n' +
          '📅 Expire le ' +
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR')
        );

      } catch (error) {
        logger.error({ error, telegramId: user.id }, 'Error in /testvip command');
        await ctx.reply('❌ Erreur lors de l\'activation du test VIP');
      }
    });

  }

  private setupHandlers(): void {
    // Gestion des messages texte pour les boutons du clavier
    this.bot.hears('💎 S\'abonner', async (ctx) => {
      const prices = await this.getPrices();
      await ctx.reply(
        '💎 Choisissez votre plan VIP :',
        Markup.inlineKeyboard([
          [Markup.button.callback(`${PLAN_DISPLAY_NAMES.monthly} (${PLAN_SHORT_DESCRIPTIONS.monthly}) - ${prices.monthly.toFixed(2)}€`, 'plan_monthly')],
          [Markup.button.callback(`${PLAN_DISPLAY_NAMES.quarterly} (${PLAN_SHORT_DESCRIPTIONS.quarterly}) - ${prices.quarterly.toFixed(2)}€`, 'plan_quarterly')],
          [Markup.button.callback(`${PLAN_DISPLAY_NAMES.sixmonth} (${PLAN_SHORT_DESCRIPTIONS.sixmonth}) - ${prices.sixmonth.toFixed(2)}€`, 'plan_sixmonth')],
          [Markup.button.callback(`${PLAN_DISPLAY_NAMES.yearly} (${PLAN_SHORT_DESCRIPTIONS.yearly}) - ${prices.yearly.toFixed(2)}€`, 'plan_yearly')],
        ])
      );
    });

    this.bot.hears('📊 Mon statut', async (ctx) => {
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

    this.bot.hears('📋 Voir les plans', async (ctx) => {
      const prices = await this.getPrices();
      const rookieTotal3 = prices.monthly * 3;
      const rookieTotal6 = prices.monthly * 6;
      const rookieTotal12 = prices.monthly * 12;
      const sophomoreSavings = (rookieTotal3 - prices.quarterly).toFixed(2);
      const allstarSavings = (rookieTotal6 - prices.sixmonth).toFixed(2);
      const mvpSavings = (rookieTotal12 - prices.yearly).toFixed(2);

      await ctx.reply(
        '💎 Plans VIP disponibles :\n\n' +
        `${PLAN_DISPLAY_NAMES.monthly} - ${prices.monthly.toFixed(2)}€ (${PLAN_SHORT_DESCRIPTIONS.monthly})\n` +
        '• Accès complet au groupe VIP\n' +
        '• Support prioritaire\n' +
        '• Contenu exclusif\n\n' +
        `${PLAN_DISPLAY_NAMES.quarterly} - ${prices.quarterly.toFixed(2)}€ (${PLAN_SHORT_DESCRIPTIONS.quarterly})\n` +
        `• Économisez ${sophomoreSavings}€\n` +
        '• Tous les avantages ROOKIE\n\n' +
        `${PLAN_DISPLAY_NAMES.sixmonth} - ${prices.sixmonth.toFixed(2)}€ (${PLAN_SHORT_DESCRIPTIONS.sixmonth})\n` +
        `• Économisez ${allstarSavings}€\n` +
        '• Tous les avantages ROOKIE\n\n' +
        `${PLAN_DISPLAY_NAMES.yearly} - ${prices.yearly.toFixed(2)}€ (${PLAN_SHORT_DESCRIPTIONS.yearly})\n` +
        `• Économisez ${mvpSavings}€\n` +
        '• Tous les avantages ROOKIE\n\n' +
        'Utilisez /subscribe pour commencer !'
      );
    });

    this.bot.hears('❌ Annuler abonnement', async (ctx) => {
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

    this.bot.hears('📖 Aide', async (ctx) => {
      const paymentMethods = await this.getEnabledProviders();

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
        paymentMethods + '\n\n' +
        '❓ Besoin d\'aide ? Contactez @abwi_pv'
      );
    });

    // Gestion des callbacks pour les plans
    this.bot.action(/plan_(monthly|quarterly|sixmonth|yearly)/, async (ctx) => {
      const plan = ctx.match[1] as 'monthly' | 'quarterly' | 'sixmonth' | 'yearly';

      await ctx.answerCbQuery();

      // Récupérer les providers activés depuis la base de données
      const enabledProviders = await PaymentProvider.find({ enabled: true }).sort({ name: 1 });

      // Créer les boutons dynamiquement en fonction des providers activés
      const providerButtons = enabledProviders.map(provider => {
        let emoji = '💳';
        if (provider.name === 'revolut') emoji = '💰';
        if (provider.name === 'stripe') emoji = '💎';

        return [Markup.button.callback(`${emoji} ${provider.displayName}`, `payment_${provider.name}_${plan}`)];
      });

      // Ajouter le bouton Annuler
      providerButtons.push([Markup.button.callback('❌ Annuler', 'payment_cancel')]);

      await ctx.reply(
        'Choisissez votre méthode de paiement :',
        Markup.inlineKeyboard(providerButtons)
      );
    });

    // Gestion des paiements PayPal
    this.bot.action(/payment_paypal_(monthly|quarterly|sixmonth|yearly)/, async (ctx) => {
      const plan = ctx.match[1] as 'monthly' | 'quarterly' | 'sixmonth' | 'yearly';
      const user = ctx.from;
      if (!user) return;

      await ctx.answerCbQuery();
      await ctx.reply('⏳ Création de votre commande PayPal...');

      try {
        const amounts = await this.getPrices('paypal');

        logger.info({
          userId: user.id,
          username: user.username,
          plan,
          amount: amounts[plan]
        }, 'User initiating PayPal payment');

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

        if (!approveLink) {
          logger.error({
            orderId: order.id,
            links: order.links
          }, 'PayPal order created but no approve link found');
          await ctx.reply('❌ Erreur lors de la création de la commande (pas de lien d\'approbation). Veuillez réessayer.');
          return;
        }

        logger.info({
          orderId: order.id,
          userId: user.id,
          approveUrl: approveLink.href
        }, 'PayPal order created and sent to user');

        await ctx.reply(
          `✅ Commande créée !\n\n` +
          `Cliquez sur le lien ci-dessous pour payer :\n` +
          `${approveLink.href}\n\n` +
          `Une fois le paiement effectué, votre accès VIP sera activé automatiquement.`,
          Markup.inlineKeyboard([
            [Markup.button.url('💳 Payer avec PayPal', approveLink.href)],
            [Markup.button.callback('❌ Annuler la commande', 'payment_cancel')],
          ])
        );
      } catch (error) {
        const errorLog: any = {
          userId: user.id,
          username: user.username,
          plan
        };

        let userMessage = '❌ Erreur lors de la création de la commande. Veuillez réessayer.';

        if (error instanceof Error) {
          errorLog.errorMessage = error.message;
          errorLog.errorStack = error.stack;
          errorLog.errorName = error.name;

          // Messages d'erreur plus spécifiques pour l'utilisateur
          if (error.message.includes('timeout')) {
            userMessage = '❌ La demande a pris trop de temps. Vérifiez votre connexion et réessayez.';
          } else if (error.message.includes('network') || error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
            userMessage = '❌ Problème de connexion avec PayPal. Veuillez réessayer dans quelques instants.';
          } else if (error.message.includes('credentials') || error.message.includes('configuration')) {
            userMessage = '❌ Service de paiement temporairement indisponible. Veuillez contacter le support.';
          } else if (error.message.includes('401') || error.message.includes('403')) {
            userMessage = '❌ Problème d\'authentification avec PayPal. Veuillez contacter le support.';
          } else if (error.message.includes('400')) {
            userMessage = '❌ Données de commande invalides. Veuillez contacter le support.';
          }
        } else {
          errorLog.errorValue = String(error);
        }

        logger.error(errorLog, 'PayPal order creation error in bot handler');
        await ctx.reply(userMessage + '\n\nSi le problème persiste, contactez @abwi_pv');
      }
    });

    // Gestion des paiements Revolut
    this.bot.action(/payment_revolut_(monthly|quarterly|sixmonth|yearly)/, async (ctx) => {
      const plan = ctx.match[1] as 'monthly' | 'quarterly' | 'sixmonth' | 'yearly';
      const user = ctx.from;
      if (!user) return;

      await ctx.answerCbQuery();
      await ctx.reply('⏳ Création de votre commande Revolut...');

      try {
        const amounts = await this.getPrices('revolut');

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
            [Markup.button.callback('❌ Annuler la commande', 'payment_cancel')],
          ])
        );
      } catch (error) {
        logger.error({ error }, 'Revolut order creation error');
        await ctx.reply('❌ Erreur lors de la création de la commande. Veuillez réessayer.');
      }
    });

    // Gestion des paiements Stripe
    this.bot.action(/payment_stripe_(monthly|quarterly|sixmonth|yearly)/, async (ctx) => {
      const plan = ctx.match[1] as 'monthly' | 'quarterly' | 'sixmonth' | 'yearly';
      const user = ctx.from;
      if (!user) return;

      await ctx.answerCbQuery();
      await ctx.reply('⏳ Création de votre session de paiement Stripe...');

      try {
        const amounts = await this.getPrices('stripe');

        const planNames = {
          monthly: `Abonnement ${PLAN_DISPLAY_NAMES.monthly}`,
          quarterly: `Abonnement ${PLAN_DISPLAY_NAMES.quarterly}`,
          sixmonth: `Abonnement ${PLAN_DISPLAY_NAMES.sixmonth}`,
          yearly: `Abonnement ${PLAN_DISPLAY_NAMES.yearly}`,
        };

        const planDurations = {
          monthly: 30,
          quarterly: 90,
          sixmonth: 180,
          yearly: 365,
        };

        const session = await stripeService.createCheckoutSession(
          amounts[plan],
          'EUR',
          {
            telegramId: user.id.toString(),
            plan,
            username: user.username || '',
            planName: planNames[plan],
            planDescription: `Accès VIP pour ${planDurations[plan]} jours`,
          }
        );

        await ctx.reply(
          `✅ Session de paiement créée !\n\n` +
          `Cliquez sur le lien ci-dessous pour payer :\n` +
          `${session.url}\n\n` +
          `Une fois le paiement effectué, votre accès VIP sera activé automatiquement.`,
          Markup.inlineKeyboard([
            [Markup.button.url('💎 Payer avec Stripe', session.url)],
            [Markup.button.callback('❌ Annuler la commande', 'payment_cancel')],
          ])
        );
      } catch (error) {
        logger.error({ error }, 'Stripe checkout session creation error');
        await ctx.reply('❌ Erreur lors de la création de la session de paiement. Veuillez réessayer.');
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

        // Mettre à jour l'abonnement en base de données d'abord
        subscription.status = 'cancelled';
        subscription.autoRenew = false;
        await subscription.save();

        // Essayer d'annuler sur le provider de paiement si c'est un vrai abonnement récurrent
        // Note: Pour les paiements one-time, externalSubscriptionId est l'ID de commande/paiement,
        // pas un ID d'abonnement, donc l'annulation échouera (ce qui est normal)
        if (subscription.externalSubscriptionId && subscription.autoRenew) {
          try {
            if (subscription.paymentProvider === 'paypal') {
              await paypalService.cancelSubscription(
                subscription.externalSubscriptionId,
                'User requested cancellation'
              );
              logger.info({ subscriptionId: subscription.externalSubscriptionId }, 'PayPal subscription cancelled');
            } else if (subscription.paymentProvider === 'revolut') {
              await revolutService.cancelOrder(subscription.externalSubscriptionId);
              logger.info({ orderId: subscription.externalSubscriptionId }, 'Revolut order cancelled');
            }
          } catch (externalError) {
            // L'annulation externe a échoué, mais ce n'est pas grave car l'abonnement est déjà
            // marqué comme annulé en DB. Cela arrive souvent avec les paiements one-time.
            logger.info(
              {
                error: externalError,
                subscriptionId: subscription.externalSubscriptionId,
                provider: subscription.paymentProvider,
                autoRenew: subscription.autoRenew
              },
              'External subscription cancellation failed (this is normal for one-time payments)'
            );
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

    // Gestion de l'annulation de commande
    this.bot.action('payment_cancel', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply(
        '✅ Commande annulée.\n\n' +
        'Vous pouvez créer une nouvelle commande à tout moment avec /subscribe'
      );
    });

    // Gestion des erreurs
    this.bot.catch((err, ctx) => {
      logger.error({ error: err }, 'Bot error');
      ctx.reply('❌ Une erreur s\'est produite. Veuillez réessayer plus tard.');
    });
  }

  private setupChatMemberHandlers(): void {
    // Handler pour surveiller les changements de membres dans le groupe VIP
    this.bot.on('chat_member', async (ctx) => {
      try {
        const chatId = ctx.chat.id.toString();
        const update = ctx.chatMember;

        // Vérifier que c'est le groupe VIP
        if (chatId !== config.telegram.vipChatId) {
          return;
        }

        const userId = update.new_chat_member.user.id;
        const newStatus = update.new_chat_member.status;
        const oldStatus = update.old_chat_member.status;

        // Détecter quand quelqu'un rejoint le groupe
        if (
          (oldStatus === 'left' || oldStatus === 'kicked') &&
          (newStatus === 'member' || newStatus === 'restricted')
        ) {
          logger.info(`User ${userId} is joining VIP chat, checking VIP status...`);

          // Vérifier le statut VIP
          const isVip = await this.vipManager.checkVipStatus(userId);

          if (!isVip) {
            logger.warn(`Non-VIP user ${userId} tried to join VIP chat, removing...`);

            // Bannir immédiatement
            await this.bot.telegram.banChatMember(chatId, userId);

            // Débanner pour permettre une future inscription
            await this.bot.telegram.unbanChatMember(chatId, userId);

            // Notifier l'utilisateur
            try {
              await this.bot.telegram.sendMessage(
                userId,
                '❌ Vous ne pouvez pas rejoindre le groupe VIP sans statut VIP actif.\n\n' +
                'Votre lien d\'invitation a expiré ou votre statut VIP a été révoqué.\n\n' +
                'Utilisez /subscribe pour vous abonner.'
              );
            } catch (error) {
              logger.error({ error }, `Failed to notify user ${userId} about VIP requirement`);
            }

            logger.info(`Non-VIP user ${userId} removed from VIP chat`);
          } else {
            logger.info(`VIP user ${userId} successfully joined VIP chat`);
          }
        }
      } catch (error) {
        logger.error({ error }, 'Error in chat_member handler');
      }
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
