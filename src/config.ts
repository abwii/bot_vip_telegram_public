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
    planIds?: {
      monthly?: string;
      quarterly?: string;
      sixmonth?: string;
      yearly?: string;
    };
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
    planIds: {
      monthly: getOptionalEnvVar('PAYPAL_PLAN_ID_MONTHLY') || undefined,
      quarterly: getOptionalEnvVar('PAYPAL_PLAN_ID_QUARTERLY') || undefined,
      sixmonth: getOptionalEnvVar('PAYPAL_PLAN_ID_SIXMONTH') || undefined,
      yearly: getOptionalEnvVar('PAYPAL_PLAN_ID_YEARLY') || undefined,
    },
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

// Validate payment providers configuration
export function validatePaymentConfig(): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check PayPal
  if (config.paypal.clientId && config.paypal.clientSecret) {
    if (!config.server.baseUrl || config.server.baseUrl === 'http://localhost:3000') {
      warnings.push('⚠️  PayPal is configured but BASE_URL is localhost - webhooks may not work in production');
    }
  } else if (config.paypal.clientId || config.paypal.clientSecret) {
    warnings.push('⚠️  PayPal is partially configured (missing clientId or clientSecret)');
  }

  // Check Revolut
  if (config.revolut.apiKey && !config.revolut.webhookSecret) {
    warnings.push('⚠️  Revolut API key is set but webhook secret is missing');
  }

  // Check Stripe
  if (config.stripe.secretKey && !config.stripe.webhookSecret) {
    warnings.push('⚠️  Stripe secret key is set but webhook secret is missing');
  }

  // Check if at least one payment provider is configured
  const hasPayPal = config.paypal.clientId && config.paypal.clientSecret;
  const hasRevolut = config.revolut.apiKey;
  const hasStripe = config.stripe.secretKey;

  if (!hasPayPal && !hasRevolut && !hasStripe) {
    warnings.push('⚠️  No payment provider is fully configured. Users will not be able to make payments.');
  }

  return {
    valid: warnings.length === 0,
    warnings
  };
}
