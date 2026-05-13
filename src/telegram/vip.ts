import { Telegraf } from 'telegraf';
import { User, IUser } from '../models/User';
import { InviteLink } from '../models/InviteLink';
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
      user.expirationNotificationSent = false;
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
    user.expirationNotificationSent = false;
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
      // Révoquer tous les liens d'invitation actifs de cet utilisateur
      await this.revokeInviteLinks(telegramId);

      // Créer un lien d'invitation
      const expirationTime = Math.floor(Date.now() / 1000) + 3600; // Expire dans 1 heure
      const inviteLink = await this.bot.telegram.createChatInviteLink(
        config.telegram.vipChatId,
        {
          member_limit: 1,
          expire_date: expirationTime,
        }
      );

      // Stocker le lien en base de données
      await InviteLink.create({
        telegramId,
        inviteLink: inviteLink.invite_link,
        expiresAt: new Date(expirationTime * 1000),
        isRevoked: false,
      });



      await this.bot.telegram.sendMessage(
        telegramId,
        `🔗 Voici votre invitation VIP :\n${inviteLink.invite_link}\n\n⚠️ Ce lien expire dans 1 heure et ne fonctionne qu'avec un statut VIP actif.`
      );
    } catch (error) {
      logger.error({ error }, `Failed to create invite link for user ${telegramId}`);
      throw error;
    }
  }

  async removeFromVipChat(telegramId: number): Promise<void> {
    try {
      // Révoquer tous les liens d'invitation actifs
      await this.revokeInviteLinks(telegramId);

      // Vérifier d'abord si l'utilisateur est membre du chat
      try {
        const member = await this.bot.telegram.getChatMember(
          config.telegram.vipChatId,
          telegramId
        );

        // Si l'utilisateur n'est pas membre ou déjà banni, pas besoin de le retirer
        if (member.status === 'left' || member.status === 'kicked') {
          logger.info(`User ${telegramId} is not a member of VIP chat, skipping removal`);
          return;
        }
      } catch (error: any) {
        // Si on ne peut pas obtenir les infos du membre, il n'est probablement pas dans le groupe
        if (error.response?.error_code === 400) {
          logger.info(`User ${telegramId} not found in VIP chat, skipping removal`);
          return;
        }
        throw error;
      }

      // Bannir l'utilisateur
      await this.bot.telegram.banChatMember(
        config.telegram.vipChatId,
        telegramId
      );

      // Débanner immédiatement pour permettre une réinscription future
      await this.bot.telegram.unbanChatMember(
        config.telegram.vipChatId,
        telegramId
      );

      logger.info(`User ${telegramId} removed from VIP chat successfully`);
    } catch (error) {
      logger.error({ error }, `Failed to remove user ${telegramId} from VIP chat`);
      // Ne pas propager l'erreur si c'est juste un problème de participant non trouvé
      if ((error as any).response?.description?.includes('PARTICIPANT_ID_INVALID')) {
        logger.info(`User ${telegramId} was not a participant, skipping`);
        return;
      }
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
      expirationNotificationSent: { $ne: true },
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
        
        user.expirationNotificationSent = true;
        await user.save();
      } catch (error) {
        logger.error({ error }, `Failed to notify user ${user.telegramId}`);
      }
    }
  }

  /**
   * Révoquer tous les liens d'invitation actifs d'un utilisateur
   */
  async revokeInviteLinks(telegramId: number): Promise<void> {
    try {
      const activeLinks = await InviteLink.find({
        telegramId,
        isRevoked: false,
        expiresAt: { $gt: new Date() },
      });

      for (const link of activeLinks) {
        try {
          // Révoquer le lien sur Telegram
          await this.bot.telegram.revokeChatInviteLink(
            config.telegram.vipChatId,
            link.inviteLink
          );

          // Marquer comme révoqué en base de données
          link.isRevoked = true;
          await link.save();

          logger.info(`Revoked invite link for user ${telegramId}`);
        } catch (error) {
          logger.error({ error }, `Failed to revoke invite link ${link.inviteLink}`);
          // Continuer même si la révocation échoue (lien peut-être déjà expiré)
        }
      }
    } catch (error) {
      logger.error({ error }, `Failed to revoke invite links for user ${telegramId}`);
      throw error;
    }
  }

  /**
   * Vérifier si un utilisateur a le droit d'utiliser un lien d'invitation
   */
  async canUseInviteLink(telegramId: number, inviteLink: string): Promise<boolean> {
    try {
      // Vérifier que l'utilisateur est VIP
      const isVip = await this.checkVipStatus(telegramId);
      if (!isVip) {
        logger.warn(`User ${telegramId} tried to use invite link but is not VIP`);
        return false;
      }

      // Vérifier que le lien existe et n'est pas révoqué
      const link = await InviteLink.findOne({
        inviteLink,
        telegramId,
        isRevoked: false,
        expiresAt: { $gt: new Date() },
      });

      if (!link) {
        logger.warn(`User ${telegramId} tried to use invalid/revoked invite link`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ error }, `Error checking invite link for user ${telegramId}`);
      return false;
    }
  }

  /**
   * Récupérer les informations d'un membre du groupe VIP
   */
  async getChatMember(telegramId: number): Promise<any> {
    try {
      return await this.bot.telegram.getChatMember(config.telegram.vipChatId, telegramId);
    } catch (error) {
      logger.debug({ error }, `Failed to get chat member ${telegramId}`);
      return null;
    }
  }

  /**
   * Notifier un utilisateur qu'il a été retiré du groupe VIP
   */
  async notifyVipRemoval(telegramId: number): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(
        telegramId,
        '❌ Vous avez été retiré du groupe VIP car votre statut VIP a expiré ou été révoqué.\n\n' +
        'Utilisez /subscribe pour vous réabonner et rejoindre à nouveau le groupe VIP.'
      );
    } catch (error) {
      logger.error({ error }, `Failed to send removal notification to user ${telegramId}`);
      throw error;
    }
  }
}
