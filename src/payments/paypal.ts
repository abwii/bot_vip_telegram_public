import fetch from 'node-fetch';
import { config } from '../config';
import { logger } from '../index';

const PAYPAL_API_BASE = config.paypal.mode === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

interface PayPalAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface PayPalOrderResponse {
  id: string;
  status: string;
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

interface PayPalSubscriptionResponse {
  id: string;
  status: string;
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

export class PayPalService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  async getAccessToken(): Promise<string> {
    // Vérifier si le token est encore valide
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const auth = Buffer.from(
      `${config.paypal.clientId}:${config.paypal.clientSecret}`
    ).toString('base64');

    const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`PayPal auth failed: ${error}`);
    }

    const data = await response.json() as PayPalAccessTokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // 1 minute de marge

    return this.accessToken;
  }

  async createOrder(amount: number, currency: string, metadata: Record<string, unknown>): Promise<PayPalOrderResponse> {
    const token = await this.getAccessToken();

    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: amount.toFixed(2),
            },
            custom_id: JSON.stringify(metadata),
          },
        ],
        application_context: {
          return_url: `${config.server.baseUrl}/payments/paypal/success`,
          cancel_url: `${config.server.baseUrl}/payments/paypal/cancel`,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`PayPal order creation failed: ${error}`);
    }

    return await response.json() as PayPalOrderResponse;
  }

  async captureOrder(orderId: string): Promise<unknown> {
    const token = await this.getAccessToken();

    const response = await fetch(
      `${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`PayPal order capture failed: ${error}`);
    }

    return await response.json();
  }

  async createSubscription(planId: string, metadata: Record<string, unknown>): Promise<PayPalSubscriptionResponse> {
    const token = await this.getAccessToken();

    const response = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan_id: planId,
        custom_id: JSON.stringify(metadata),
        application_context: {
          return_url: `${config.server.baseUrl}/payments/paypal/subscription/success`,
          cancel_url: `${config.server.baseUrl}/payments/paypal/subscription/cancel`,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`PayPal subscription creation failed: ${error}`);
    }

    return await response.json() as PayPalSubscriptionResponse;
  }

  async cancelSubscription(subscriptionId: string, reason: string): Promise<void> {
    const token = await this.getAccessToken();

    const response = await fetch(
      `${PAYPAL_API_BASE}/v1/billing/subscriptions/${subscriptionId}/cancel`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`PayPal subscription cancellation failed: ${error}`);
    }
  }

  async verifyWebhook(headers: Record<string, string | string[] | undefined>, body: string): Promise<boolean> {
    const token = await this.getAccessToken();

    const response = await fetch(
      `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transmission_id: headers['paypal-transmission-id'],
          transmission_time: headers['paypal-transmission-time'],
          cert_url: headers['paypal-cert-url'],
          auth_algo: headers['paypal-auth-algo'],
          transmission_sig: headers['paypal-transmission-sig'],
          webhook_id: config.paypal.webhookId,
          webhook_event: JSON.parse(body),
        }),
      }
    );

    if (!response.ok) {
      logger.error('PayPal webhook verification failed');
      return false;
    }

    const data = await response.json() as { verification_status: string };
    return data.verification_status === 'SUCCESS';
  }
}

export const paypalService = new PayPalService();
