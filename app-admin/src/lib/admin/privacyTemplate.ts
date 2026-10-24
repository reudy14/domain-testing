// Starting text for the privacy policy page (Site design → Footer → "Create
// a draft"). It describes what this software does with customer data; the
// studio fills in the [bracketed] parts and stays responsible for the
// content being accurate. Keep it in step with pocketbase/pb_hooks/privacy.

export const PRIVACY_PAGE_SLUG = 'privacy';

export const privacyTemplateHtml = `<h2>Privacy policy</h2>
<p><em>Last updated: [date]</em></p>

<h3>Who we are</h3>
<p>[Business name], [address], [company registration number if any] is responsible for your personal data. Contact: [email].</p>

<h3>What we collect and why</h3>
<p>When you book or buy something on this website we collect your <strong>name, email address, phone number</strong> (optional) and any <strong>notes</strong> you add. We use them to arrange your appointment, send your confirmation and contact you about your booking. The legal basis is the performance of our contract with you (Article 6(1)(b) GDPR). We keep a record of your order (what you booked, when and the amount paid) because accounting law requires it (Article 6(1)(c)).</p>
<p>Please do not write health information in the booking notes. We ask about anything relevant in person at your appointment.</p>

<h3>Payments</h3>
<p>Card payments are handled by Stripe. We never see or store your card details. Stripe processes your payment and email address under its own privacy policy: <a href="https://stripe.com/privacy">stripe.com/privacy</a>.</p>

<h3>Who else processes your data</h3>
<ul>
<li>[Hosting provider, country] — hosts this website and its database.</li>
<li>Stripe — payment processing.</li>
<li>[Email provider, e.g. Brevo] — sends booking confirmations.</li>
<li>[Google Calendar — if bookings are added to our calendar: which details]</li>
</ul>
<p>We do not sell your data or use it for advertising.</p>

<h3>How long we keep it</h3>
<ul>
<li>Details entered at checkout without completing payment: deleted after [30] days.</li>
<li>Orders: your contact details are removed [after N months / when you ask]; the order record without them is kept for [N] years as required for our accounts.</li>
<li>Server logs (including IP addresses): [a few] days.</li>
</ul>

<h3>Cookies</h3>
<p>This website uses only cookies that are needed for it to work: one that remembers your basket while you book (deleted after checkout), and the payment form's own cookies set by Stripe to prevent fraud. We do not use analytics or advertising cookies. The site's fonts are served from our own server.</p>

<h3>Your rights</h3>
<p>You can ask us for a copy of your data, to correct it, to delete it, to restrict or object to how we use it, or to receive it in a portable format. Email [email] and we will reply within one month. Where we must keep an order for accounting, we remove your contact details from it instead of deleting it.</p>
<p>You can also complain to a data protection authority — [e.g. the Office for Personal Data Protection (ÚOOÚ), www.uoou.cz].</p>`;
