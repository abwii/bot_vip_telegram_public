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

    // Vérifier la configuration
    if (!config.paypal.clientId || !config.paypal.clientSecret) {
      const error = 'PayPal configuration missing: clientId or clientSecret not set';
      logger.error(error);
      throw new Error(error);
    }

    logger.info('Requesting new PayPal access token...');

    const auth = Buffer.from(
      `${config.paypal.clientId}:${config.paypal.clientSecret}`
    ).toString('base64');

    try {
      // Ajouter un timeout de 15 secondes pour l'authentification
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      let response;
      try {
        response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
          signal: controller.signal,
        });
        clearTimeout(timeout);
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        if (fetchErr.name === 'AbortError') {
          logger.error({
            apiUrl: `${PAYPAL_API_BASE}/v1/oauth2/token`,
            timeout: 15000
          }, 'PayPal authentication timeout');
          throw new Error('PayPal authentication timeout');
        }
        logger.error({
          errorType: fetchErr.constructor.name,
          errorMessage: fetchErr.message,
          errorCode: fetchErr.code,
          apiUrl: `${PAYPAL_API_BASE}/v1/oauth2/token`
        }, 'PayPal authentication network error');
        throw new Error(`PayPal authentication network error: ${fetchErr.message}`);
      }

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          mode: config.paypal.mode,
          hasClientId: !!config.paypal.clientId,
          clientIdLength: config.paypal.clientId?.length
        }, 'PayPal authentication failed');
        throw new Error(`PayPal auth failed (${response.status}): ${errorText}`);
      }

      const data = await response.json() as PayPalAccessTokenResponse;
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // 1 minute de marge

      logger.info('PayPal access token obtained successfully');
      return this.accessToken;
    } catch (error) {
      // Si c'est déjà une erreur que nous avons lancée, la re-throw
      if (error instanceof Error && error.message.startsWith('PayPal')) {
        throw error;
      }
      // Sinon, logger et wrapper l'erreur
      logger.error({
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      }, 'Unexpected error during PayPal authentication');
      throw error;
    }
  }

  async createOrder(amount: number, currency: string, metadata: Record<string, unknown>): Promise<PayPalOrderResponse> {
    try {
      logger.info({
        amount,
        currency,
        metadata,
        baseUrl: config.server.baseUrl,
        paypalMode: config.paypal.mode,
        apiBase: PAYPAL_API_BASE
      }, 'Creating PayPal order...');

      // Vérifier la configuration avant de continuer
      if (!config.paypal.clientId || !config.paypal.clientSecret) {
        const error = 'PayPal credentials not configured';
        logger.error({
          hasClientId: !!config.paypal.clientId,
          hasClientSecret: !!config.paypal.clientSecret
        }, error);
        throw new Error(error);
      }

      if (!config.server.baseUrl || config.server.baseUrl === 'http://localhost:3000') {
        logger.warn({
          baseUrl: config.server.baseUrl
        }, 'Warning: Using localhost baseUrl for PayPal callbacks');
      }

      const token = await this.getAccessToken();

      const orderData = {
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
      };

      logger.debug({ orderData }, 'PayPal order request data');

      let response;
      let responseText;

      try {
        // Ajouter un timeout de 30 secondes pour éviter les requêtes qui restent bloquées
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        try {
          response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(orderData),
            signal: controller.signal,
          });

          clearTimeout(timeout);
          responseText = await response.text();
        } catch (fetchErr: any) {
          clearTimeout(timeout);
          if (fetchErr.name === 'AbortError') {
            logger.error({
              apiUrl: `${PAYPAL_API_BASE}/v2/checkout/orders`,
              timeout: 30000,
              amount,
              currency
            }, 'PayPal API request timeout after 30 seconds');
            throw new Error('PayPal API request timeout - La requête a pris trop de temps');
          }
          throw fetchErr;
        }

        logger.debug({
          status: response.status,
          statusText: response.statusText,
          responseHeaders: Object.fromEntries(response.headers.entries()),
          responseBodyLength: responseText.length
        }, 'PayPal API response received');

      } catch (fetchErr) {
        logger.error({
          errorType: fetchErr instanceof Error ? fetchErr.constructor.name : typeof fetchErr,
          errorMessage: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
          errorStack: fetchErr instanceof Error ? fetchErr.stack : undefined,
          errorCode: (fetchErr as any)?.code,
          errorErrno: (fetchErr as any)?.errno,
          errorSyscall: (fetchErr as any)?.syscall,
          apiUrl: `${PAYPAL_API_BASE}/v2/checkout/orders`,
          amount,
          currency
        }, 'PayPal API fetch error - Network or connection issue');

        throw new Error(`PayPal API network error: ${fetchErr instanceof Error ? fetchErr.message : 'Unknown error'}`);
      }

      if (!response.ok) {
        let errorDetails;
        try {
          errorDetails = JSON.parse(responseText);
        } catch (parseErr) {
          errorDetails = responseText;
          logger.warn({
            parseError: parseErr instanceof Error ? parseErr.message : String(parseErr),
            rawResponse: responseText.substring(0, 500)
          }, 'Failed to parse PayPal error response');
        }

        logger.error({
          status: response.status,
          statusText: response.statusText,
          errorDetails,
          amount,
          currency,
          baseUrl: config.server.baseUrl,
          mode: config.paypal.mode,
          apiUrl: `${PAYPAL_API_BASE}/v2/checkout/orders`,
          requestData: orderData
        }, 'PayPal order creation failed - API returned error status');

        throw new Error(`PayPal order creation failed (${response.status}): ${JSON.stringify(errorDetails)}`);
      }

      let orderResponse;
      try {
        orderResponse = JSON.parse(responseText) as PayPalOrderResponse;
      } catch (parseErr) {
        logger.error({
          parseError: parseErr instanceof Error ? parseErr.message : String(parseErr),
          rawResponse: responseText.substring(0, 500)
        }, 'Failed to parse PayPal success response');
        throw new Error('Invalid PayPal response format');
      }

      logger.info({
        orderId: orderResponse.id,
        status: orderResponse.status,
        links: orderResponse.links.map(l => ({ rel: l.rel, method: l.method }))
      }, 'PayPal order created successfully');

      return orderResponse;
    } catch (error) {
      // Sérialisation correcte de tous les types d'erreurs
      const errorLog: any = {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        amount,
        currency,
        metadata,
        baseUrl: config.server.baseUrl,
        paypalMode: config.paypal.mode
      };

      if (error instanceof Error) {
        errorLog.errorMessage = error.message;
        errorLog.errorStack = error.stack;
        errorLog.errorName = error.name;
      } else if (typeof error === 'object' && error !== null) {
        // Pour les erreurs qui ne sont pas des instances d'Error
        errorLog.errorObject = JSON.stringify(error, Object.getOwnPropertyNames(error));
      } else {
        errorLog.errorValue = String(error);
      }

      // Ajouter les propriétés supplémentaires pour les erreurs système
      if (error && typeof error === 'object') {
        const err = error as any;
        if (err.code) errorLog.errorCode = err.code;
        if (err.errno) errorLog.errorErrno = err.errno;
        if (err.syscall) errorLog.errorSyscall = err.syscall;
        if (err.address) errorLog.errorAddress = err.address;
        if (err.port) errorLog.errorPort = err.port;
      }

      logger.error(errorLog, 'PayPal createOrder exception');
      throw error;
    }
  }

  async getOrderDetails(orderId: string): Promise<any> {
    const token = await this.getAccessToken();

    const response = await fetch(
      `${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`PayPal get order details failed: ${error}`);
    }

    return await response.json();
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
