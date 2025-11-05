import { TelegramBot } from './bot';

/**
 * Singleton instance du bot Telegram
 * Permet d'accéder au bot depuis d'autres modules comme les routes admin
 */
let botInstance: TelegramBot | null = null;

export function setBotInstance(bot: TelegramBot): void {
  botInstance = bot;
}

export function getBotInstance(): TelegramBot {
  if (!botInstance) {
    throw new Error('Bot instance not initialized. Call setBotInstance first.');
  }
  return botInstance;
}
