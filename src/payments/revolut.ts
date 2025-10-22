import fetch from 'node-fetch';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../index';

const REVOLUT_API_BASE = 'https://merchant.revolut.com/api/1.0';

interface RevolutOrderResponse {
  id: string;
  public_id: string;
  state: string;
  checkout_url: string;
}

interface RevolutWebhookEvent {
  event: string;
  order_id: string;
  state: string;
  timestamp: string;
}

export class RevolutService {
  async createOrder(
    amount: number,
    currency: string,
    metadata: Record<string, unknown>
  ): Promise<RevolutOrderResponse> {
    const response = await fetch(`${REVOLUT_API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.revolut.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // Montant en centimes
        currency,
        merchant_order_ext_ref: JSON.stringify(metadata),
        capture_mode: 'AUTOMATIC',
        customer_email: metadata.email || undefined,
        settlement_currency: currency,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Revolut order creation failed: ${error}`);
    }

    return await response.json() as RevolutOrderResponse;
  }

  async getOrder(orderId: string): Promise<unknown> {
    const response = await fetch(`${REVOLUT_API_BASE}/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.revolut.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Revolut get order failed: ${error}`);
    }

    return await response.json();
  }

  async captureOrder(orderId: string, amount?: number): Promise<unknown> {
    const body = amount
      ? { amount: Math.round(amount * 100) }
      : {};

    const response = await fetch(
      `${REVOLUT_API_BASE}/orders/${orderId}/capture`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.revolut.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Revolut order capture failed: ${error}`);
    }

    return await response.json();
  }

  async refundOrder(orderId: string, amount?: number, reason?: string): Promise<unknown> {
    const body: Record<string, unknown> = {};

    if (amount) {
      body.amount = Math.round(amount * 100);
    }

    if (reason) {
      body.description = reason;
    }

    const response = await fetch(
      `${REVOLUT_API_BASE}/orders/${orderId}/refund`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.revolut.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Revolut order refund failed: ${error}`);
    }

    return await response.json();
  }

  async cancelOrder(orderId: string): Promise<void> {
    const response = await fetch(
      `${REVOLUT_API_BASE}/orders/${orderId}/cancel`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.revolut.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Revolut order cancellation failed: ${error}`);
    }
  }

  verifyWebhook(signature: string, body: string): boolean {
    try {
      const hmac = crypto.createHmac('sha256', config.revolut.webhookSecret);
      hmac.update(body);
      const expectedSignature = hmac.digest('hex');

      // Comparaison sécurisée pour éviter les timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error({ error }, 'Revolut webhook verification error');
      return false;
    }
  }

  parseWebhookEvent(body: string): RevolutWebhookEvent {
    return JSON.parse(body) as RevolutWebhookEvent;
  }
}

export const revolutService = new RevolutService();
