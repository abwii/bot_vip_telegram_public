import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import pino from 'pino';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { TelegramBot } from './telegram/bot';
import { schedulerService } from './scheduler/agenda';
import { paypalService } from './payments/paypal';
import { revolutService } from './payments/revolut';
import { User } from './models/User';
import { Subscription } from './models/Subscription';
import { Payment } from './models/Payment';
import { PricingConfig } from './models/PricingConfig';
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 heures
    },
  })
);

// Servir les fichiers statiques
app.use(express.static('public'));

// Telegram bot
let bot: TelegramBot;

// Middleware de logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
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

// Admin routes
app.use('/admin', adminRoutes);

// PayPal webhooks
app.post('/webhooks/paypal', async (req: Request, res: Response) => {
  try {
    const isValid = await paypalService.verifyWebhook(req.headers, JSON.stringify(req.body));

    if (!isValid) {
      logger.warn('Invalid PayPal webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    logger.info('PayPal webhook received:', event.event_type);

    // Traiter les différents types d'événements
    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await handlePayPalPaymentCompleted(event);
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

// PayPal success/cancel redirects
app.get('/payments/paypal/success', (_req: Request, res: Response) => {
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

// Handlers pour PayPal
async function handlePayPalPaymentCompleted(event: any): Promise<void> {
  const customId = event.resource?.purchase_units?.[0]?.custom_id;
  if (!customId) return;

  const metadata = JSON.parse(customId);
  const { telegramId, plan } = metadata;

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
  const durations = { monthly: 30, quarterly: 90, yearly: 365 };
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

  logger.info(`VIP access granted to user ${telegramId} via PayPal`);
}

async function handlePayPalSubscriptionActivated(event: any): Promise<void> {
  logger.info('PayPal subscription activated:', event.resource?.id);
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
  const durations = { monthly: 30, quarterly: 90, yearly: 365 };
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

// Gestionnaire d'erreurs global
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error: err }, 'Express error');
  res.status(500).json({ error: 'Internal server error' });
});

// Fonction principale
async function main(): Promise<void> {
  try {
    // Connexion à MongoDB
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(config.database.mongoUri);
    logger.info('Connected to MongoDB');

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