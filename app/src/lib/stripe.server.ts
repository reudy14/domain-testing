import Stripe from 'stripe';
import { env } from '$env/dynamic/private';

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
	if (!stripe) {
		const key = env.STRIPE_SECRET_KEY;
		if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
		stripe = new Stripe(key);
	}
	return stripe;
}

export function getCurrency(): string {
	return env.STRIPE_CURRENCY || 'eur';
}
