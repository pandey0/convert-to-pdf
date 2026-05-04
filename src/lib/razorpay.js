import Razorpay from 'razorpay';

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

export function requireRazorpayConfig() {
  const missingKeyId = !keyId || keyId.includes('placeholder');
  const missingKeySecret = !keySecret || keySecret.includes('placeholder');

  if (missingKeyId || missingKeySecret) {
    throw new Error('Razorpay configuration is missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
}

export const razorpay = new Razorpay({
  key_id: keyId || '',
  key_secret: keySecret || '',
});
