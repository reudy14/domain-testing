import { loadStripe as _loadStripe } from '@stripe/stripe-js';
import { env } from '$env/dynamic/public';
import { browser } from '$app/environment';

let stripePromise: ReturnType<typeof _loadStripe> | null = null;

export function loadStripe() {
	if (!browser) return null;
	if (!stripePromise) {
		const key = env.PUBLIC_STRIPE_PUBLISHABLE_KEY;
		if (!key) throw new Error('PUBLIC_STRIPE_PUBLISHABLE_KEY is not set');
		stripePromise = _loadStripe(key);
	}
	return stripePromise;
}
