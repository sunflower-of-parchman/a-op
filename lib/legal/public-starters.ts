export type LegalStarterDocumentId = "privacy" | "terms";

export interface LegalDocumentStarter {
  readonly id: LegalStarterDocumentId;
  readonly title: string;
  readonly introduction: string;
  readonly bodyText: string;
}

const PRIVACY_STARTER: LegalDocumentStarter = Object.freeze({
  id: "privacy",
  title: "Privacy Policy",
  introduction:
    "This editable starter explains how an artist-owned a-op installation may collect, use, store, and protect information. The artist must replace bracketed details, confirm the installed capabilities, and approve the exact document before treating it as their privacy policy.",
  bodyText: `Effective date: [date]

Who operates this site

This site is operated by [artist name]. Questions about this privacy notice or the information associated with your account can be sent to [contact email].

Information this site may collect

Account information may include your name and email address when you use Sign in with ChatGPT. The site may also store profile choices, favorites, playlists, listening history, course progress, customer-library records, memberships, subscription history, download and license credits, licenses, and other access records when those capabilities are active.

When you submit a contact form, the site stores the name, email address, category, subject, message, and the consent version you accepted. When consent-aware telemetry is active, the site may store limited page and product events described in the artist's current telemetry settings. The artist should list any additional information collected by this installation here.

How information is used

Information is used to operate the site, maintain accounts, remember customer choices, provide streaming and protected materials, record access and progress, respond to inquiries, prevent abuse, diagnose problems, and maintain the artist's records. The artist should describe any additional use here.

Storage and service boundary

Structured site state is stored in Sites-provided D1. Approved music, artwork, images, video, documents, exports, and other files are stored in Sites-provided R2. Ordinary site operation makes no model request. Material enters ChatGPT Work only when the artist deliberately shares it there.

Current Sites guidance states that Sites does not support data residency or inference residency at launch. The artist should review the current Sites terms, workspace configuration, connected services, and applicable regional requirements before publishing this policy.

Payments and connected services

This Sites installation demonstrates commerce only through Stripe Test mode. It accepts no real payment method, makes no real charge, and moves no money. Stripe-hosted Test Checkout owns test payment entry; a-op does not collect or store payment-card fields. A future compatible deployment must document its actual payment provider and practices before accepting live transactions.

Sharing and disclosure

The site uses the service providers required to host and operate the selected capabilities. The artist should name those providers and explain when information may be disclosed to comply with law, protect the service, complete an authorized request, or support a business transfer.

Retention and security

The artist should state how long each account, contact, access, commerce, telemetry, and operational record is retained. Reasonable technical and organizational safeguards reduce risk, though no online service can promise absolute security.

Your choices and rights

You may ask the artist to explain, correct, export, or delete information associated with you, subject to applicable law and records the artist must retain. Account controls may also let you update your name, manage preferences, sign out, or request account deletion. The artist should add the rights that apply in the places where they and their customers operate.

Children

The artist should state whether this site is intended for children and describe any age or guardian-consent requirements that apply.

Changes

The artist may update this notice as the site, active capabilities, or legal requirements change. The effective date above should identify the current approved version.

Contact

Privacy questions and requests can be sent to [contact email or contact-page link].`,
});

const TERMS_STARTER: LegalDocumentStarter = Object.freeze({
  id: "terms",
  title: "Terms and Conditions",
  introduction:
    "This editable starter describes a visitor's agreement with an artist-owned a-op installation. The artist must replace bracketed details, add their actual business and licensing terms, and approve the exact document before treating it as their terms of use.",
  bodyText: `Effective date: [date]

Agreement

These terms govern your use of the website and services operated by [artist name]. By using the site, you agree to these terms and the published privacy notice. If you do not agree, do not use the site.

Artist content and ownership

Music, recordings, artwork, images, writing, video, Courses, downloads, license documents, and other artist material remain owned by the artist or the identified rights holder. Access to the site does not transfer ownership. You may use material only as expressly allowed by the access, purchase, membership, subscription, or license attached to it.

Accounts

Sign in with ChatGPT supplies identity for account access. You are responsible for activity associated with your account and for keeping your connected account secure. Provide accurate information and contact the artist if you believe your account or access has been compromised.

Streaming, downloads, and customer libraries

Streaming access is personal and subject to the access shown by the site. A download gives you the file access described at the time it is granted; it does not grant public-performance, synchronization, distribution, resale, sublicensing, or other project rights unless an accompanying license expressly says so.

Licensing

Each music license is governed by its exact published terms, project information, territory, duration, and permitted use. One project or use may require a separate license for each track. The artist should insert the actual license types, restrictions, credit requirements, and request process used by this installation.

Memberships, subscriptions, and credits

When active, a membership or subscription provides the access and included credits described by its published plan. The artist should state billing intervals, renewal, cancellation, expiration, rollover, refund, and credit-consumption rules. Credits have no cash value unless the artist's published terms expressly say otherwise.

Stripe Test mode commerce simulation

This Sites installation demonstrates commerce only through Stripe Test mode. No real payment will be accepted and no money is moved. Test prices, objects, orders, and checkout results are fictional simulations. Live commerce requires a future compatible deployment, current policy and platform review, deliberate configuration, and the artist's approval.

Courses and video

Course and video access may be public or limited to an account, membership, subscription, or grant. Course completion indicators document progress inside this installation and are not an academic credential unless the artist expressly states otherwise.

Acceptable use

Do not interfere with the site, bypass access controls, scrape protected material, upload malicious code, impersonate another person, use another customer's access, infringe rights, or use the service unlawfully. Do not copy, redistribute, sell, train on, or create derivative uses from protected artist material without the permission required by the artist and applicable law.

Availability and changes

The artist may maintain, change, suspend, or retire site capabilities and content. Durable customer access already granted should be handled according to the artist's published plan, license, refund, and continuity terms. The artist should describe any service-level or support commitment here.

Disclaimers and liability

The artist should add the warranty disclaimers, liability limits, indemnity terms, and consumer-law exceptions appropriate to their business and jurisdiction. Nothing in this starter limits rights that cannot legally be limited.

Suspension and termination

The artist may restrict access for a material breach, unlawful conduct, security risk, or abuse, subject to applicable law and the artist's published refund and continuity obligations. You may stop using the site and may request account deletion through the available account controls.

Governing law and disputes

The artist should identify the governing law, venue, informal-resolution process, and any mandatory consumer protections that apply.

Changes and contact

The artist may update these terms as the site and active capabilities change. The effective date above should identify the current approved version. Questions can be sent to [contact email or contact-page link].`,
});

export function getLegalDocumentStarter(
  id: LegalStarterDocumentId,
): LegalDocumentStarter {
  return id === "privacy" ? PRIVACY_STARTER : TERMS_STARTER;
}
