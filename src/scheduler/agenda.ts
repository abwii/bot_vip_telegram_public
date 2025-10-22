import Agenda from 'agenda';
import mongoose from 'mongoose';
import { config } from '../config';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';
import { logger } from '../index';
import { VipManager } from '../telegram/vip';
// import { Telegraf } from 'telegraf';

export class SchedulerService {
  private agenda: Agenda;
  private vipManager: VipManager | null = null;

  constructor() {
    this.agenda = new Agenda({
      db: {
        address: config.database.mongoUri,
        collection: 'agendaJobs',
      },
      processEvery: '1 minute',
    });

    this.defineJobs();
  }

  setVipManager(vipManager: VipManager): void {
    this.vipManager = vipManager;
  }

  private defineJobs(): void {
    // Job pour vérifier les expirations VIP
    this.agenda.define('check-vip-expiration', async (_job: any) => {
      logger.info('Running VIP expiration check');

      try {
        const expiredUsers = await User.find({
          isVip: true,
          vipUntil: { $lt: new Date() },
        });

        for (const user of expiredUsers) {
          logger.info(`Revoking VIP access for user ${user.telegramId}`);
          if (this.vipManager) {
            await this.vipManager.revokeVipAccess(user.telegramId);
          }

          // Mettre à jour les abonnements
          await Subscription.updateMany(
            {
              telegramId: user.telegramId,
              status: 'active',
              endDate: { $lt: new Date() },
            },
            { status: 'expired' }
          );
        }

        logger.info(`Processed ${expiredUsers.length} expired VIP users`);
      } catch (error) {
        logger.error({ error }, 'Error checking VIP expiration');
        throw error;
      }
    });

    // Job pour notifier les utilisateurs dont l'accès expire bientôt
    this.agenda.define('notify-expiring-vip', async (_job: any) => {
      logger.info('Running VIP expiration notifications');

      try {
        if (!this.vipManager) {
          logger.warn('VipManager not set, skipping notifications');
          return;
        }

        // Notifier 3 jours avant expiration
        await this.vipManager.notifyExpiringVip(3);

        // Notifier 1 jour avant expiration
        await this.vipManager.notifyExpiringVip(1);

        logger.info('VIP expiration notifications sent');
      } catch (error) {
        logger.error({ error }, 'Error sending VIP expiration notifications');
        throw error;
      }
    });

    // Job pour nettoyer les anciennes données
    this.agenda.define('cleanup-old-data', async (_job: any) => {
      logger.info('Running data cleanup');

      try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        // Supprimer les anciennes subscriptions expirées
        const deletedSubs = await Subscription.deleteMany({
          status: { $in: ['expired', 'cancelled'] },
          updatedAt: { $lt: sixMonthsAgo },
        });

        logger.info(`Deleted ${deletedSubs.deletedCount} old subscriptions`);

        // Supprimer les anciens paiements
        const deletedPayments = await mongoose.model('Payment').deleteMany({
          status: { $in: ['completed', 'refunded'] },
          updatedAt: { $lt: sixMonthsAgo },
        });

        logger.info(`Deleted ${deletedPayments.deletedCount} old payments`);
      } catch (error) {
        logger.error({ error }, 'Error cleaning up old data');
        throw error;
      }
    });

    // Job pour les statistiques quotidiennes
    this.agenda.define('daily-statistics', async (_job: any) => {
      logger.info('Running daily statistics');

      try {
        const activeVipCount = await User.countDocuments({
          isVip: true,
          vipUntil: { $gt: new Date() },
        });

        const activeSubscriptions = await Subscription.countDocuments({
          status: 'active',
        });

        const todayRevenue = await mongoose.model('Payment').aggregate([
          {
            $match: {
              status: 'completed',
              createdAt: {
                $gte: new Date(new Date().setHours(0, 0, 0, 0)),
              },
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
          todayRevenue: todayRevenue[0]?.total || 0,
        }, 'Daily statistics');
      } catch (error) {
        logger.error({ error }, 'Error generating daily statistics');
        throw error;
      }
    });

    // Gestion des événements
    this.agenda.on('ready', () => {
      logger.info('Agenda ready');
    });

    this.agenda.on('error', (err) => {
      logger.error('Agenda error:', err);
    });

    this.agenda.on('start', (job) => {
      logger.debug(`Job ${job.attrs.name} starting`);
    });

    this.agenda.on('complete', (job) => {
      logger.debug(`Job ${job.attrs.name} completed`);
    });

    this.agenda.on('fail', (err, job) => {
      logger.error(`Job ${job.attrs.name} failed:`, err);
    });
  }

  async start(): Promise<void> {
    await this.agenda.start();

    // Planifier les jobs récurrents
    await this.agenda.every('5 minutes', 'check-vip-expiration');
    await this.agenda.every('1 hour', 'notify-expiring-vip');
    await this.agenda.every('1 day', 'cleanup-old-data');
    await this.agenda.every('1 day', 'daily-statistics', {}, { timezone: 'Europe/Paris' });

    logger.info('Scheduler started');
  }

  async stop(): Promise<void> {
    await this.agenda.stop();
    logger.info('Scheduler stopped');
  }

  async runNow(jobName: string): Promise<void> {
    await this.agenda.now(jobName, {});
  }

  getAgenda(): Agenda {
    return this.agenda;
  }
}

export const schedulerService = new SchedulerService();
