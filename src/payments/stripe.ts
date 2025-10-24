import Stripe from 'stripe';
import { config } from '../config';
import { logger } from '../index';

interface StripeCheckoutResponse {
  sessionId: string;
  url: string;
}

export class StripeService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2025-09-30.clover',
    });
  }

  async createCheckoutSession(
    amount: number,
    currency: string,
    metadata: Record<string, string>
  ): Promise<StripeCheckoutResponse> {
    try {
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: {
                name: metadata.planName || 'VIP Subscription',
                description: metadata.planDescription || '',
              },
              unit_amount: Math.round(amount * 100), // Amount in cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${config.server.baseUrl}/payments/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.server.baseUrl}/payments/stripe/cancel`,
        metadata,
        client_reference_id: metadata.telegramId,
      });

      return {
        sessionId: session.id,
        url: session.url || '',
      };
    } catch (error) {
      logger.error({ error }, 'Stripe checkout session creation failed');
      throw new Error(`Stripe checkout session creation failed: ${(error as Error).message}`);
    }
  }

  async getSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    try {
      return await this.stripe.checkout.sessions.retrieve(sessionId);
    } catch (error) {
      logger.error({ error }, 'Stripe get session failed');
      throw new Error(`Stripe get session failed: ${(error as Error).message}`);
    }
  }

  async refundPayment(paymentIntentId: string, amount?: number): Promise<Stripe.Refund> {
    try {
      const refundParams: Stripe.RefundCreateParams = {
        payment_intent: paymentIntentId,
      };

      if (amount) {
        refundParams.amount = Math.round(amount * 100);
      }

      return await this.stripe.refunds.create(refundParams);
    } catch (error) {
      logger.error({ error }, 'Stripe refund failed');
      throw new Error(`Stripe refund failed: ${(error as Error).message}`);
    }
  }

  verifyWebhook(payload: string | Buffer, signature: string): Stripe.Event | null {
    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        config.stripe.webhookSecret
      );
    } catch (error) {
      logger.error({ error }, 'Stripe webhook verification error');
      return null;
    }
  }

  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      return await this.stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      logger.error({ error }, 'Stripe get payment intent failed');
      throw new Error(`Stripe get payment intent failed: ${(error as Error).message}`);
    }
  }
}

export const stripeService = new StripeService();
