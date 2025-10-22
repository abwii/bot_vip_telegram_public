import dotenv from 'dotenv';

dotenv.config();

interface Config {
  telegram: {
    token: string;
    vipChatId: string;
  };
  database: {
    mongoUri: string;
  };
  server: {
    baseUrl: string;
    port: number;
  };
  session: {
    secret: string;
  };
  paypal: {
    clientId: string;
    clientSecret: string;
    webhookId: string;
    mode: 'sandbox' | 'live';
  };
  revolut: {
    apiKey: string;
    webhookSecret: string;
  };
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config: Config = {
  telegram: {
    token: getEnvVar('TELEGRAM_TOKEN'),
    vipChatId: getEnvVar('VIP_CHAT_ID'),
  },
  database: {
    mongoUri: getEnvVar('MONGO_URI'),
  },
  server: {
    baseUrl: getEnvVar('BASE_URL'),
    port: parseInt(getEnvVar('PORT', '3000'), 10),
  },
  session: {
    secret: getEnvVar('SESSION_SECRET', 'your-secret-key-change-this-in-production'),
  },
  paypal: {
    clientId: getEnvVar('PAYPAL_CLIENT_ID'),
    clientSecret: getEnvVar('PAYPAL_CLIENT_SECRET'),
    webhookId: getEnvVar('PAYPAL_WEBHOOK_ID'),
    mode: (getEnvVar('PAYPAL_MODE', 'sandbox') as 'sandbox' | 'live'),
  },
  revolut: {
    apiKey: getEnvVar('REVOLUT_API_KEY'),
    webhookSecret: getEnvVar('REVOLUT_WEBHOOK_SECRET'),
  },
};
