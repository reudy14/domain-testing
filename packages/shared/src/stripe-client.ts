// The `pure` entry point loads Stripe.js only when loadStripe() is called
// (when the customer presses Pay). The default entry injects it on import,
// i.e. on every page, sending every visitor's IP address to Stripe.
import { loadStripe as _loadStripe } from '@stripe/stripe-js/pure';
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
