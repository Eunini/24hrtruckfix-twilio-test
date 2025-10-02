require('dotenv').config();
const express = require('express');
const TwilioSignatureValidator = require('./middleware/validateTwilio');

// Validate required environment variables
const requiredEnvVars = ['TWILIO_AUTH_TOKEN', 'TWILIO_ACCOUNT_SID'];
const missing = requiredEnvVars.filter(varName => !process.env[varName]);

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:', missing.join(', '));
  console.error('Please create a .env file based on .env.example');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Parse URL-encoded bodies (Twilio sends form data)
app.use(express.urlencoded({ extended: true }));

// Parse JSON bodies for other endpoints
app.use(express.json());

// Initialize Twilio signature validator with support for multiple tokens
const authTokens = process.env.TWILIO_AUTH_TOKEN.split(',').map(token => token.trim());
const twilioValidator = new TwilioSignatureValidator(authTokens, process.env.TWILIO_ACCOUNT_SID);

// Health check endpoint (no authentication required)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'twilio-webhook-security-demo'
  });
});

// Twilio SMS webhook endpoint with signature validation
app.post('/sms', twilioValidator.middleware(), (req, res) => {
  console.log('📱 Valid SMS webhook received:', {
    from: req.body.From,
    to: req.body.To,
    body: req.body.Body,
    messageSid: req.body.MessageSid,
    accountSid: req.body.AccountSid,
    timestamp: new Date().toISOString()
  });

  // Respond with TwiML to acknowledge receipt
  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thanks for your message! We received: "${req.body.Body}"</Message>
</Response>`);
});

// Twilio voice webhook endpoint (example of reusing the same validator)
app.post('/voice', twilioValidator.middleware(), (req, res) => {
  console.log('📞 Valid voice webhook received:', {
    from: req.body.From,
    to: req.body.To,
    callSid: req.body.CallSid,
    callStatus: req.body.CallStatus,
    timestamp: new Date().toISOString()
  });

  // Respond with TwiML
  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hello! This is a secure Twilio webhook demo.</Say>
</Response>`);
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Something went wrong processing your request'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Twilio webhook security demo server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📱 SMS webhook: http://localhost:${PORT}/sms`);
  console.log(`📞 Voice webhook: http://localhost:${PORT}/voice`);
  console.log(`🔐 Using ${authTokens.length} auth token(s) for validation`);
});