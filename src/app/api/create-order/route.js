import { NextResponse } from 'next/server';
import { razorpay } from '../../../lib/razorpay';
import { prisma } from '../../../lib/db';

export async function POST(req) {
  try {
    const amount = 99 * 100; // ₹99 in paise
    const currency = 'INR';

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
