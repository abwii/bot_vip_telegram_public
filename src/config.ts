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
  stripe: {
    secretKey: string;
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

function getOptionalEnvVar(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue;
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
    clientId: getOptionalEnvVar('PAYPAL_CLIENT_ID'),
    clientSecret: getOptionalEnvVar('PAYPAL_CLIENT_SECRET'),
    webhookId: getOptionalEnvVar('PAYPAL_WEBHOOK_ID'),
    mode: (getOptionalEnvVar('PAYPAL_MODE', 'sandbox') as 'sandbox' | 'live'),
  },
  revolut: {
    apiKey: getOptionalEnvVar('REVOLUT_API_KEY'),
    webhookSecret: getOptionalEnvVar('REVOLUT_WEBHOOK_SECRET'),
  },
  stripe: {
    secretKey: getOptionalEnvVar('STRIPE_SECRET_KEY'),
    webhookSecret: getOptionalEnvVar('STRIPE_WEBHOOK_SECRET'),
  },
};
