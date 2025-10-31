import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import pino from 'pino';
import path from 'path';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { TelegramBot } from './telegram/bot';
import { schedulerService } from './scheduler/agenda';
import { paypalService } from './payments/paypal';
import { revolutService } from './payments/revolut';
import { stripeService } from './payments/stripe';
import { User } from './models/User';
import { Subscription } from './models/Subscription';
import { Payment } from './models/Payment';
import { PricingConfig } from './models/PricingConfig';
import { initializeDefaultPlanNames } from './models/PlanDisplayName';
import adminRoutes from './admin/routes';

// Logger
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

// Express app
const app = express();

// Telegram bot
let bot: TelegramBot;

// Configuration des routes de base (avant les routes admin qui nécessitent les sessions)
function setupBasicRoutes() {
  // Trust proxy - important pour Railway et autres services derrière un reverse proxy
  app.set('trust proxy', 1);

  // Basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Servir les fichiers statiques
  app.use(express.static(path.join(__dirname, '../public')));

  // Middleware de logging (exclure les routes admin API pour réduire le bruit)
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/admin/api/')) {
      logger.info(`${req.method} ${req.path} - Query: ${JSON.stringify(req.query)}`);
    }
    next();
  });

  // Root route - serve index.html
  app.get('/', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Public API - Get pricing (no authentication required)
  app.get('/api/pricing', async (_req: Request, res: Response) => {
    try {
      const prices = await PricingConfig.find({ provider: 'all' }).sort({ plan: 1 });
      res.json(prices);
    } catch (error) {
      logger.error({ error }, 'Error fetching public pricing');
      res.status(500).json({ error: 'Error fetching pricing' });
    }
  });

  // Public API - Get plan display names (no authentication required)
  app.get('/api/plans', async (_req: Request, res: Response) => {
    try {
      const { PlanDisplayName } = await import('./models/PlanDisplayName');
      const planNames = await PlanDisplayName.find({ isActive: true }).sort({ sortOrder: 1 });
      const prices = await PricingConfig.find({ provider: 'all' }).sort({ plan: 1 });

      // Combiner les noms et les prix
      const plansWithPrices = planNames.map(planName => {
        const price = prices.find(p => p.plan === planName.plan);
        return {
          plan: planName.plan,
          displayName: planName.displayName,
          emoji: planName.emoji,
          description: planName.description,
          features: planName.features,
          price: price?.price || 0,
          currency: price?.currency || 'EUR',
          duration: planName.plan === 'monthly' ? '1 mois' :
                    planName.plan === 'quarterly' ? '3 mois' :
                    planName.plan === 'sixmonth' ? '6 mois' : '12 mois',
          sortOrder: planName.sortOrder,
        };
      });

      res.json(plansWithPrices);
    } catch (error) {
      logger.error({ error }, 'Error fetching plan names');
      res.status(500).json({ error: 'Error fetching plan names' });
    }
  });

  // PayPal success/cancel redirects (ne nécessitent pas de sessions)
  app.get('/payments/paypal/success', async (req: Request, res: Response) => {
    logger.info('PayPal success page accessed');

    const token = req.query.token as string;

    if (token) {
      logger.info({ token }, 'Processing PayPal payment from success page');

      // Traiter le paiement en arrière-plan (ne pas bloquer la réponse)
      processPayPalPayment(token).catch(error => {
        logger.error({ error, token }, 'Failed to process PayPal payment from success page');
      });
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Paiement réussi</title>
        <meta charset="UTF-8">
      </head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h1>✅ Paiement réussi !</h1>
        <p>Votre accès VIP sera activé dans quelques instants.</p>
        <p>Vous pouvez fermer cette page et retourner sur Telegram.</p>
      </body>
      </html>
    `);
  });

  app.get('/payments/paypal/cancel', (_req: Request, res: Response) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Paiement annulé</title>
        <meta charset="UTF-8">
      </head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h1>❌ Paiement annulé</h1>
        <p>Votre paiement a été annulé.</p>
        <p>Vous pouvez fermer cette page et retourner sur Telegram pour réessayer.</p>
      </body>
      </html>
    `);
  });

  // Stripe success/cancel redirects (ne nécessitent pas de sessions)
  app.get('/payments/stripe/success', (_req: Request, res: Response) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Paiement réussi</title>
        <meta charset="UTF-8">
      </head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h1>✅ Paiement réussi !</h1>
        <p>Votre accès VIP sera activé dans quelques instants.</p>
        <p>Vous pouvez fermer cette page et retourner sur Telegram.</p>
      </body>
      </html>
    `);
  });

  app.get('/payments/stripe/cancel', (_req: Request, res: Response) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Paiement annulé</title>
        <meta charset="UTF-8">
      </head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h1>❌ Paiement annulé</h1>
        <p>Votre paiement a été annulé.</p>
        <p>Vous pouvez fermer cette page et retourner sur Telegram pour réessayer.</p>
      </body>
      </html>
    `);
  });
}

// Configuration des webhooks (ne nécessitent pas de sessions)
function setupWebhooks() {
  // PayPal webhooks
  app.post('/webhooks/paypal', async (req: Request, res: Response) => {
  try {
    logger.info({ eventType: req.body?.event_type }, 'PayPal webhook received');
    logger.info({ body: req.body }, 'PayPal webhook body');

    const isValid = await paypalService.verifyWebhook(req.headers, JSON.stringify(req.body));

    if (!isValid) {
      logger.warn('Invalid PayPal webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    logger.info({ eventType: event.event_type }, 'PayPal webhook validated successfully');

    // Traiter les différents types d'événements
    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await handlePayPalPaymentCompletedWithErrorHandling(event);
        break;

      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await handlePayPalSubscriptionActivated(event);
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await handlePayPalSubscriptionCancelled(event);
        break;

      case 'BILLING.SUBSCRIPTION.EXPIRED':
        await handlePayPalSubscriptionExpired(event);
        break;

      default:
        logger.info(`Unhandled PayPal event type: ${event.event_type}`);
    }

    return res.json({ received: true });
  } catch (error) {
    logger.error({ error }, 'PayPal webhook error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Revolut webhooks
app.post('/webhooks/revolut', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['revolut-signature'] as string;

    if (!signature) {
      logger.warn('Missing Revolut signature');
      return res.status(401).json({ error: 'Missing signature' });
    }

    const isValid = revolutService.verifyWebhook(signature, JSON.stringify(req.body));

    if (!isValid) {
      logger.warn('Invalid Revolut webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = revolutService.parseWebhookEvent(JSON.stringify(req.body));
    logger.info({ event: event.event }, 'Revolut webhook received');

    // Traiter les événements
    switch (event.event) {
      case 'ORDER_COMPLETED':
        await handleRevolutOrderCompleted(event);
        break;

      case 'ORDER_AUTHORISED':
        await handleRevolutOrderAuthorised(event);
        break;

      default:
        logger.info(`Unhandled Revolut event type: ${event.event}`);
    }

    return res.json({ received: true });
  } catch (error) {
    logger.error({ error }, 'Revolut webhook error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Stripe webhooks
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      logger.warn('Missing Stripe signature');
      return res.status(401).json({ error: 'Missing signature' });
    }

    const event = stripeService.verifyWebhook(req.body, signature);

    if (!event) {
      logger.warn('Invalid Stripe webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    logger.info({ eventType: event.type }, 'Stripe webhook received');

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleStripeCheckoutCompleted(event);
        break;

      case 'payment_intent.succeeded':
        logger.info('Stripe payment_intent.succeeded');
        break;

      case 'charge.refunded':
        await handleStripeChargeRefunded(event);
        break;

      default:
        logger.info(`Unhandled Stripe event type: ${event.type}`);
    }

    return res.json({ received: true });
  } catch (error) {
    logger.error({ error }, 'Stripe webhook error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});
}

// Process PayPal payment from success page (fallback when webhook fails)
async function processPayPalPayment(orderId: string): Promise<void> {
  try {
    logger.info({ orderId }, 'Fetching PayPal order details');

    const orderDetails = await paypalService.getOrderDetails(orderId);
    logger.info({ orderDetails }, 'PayPal order details retrieved');

    // Vérifier le statut
    if (orderDetails.status !== 'APPROVED' && orderDetails.status !== 'COMPLETED') {
      logger.warn({ orderId, status: orderDetails.status }, 'PayPal order not approved/completed');
      return;
    }

    // Extraire les métadonnées
    const customId = orderDetails.purchase_units?.[0]?.custom_id;
    if (!customId) {
      logger.warn({ orderId }, 'No custom_id found in PayPal order');
      return;
    }

    const metadata = JSON.parse(customId);
    const { telegramId, plan } = metadata;

    // Vérifier si le paiement a déjà été traité
    const existingPayment = await Payment.findOne({ externalPaymentId: orderId });
    if (existingPayment) {
      logger.info({ orderId, telegramId }, 'PayPal payment already processed, skipping');
      return;
    }

    logger.info({ telegramId, plan, orderId }, 'Processing new PayPal payment');

    // Créer le paiement
    const payment = new Payment({
      telegramId,
      provider: 'paypal',
      externalPaymentId: orderId,
      amount: parseFloat(orderDetails.purchase_units[0].amount.value),
      currency: orderDetails.purchase_units[0].amount.currency_code,
      status: 'completed',
      metadata,
    });

    const user = await User.findOne({ telegramId });
    if (user) {
      payment.userId = user._id as any;
    }

    await payment.save();

    // Créer l'abonnement et accorder l'accès VIP
    const durations = { monthly: 30, quarterly: 90, sixmonth: 180, yearly: 365 };
    await bot.vipManager.grantVipAccess(telegramId, durations[plan as keyof typeof durations]);

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durations[plan as keyof typeof durations]);

    const subscription = new Subscription({
      userId: user?._id,
      telegramId,
      plan,
      status: 'active',
      startDate,
      endDate,
      paymentProvider: 'paypal',
      externalSubscriptionId: orderId,
    });

    await subscription.save();

    logger.info({ telegramId, plan, orderId }, '✅ VIP access granted via PayPal success page');
  } catch (error) {
    logger.error({ error, orderId }, 'Error processing PayPal payment from success page');
    throw error;
  }
}

// Handlers pour PayPal
async function handlePayPalPaymentCompleted(event: any): Promise<void> {
  logger.info('Processing PayPal payment completion');

  const customId = event.resource?.purchase_units?.[0]?.custom_id;
  if (!customId) {
    logger.warn('No custom_id found in PayPal payment event');
    return;
  }

  logger.info({ customId }, 'Custom ID found');
  const metadata = JSON.parse(customId);
  const { telegramId, plan } = metadata;
  logger.info({ telegramId, plan }, 'Processing payment');

  // Créer le paiement
  const payment = new Payment({
    telegramId,
    provider: 'paypal',
    externalPaymentId: event.resource.id,
    amount: parseFloat(event.resource.amount.value),
    currency: event.resource.amount.currency_code,
    status: 'completed',
    metadata,
  });

  const user = await User.findOne({ telegramId });
  if (user) {
    payment.userId = user._id as any;
  }

  await payment.save();

  // Créer l'abonnement et accorder l'accès VIP
  const durations = { monthly: 30, quarterly: 90, sixmonth: 180, yearly: 365 };
  await bot.vipManager.grantVipAccess(telegramId, durations[plan as keyof typeof durations]);

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + durations[plan as keyof typeof durations]);

  const subscription = new Subscription({
    userId: user?._id,
    telegramId,
    plan,
    status: 'active',
    startDate,
    endDate,
    paymentProvider: 'paypal',
    externalSubscriptionId: event.resource.id,
  });

  await subscription.save();

  logger.info({ telegramId, plan }, '✅ VIP access granted via PayPal - Payment saved, subscription created');
}

async function handlePayPalPaymentCompletedWithErrorHandling(event: any): Promise<void> {
  try {
    await handlePayPalPaymentCompleted(event);
  } catch (error) {
    logger.error({ error, event }, 'Error processing PayPal payment completion');
  }
}

async function handlePayPalSubscriptionActivated(event: any): Promise<void> {
  logger.info({ subscriptionId: event.resource?.id }, 'PayPal subscription activated');
}

async function handlePayPalSubscriptionCancelled(event: any): Promise<void> {
  const subscriptionId = event.resource?.id;

  await Subscription.updateMany(
    { externalSubscriptionId: subscriptionId },
    { status: 'cancelled', autoRenew: false }
  );

  logger.info('PayPal subscription cancelled:', subscriptionId);
}

async function handlePayPalSubscriptionExpired(event: any): Promise<void> {
  const subscriptionId = event.resource?.id;

  await Subscription.updateMany(
    { externalSubscriptionId: subscriptionId },
    { status: 'expired' }
  );

  logger.info('PayPal subscription expired:', subscriptionId);
}

// Handlers pour Revolut
async function handleRevolutOrderCompleted(event: any): Promise<void> {
  const order = await revolutService.getOrder(event.order_id);
  const metadata = JSON.parse((order as any).merchant_order_ext_ref);
  const { telegramId, plan } = metadata;

  // Créer le paiement
  const payment = new Payment({
    telegramId,
    provider: 'revolut',
    externalPaymentId: event.order_id,
    amount: (order as any).order_amount.value / 100,
    currency: (order as any).order_amount.currency,
    status: 'completed',
    metadata,
  });

  const user = await User.findOne({ telegramId });
  if (user) {
    payment.userId = user._id as any;
  }

  await payment.save();

  // Créer l'abonnement et accorder l'accès VIP
  const durations = { monthly: 30, quarterly: 90, sixmonth: 180, yearly: 365 };
  await bot.vipManager.grantVipAccess(telegramId, durations[plan as keyof typeof durations]);

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + durations[plan as keyof typeof durations]);

  const subscription = new Subscription({
    userId: user?._id,
    telegramId,
    plan,
    status: 'active',
    startDate,
    endDate,
    paymentProvider: 'revolut',
    externalSubscriptionId: event.order_id,
  });

  await subscription.save();

  logger.info(`VIP access granted to user ${telegramId} via Revolut`);
}

async function handleRevolutOrderAuthorised(event: any): Promise<void> {
  logger.info('Revolut order authorised:', event.order_id);
}

// Handlers pour Stripe
async function handleStripeCheckoutCompleted(event: any): Promise<void> {
  const session = event.data.object;
  const metadata = session.metadata;
  const telegramId = parseInt(metadata.telegramId);
  const plan = metadata.plan;

  // Créer le paiement
  const payment = new Payment({
    telegramId,
    provider: 'stripe',
    externalPaymentId: session.payment_intent,
    amount: session.amount_total / 100,
    currency: session.currency.toUpperCase(),
    status: 'completed',
    metadata,
  });

  const user = await User.findOne({ telegramId });
  if (user) {
    payment.userId = user._id as any;
  }

  await payment.save();

  // Créer l'abonnement et accorder l'accès VIP
  const durations = { monthly: 30, quarterly: 90, sixmonth: 180, yearly: 365 };
  await bot.vipManager.grantVipAccess(telegramId, durations[plan as keyof typeof durations]);

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + durations[plan as keyof typeof durations]);

  const subscription = new Subscription({
    userId: user?._id,
    telegramId,
    plan,
    status: 'active',
    startDate,
    endDate,
    paymentProvider: 'stripe',
    externalSubscriptionId: session.id,
  });

  await subscription.save();

  logger.info(`VIP access granted to user ${telegramId} via Stripe`);
}

async function handleStripeChargeRefunded(event: any): Promise<void> {
  const charge = event.data.object;

  await Payment.updateMany(
    { externalPaymentId: charge.payment_intent },
    { status: 'refunded' }
  );

  logger.info('Stripe charge refunded:', charge.id);
}

// Fonction principale
async function main(): Promise<void> {
  try {
    // Setup des routes de base avant la connexion MongoDB
    setupBasicRoutes();
    logger.info('Basic routes configured including payment confirmation pages');

    // Connexion à MongoDB
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(config.database.mongoUri);
    logger.info('Connected to MongoDB');

    // Initialiser les noms de plans par défaut
    logger.info('Initializing default plan names...');
    await initializeDefaultPlanNames();
    logger.info('Plan names initialized');

    // Configurer les sessions avec MongoDB store (après la connexion MongoDB)
    app.use(
      session({
        secret: config.session.secret,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
          client: mongoose.connection.getClient(),
          collectionName: 'sessions',
          ttl: 24 * 60 * 60, // 24 heures en secondes
        }),
        cookie: {
          secure: process.env.NODE_ENV === 'production',
          httpOnly: true,
          maxAge: 24 * 60 * 60 * 1000, // 24 heures en millisecondes
        },
      })
    );
    logger.info('Session store configured with MongoDB');

    // Setup des webhooks (après les sessions)
    setupWebhooks();

    // Monter les routes admin (après les sessions)
    app.use('/admin', adminRoutes);
    logger.info('Admin routes mounted');

    // Gestionnaire d'erreurs global (à la fin)
    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      logger.error({ error: err }, 'Express error');
      res.status(500).json({ error: 'Internal server error' });
    });

    // Démarrer le bot Telegram
    logger.info('Starting Telegram bot...');
    bot = new TelegramBot();

    // Configurer le scheduler avec le VipManager
    schedulerService.setVipManager(bot.vipManager);

    // Démarrer le scheduler
    logger.info('Starting scheduler...');
    await schedulerService.start();

    // Démarrer le serveur Express
    const port = config.server.port;
    app.listen(port, () => {
      logger.info(`Server listening on port ${port}`);
      logger.info(`Base URL: ${config.server.baseUrl}`);
    });

    // Démarrer le bot en dernier (non-bloquant, ne pas attendre)
    bot.start().catch((error) => {
      logger.error({ error }, 'Telegram bot failed to start, but server will continue');
    });

    // Gestion de l'arrêt gracieux
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);

      await bot.stop();
      await schedulerService.stop();
      await mongoose.connection.close();

      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    logger.error({ error }, 'Failed to start application');
    process.exit(1);
  }
}

main();


// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣷⣶⣤⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣿⣿⣿⣿⣷⡒⢄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢹⣿⣿⣿⣿⣿⣆⠙⡄⠀⠐⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣤⣤⣤⣤⣤⣤⣤⣤⣤⠤⢄⡀⠀⠀⣿⣿⣿⣿⣿⣿⡆⠘⡄⠀⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⢿⣿⣿⣿⣿⣿⣿⣿⣦⡈⠒⢄⢸⣿⣿⣿⣿⣿⣿⡀⠱⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠻⣿⣿⣿⣿⣿⣿⣿⣦⠀⠱⣿⣿⣿⣿⣿⣿⣇⠀⢃⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢿⣿⣿⣿⣿⣿⣿⣷⡄⣹⣿⣿⣿⣿⣿⣿⣶⣾⣿⣶⣤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⣴⣶⣿⣭⣍⡉⠙⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⢀⣠⣶⣿⣿⣿⣿⣿⣿⣿⣿⣷⣦⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠉⠉⠛⠻⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡷⢂⣓⣶⣶⣶⣶⣤⣤⣄⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⠻⣿⣿⣿⣿⣿⣿⣿⣿⣿⢿⣿⣿⣿⠟⢀⣴⢿⣿⣿⣿⠟⠻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠿⠛⠋⠉⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠤⠤⠤⠤⠙⣻⣿⣿⣿⣿⣿⣿⣾⣿⣿⡏⣠⠟⡉⣾⣿⣿⠋⡠⠊⣿⡟⣹⣿⢿⣿⣿⣿⠿⠛⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⣤⣶⣤⣭⣤⣼⣿⢛⣿⣿⣿⣿⣻⣿⣿⠇⠐⢀⣿⣿⡷⠋⠀⢠⣿⣺⣿⣿⢺⣿⣋⣉⣉⣩⣴⣶⣤⣤⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠛⠻⠿⣿⣿⣿⣇⢻⣿⣿⡿⠿⣿⣯⡀⠀⢸⣿⠋⢀⣠⣶⠿⠿⢿⡿⠈⣾⣿⣿⣿⣿⡿⠿⠛⠋⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⠻⢧⡸⣿⣿⣿⠀⠃⠻⠟⢦⢾⢣⠶⠿⠏⠀⠰⠀⣼⡇⣸⣿⣿⠟⠉⠀⠀⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⣴⣾⣶⣽⣿⡟⠓⠒⠀⠀⡀⠀⠠⠤⠬⠉⠁⣰⣥⣾⣿⣿⣶⣶⣷⡶⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠉⠉⠹⠟⣿⣿⡄⠀⠀⠠⡇⠀⠀⠀⠀⠀⢠⡟⠛⠛⠋⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⠋⠹⣷⣄⠀⠐⣊⣀⠀⠀⢀⡴⠁⠣⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣤⣀⠤⠊⢁⡸⠀⣆⠹⣿⣧⣀⠀⠀⡠⠖⡑⠁⠀⠀⠀⠑⢄⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣰⣦⣶⣿⣿⣟⣁⣤⣾⠟⠁⢀⣿⣆⠹⡆⠻⣿⠉⢀⠜⡰⠀⠀⠈⠑⢦⡀⠈⢾⠑⡾⠲⣄⠀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⠀⠀⠀⣀⣤⣶⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠖⠒⠚⠛⠛⠢⠽⢄⣘⣤⡎⠠⠿⠂⠀⠠⠴⠶⢉⡭⠃⢸⠃⠀⣿⣿⣿⠡⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⠀⡤⠶⠿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣋⠁⠀⠀⠀⠀⠀⢹⡇⠀⠀⠀⠀⠒⠢⣤⠔⠁⠀⢀⡏⠀⠀⢸⣿⣿⠀⢻⡟⠑⠢⢄⡀⠀⠀⠀⠀⠀
// ⠀⠀⠀⠀⢸⠀⠀⠀⡀⠉⠛⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣄⣀⣀⡀⠀⢸⣷⡀⣀⣀⡠⠔⠊⠀⠀⢀⣠⡞⠀⠀⠀⢸⣿⡿⠀⠘⠀⠀⠀⠀⠈⠑⢤⠀⠀⠀
// ⠀⠀⢀⣴⣿⡀⠀⠀⡇⠀⠀⠀⠈⣿⣿⣿⣿⣿⣿⣿⣿⣝⡛⠿⢿⣷⣦⣄⡀⠈⠉⠉⠁⠀⠀⠀⢀⣠⣴⣾⣿⡿⠁⠀⠀⠀⢸⡿⠁⠀⠀⠀⠀⠀⠀⠀⠀⡜⠀⠀⠀
// ⠀⢀⣾⣿⣿⡇⠀⢰⣷⠀⢀⠀⠀⢹⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣦⣭⣍⣉⣉⠀⢀⣀⣤⣶⣾⣿⣿⣿⢿⠿⠁⠀⠀⠀⠀⠘⠀⠀⠀⠀⠀⠀⠀⠀⠀⡰⠉⢦⠀⠀
// ⢀⣼⣿⣿⡿⢱⠀⢸⣿⡀⢸⣧⡀⠀⢿⣿⣿⠿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡭⠖⠁⠀⡠⠂⠀⠀⠀⠀⠀⠀⠀⠀⢠⠀⠀⠀⢠⠃⠀⠈⣀⠀
// ⢸⣿⣿⣿⡇⠀⢧⢸⣿⣇⢸⣿⣷⡀⠈⣿⣿⣇⠈⠛⢿⣿⣿⣿⣿⣿⣿⠿⠿⠿⠿⠿⠿⠟⡻⠟⠉⠀⠀⡠⠊⠀⢠⠀⠀⠀⠀⠀⠀⠀⠀⣾⡄⠀⢠⣿⠔⠁⠀⢸⠀
// ⠈⣿⣿⣿⣷⡀⠀⢻⣿⣿⡜⣿⣿⣷⡀⠈⢿⣿⡄⠀⠀⠈⠛⠿⣿⣿⣿⣷⣶⣶⣶⡶⠖⠉⠀⣀⣤⡶⠋⠀⣠⣶⡏⠀⠀⠀⠀⠀⠀⠀⢰⣿⣧⣶⣿⣿⠖⡠⠖⠁⠀
// ⠀⣿⣿⣷⣌⡛⠶⣼⣿⣿⣷⣿⣿⣿⣿⡄⠈⢻⣷⠀⣄⡀⠀⠀⠀⠈⠉⠛⠛⠛⠁⣀⣤⣶⣾⠟⠋⠀⣠⣾⣿⡟⠀⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⣿⣿⠷⠊⠀⢰⠀⠀
// ⢰⣿⣿⠀⠈⢉⡶⢿⣿⣿⣿⣿⣿⣿⣿⣿⣆⠀⠙⢇⠈⢿⣶⣦⣤⣀⣀⣠⣤⣶⣿⣿⡿⠛⠁⢀⣤⣾⣿⣿⡿⠁⠀⠀⠀⠀⠀⠀⠀⣸⣿⡿⠿⠋⠙⠒⠄⠀⠉⡄⠀
// ⣿⣿⡏⠀⠀⠁⠀⠀⠀⠉⠉⠙⢻⣿⣿⣿⣿⣷⡀⠀⠀⠀⠻⣿⣿⣿⣿⣿⠿⠿⠛⠁⠀⣀⣴⣿⣿⣿⣿⠟⠀⠀⠀⠀⠀⠀⠀⠀⢠⠏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠰⠀