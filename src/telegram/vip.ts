import { Telegraf } from 'telegraf';
import { User, IUser } from '../models/User';
// import { Subscription, ISubscription } from '../models/Subscription';
import { config } from '../config';
import { logger } from '../index';

export class VipManager {
  constructor(private bot: Telegraf) {}

  async grantVipAccess(telegramId: number, durationDays: number): Promise<IUser> {
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);

    let user = await User.findOne({ telegramId });

    if (!user) {
      user = new User({
        telegramId,
        isVip: true,
        vipUntil: endDate,
      });
    } else {
      user.isVip = true;
      user.vipUntil = endDate;
    }

    await user.save();

    // Inviter l'utilisateur au groupe VIP
    try {
      await this.inviteToVipChat(telegramId);
      await this.bot.telegram.sendMessage(
        telegramId,
        `🎉 Félicitations ! Vous avez maintenant accès VIP jusqu'au ${endDate.toLocaleDateString('fr-FR')}.\n\nVous allez recevoir une invitation pour rejoindre le groupe VIP.`
      );
    } catch (error) {
      logger.error({ error }, `Failed to invite user ${telegramId} to VIP chat`);
    }

    return user;
  }

  async revokeVipAccess(telegramId: number): Promise<IUser | null> {
    const user = await User.findOne({ telegramId });

    if (!user) {
      return null;
    }

    user.isVip = false;
    user.vipUntil = undefined;
    await user.save();

    // Retirer l'utilisateur du groupe VIP
    try {
      await this.removeFromVipChat(telegramId);
      await this.bot.telegram.sendMessage(
        telegramId,
        `❌ Votre accès VIP a expiré. Pour renouveler, utilisez /subscribe`
      );
    } catch (error) {
      logger.error({ error }, `Failed to remove user ${telegramId} from VIP chat`);
    }

    return user;
  }

  async extendVipAccess(telegramId: number, durationDays: number): Promise<IUser | null> {
    const user = await User.findOne({ telegramId });

    if (!user) {
      return null;
    }

    const currentExpiry = user.vipUntil || new Date();
    const newExpiry = new Date(Math.max(currentExpiry.getTime(), Date.now()));
    newExpiry.setDate(newExpiry.getDate() + durationDays);

    user.isVip = true;
    user.vipUntil = newExpiry;
    await user.save();

    await this.bot.telegram.sendMessage(
      telegramId,
      `✅ Votre accès VIP a été prolongé jusqu'au ${newExpiry.toLocaleDateString('fr-FR')}`
    );

    return user;
  }

  async checkVipStatus(telegramId: number): Promise<boolean> {
    const user = await User.findOne({ telegramId });

    if (!user || !user.isVip) {
      return false;
    }

    if (user.vipUntil && user.vipUntil < new Date()) {
      await this.revokeVipAccess(telegramId);
      return false;
    }

    return true;
  }

  async inviteToVipChat(telegramId: number): Promise<void> {
    try {
      // Créer un lien d'invitation
      const inviteLink = await this.bot.telegram.createChatInviteLink(
        config.telegram.vipChatId,
        {
          member_limit: 1,
          expire_date: Math.floor(Date.now() / 1000) + 3600, // Expire dans 1 heure
        }
      );

      await this.bot.telegram.sendMessage(
        telegramId,
        `🔗 Voici votre invitation VIP :\n${inviteLink.invite_link}\n\nCe lien expire dans 1 heure.`
      );
    } catch (error) {
      logger.error({ error }, `Failed to create invite link for user ${telegramId}`);
      throw error;
    }
  }

  async removeFromVipChat(telegramId: number): Promise<void> {
    try {
      await this.bot.telegram.banChatMember(
        config.telegram.vipChatId,
        telegramId
      );
      // Débanner immédiatement pour permettre une réinscription future
      await this.bot.telegram.unbanChatMember(
        config.telegram.vipChatId,
        telegramId
      );
    } catch (error) {
      logger.error({ error }, `Failed to remove user ${telegramId} from VIP chat`);
      throw error;
    }
  }

  async getVipUsers(): Promise<IUser[]> {
    return await User.find({ isVip: true, vipUntil: { $gt: new Date() } });
  }

  async getExpiringVipUsers(daysBeforeExpiry: number): Promise<IUser[]> {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBeforeExpiry);

    return await User.find({
      isVip: true,
      vipUntil: {
        $gt: new Date(),
        $lt: targetDate,
      },
    });
  }

  async notifyExpiringVip(daysBeforeExpiry: number): Promise<void> {
    const expiringUsers = await this.getExpiringVipUsers(daysBeforeExpiry);

    for (const user of expiringUsers) {
      try {
        await this.bot.telegram.sendMessage(
          user.telegramId,
          `⚠️ Votre accès VIP expire le ${user.vipUntil?.toLocaleDateString('fr-FR')}.\n\nRenouvelez maintenant avec /subscribe pour continuer à profiter des avantages VIP !`
        );
      } catch (error) {
        logger.error({ error }, `Failed to notify user ${user.telegramId}`);
      }
    }
  }
}
