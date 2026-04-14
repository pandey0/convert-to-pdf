import { NextResponse } from 'next/server';
import { razorpay } from '../../../lib/razorpay';
import { prisma } from '../../../lib/db';
import { rateLimit } from '../../../lib/rate-limit';
import { isUserInIndia } from '../../../lib/geo';

export async function POST(req) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const limitResult = rateLimit(ip, 5, 60000); // 5 orders per minute

    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, message: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const inIndia = await isUserInIndia(ip);
    const amount = inIndia ? 10 * 100 : 250; // ₹10 in paise (1000) OR $2.50 in cents (250)
    const currency = inIndia ? 'INR' : 'USD';

    const options = {
      amount,
      currency,
      receipt: `rcpt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    // Save to database
    await prisma.conversionOrder.create({
      data: {
        razorpayOrderId: order.id,
        status: 'created',
        amount: amount,
        currency: currency,
      },
    });

    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create order' },
      { status: 500 }
    );
  }
}
