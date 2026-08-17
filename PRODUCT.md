# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Local badminton players in and around Palo Alto, CA who need a racket restrung — casual players through club/competitive players who care about consistent tension. They find the site directly (Instagram, word of mouth, search) and either book online or DM the operator directly.

## Product Purpose

A one-person badminton restringing service: customers book a restring online (or arrange details directly via Instagram DM), specify string/tension/grip/cushion preferences, and get their racket back strung carefully within 1-2 days. The admin panel lets the operator track and manage the order queue from submission to pickup.

## Positioning

Price and convenience: cheaper than a shop, and easier to arrange than mailing a racket off or waiting at a big-box counter — customers can message directly to set up exactly what they want (tension, string, drop-off timing), and get careful, consistent stringing back fast. Not fixed to drop-off/pickup only — the business may expand into delivery, so positioning should read as "convenient access to careful stringing," not "come to us."

## Operating Context

Solo/independent operator: one person handles all stringing, order management, and customer communication (primarily Instagram DM). No shop or team behind it. Rackets are tracked individually through a status workflow (pending pickup → racket received → stringing in progress → ready to return → returned) in the admin panel. A customer can submit several rackets in one go; they share a batch id and show up as a single grouped card, but each racket carries its own status so one can be finished ahead of the others. Service capacity is finite — hence the queue/booking model and, at times, a paused-intake period communicated via a site banner.

## Capabilities and Constraints

- Customers choose, per racket: providing their own string vs. buying from in-house stock, tension (24-28 lb range), grip (none/we provide/customer provides), and cushion wrap (none/we provide/customer provides, plus 2, 3 or 4 layers). Drop-off details, needed-by date and notes apply to the whole submission.
- Pricing: $15 with customer-supplied string, $25 with shop-provided string, +$2 grip, +$3 cushion if the shop provides them (the cushion price is flat, regardless of layer count).
- In-house string stock (name + description) is managed from the admin panel and shown to customers only when in stock.
- A configurable site banner (message, active/inactive, and per-page visibility for homepage/booking) lets the operator communicate service status (e.g., paused intake) without a code change.
- Admin roles: owner (can manage other admin accounts) vs. admin (can manage orders/stock but not users). No public signup.
- Backend: Node/Express + Postgres; frontend is plain static HTML/CSS/JS with no build step.

## Brand Commitments

- Name: Palo Alto Badminton Stringing. Primary channel for direct contact: Instagram @palybadmintonstringing.
- Visual identity: deep green + cream palette, Plus Jakarta Sans, a circular green badminton-themed logo mark (`public/logo.png`), badminton racket/shuttlecock line-art as background decoration.
- Voice: direct, concise, personal (e.g., "DM us directly and we'll reply fast") — reflects a solo operator, not a corporate shop.

## Evidence on Hand

- Live copy and pricing already on the homepage (`public/index.html`): $15/$25 pricing, 24-28 lb tension range, 1-2 day turnaround claim.
- No testimonials, case studies, or press currently on the site — do not fabricate any.

## Product Principles

1. Keep booking friction near zero — the whole value prop is "easier than the alternative," so every added field or step must earn its place.
2. Preserve the solo-operator voice; do not let copy drift into generic corporate/agency tone.
3. Design for finite capacity honestly — the queue, status workflow, and banner system exist because one person can only string so many rackets; don't hide or oversell capacity.
4. Leave room for the business to grow (e.g., delivery) without positioning copy that locks it into drop-off-only.
