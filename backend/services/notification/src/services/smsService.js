let twilioClient = null;
if (process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) {
  twilioClient = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
}

const sendSMS = async (phoneNumber, message) => {
  if (!phoneNumber) {
    console.warn('[SMSService] No phone number provided');
    return;
  }

  const maskedPhone = String(phoneNumber).replace(/.(?=.{4})/g, '*');
  if (twilioClient) {
    try {
      await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_FROM,
        to: phoneNumber,
      });
      console.log(`[SMSService] Sent SMS to ${maskedPhone}`);
    } catch (error) {
      console.error(`[SMSService] Twilio error:`, error.message);
    }
    return;
  }

  console.log(`[SMSService] (mock) SMS dispatched to ${maskedPhone}`);
};

module.exports = { sendSMS };
