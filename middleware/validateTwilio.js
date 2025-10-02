const crypto = require('crypto');

/**
 * Middleware to validate Twilio webhook signatures
 * Supports multiple auth tokens for key rotation without downtime
 */
class TwilioSignatureValidator {
  constructor(authTokens, accountSid) {
    // Support both single token and array of tokens
    this.authTokens = Array.isArray(authTokens) ? authTokens : [authTokens];
    this.accountSid = accountSid;
    
    if (!this.authTokens.length || this.authTokens.some(token => !token)) {
      throw new Error('TWILIO_AUTH_TOKEN must be provided and non-empty');
    }
    
    if (!this.accountSid) {
      throw new Error('TWILIO_ACCOUNT_SID must be provided');
    }
  }

  /**
   * Validate Twilio signature using HMAC-SHA1
   * @param {string} signature - The X-Twilio-Signature header value
   * @param {string} url - The full URL of the webhook endpoint
   * @param {object} params - The POST parameters sent by Twilio
   * @param {string} authToken - The auth token to validate against
   * @returns {boolean} - True if signature is valid
   */
  validateSignature(signature, url, params, authToken) {
    try {
      // Create the signature string by concatenating URL and sorted parameters
      const signatureString = url + Object.keys(params)
        .sort()
        .reduce((acc, key) => acc + key + params[key], '');

      // Generate HMAC-SHA1 signature
      const expectedSignature = crypto
        .createHmac('sha1', authToken)
        .update(signatureString, 'utf-8')
        .digest('base64');

      // Use constant-time comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'base64'),
        Buffer.from(expectedSignature, 'base64')
      );
    } catch (error) {
      console.error('Error validating Twilio signature:', error.message);
      return false;
    }
  }

  /**
   * Express middleware function to validate Twilio webhooks
   * @returns {Function} Express middleware function
   */
  middleware() {
    return (req, res, next) => {
      const signature = req.get('X-Twilio-Signature');
      
      if (!signature) {
        console.warn('Webhook validation failed: Missing X-Twilio-Signature header');
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Missing Twilio signature header'
        });
      }

      // Construct the full URL (important for signature validation)
      const protocol = req.get('X-Forwarded-Proto') || req.protocol;
      const host = req.get('X-Forwarded-Host') || req.get('Host');
      const url = `${protocol}://${host}${req.originalUrl}`;

      // Try validation with each available auth token
      const isValid = this.authTokens.some(token => 
        this.validateSignature(signature, url, req.body, token)
      );

      if (!isValid) {
        console.warn('Webhook validation failed: Invalid signature', {
          url,
          signature: signature.substring(0, 10) + '...',
          timestamp: new Date().toISOString()
        });
        
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Invalid Twilio signature'
        });
      }

      console.log('Webhook validation successful', {
        url,
        timestamp: new Date().toISOString(),
        accountSid: this.accountSid
      });

      next();
    };
  }
}

module.exports = TwilioSignatureValidator;