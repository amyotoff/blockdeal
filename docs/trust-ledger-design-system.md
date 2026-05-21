# Trust Ledger Design System

BlockDeal uses the Trust Ledger design system for the product app, landing page, and promo materials.

## Brand Direction

- Vibe: calm trust, modern ledger, legal clarity.
- Product feeling: a modern digital notary, not a crypto exchange.
- Core promise: “Both sides agreed. The terms are fixed. The proof is permanent.”
- Avoid: casino crypto visuals, neon, coins, cyberpunk, and heavy legal gloom.

## Tokens

Use `src/index.css` as the source of truth.

| Token | Value | Usage |
| --- | --- | --- |
| `background` | `#F6F8F3` | Warm page and app shell background |
| `foreground` | `#12191F` | Headings, navigation, core text |
| `surface` | `#FFFFFC` | Cards, dialogs, agreement editor |
| `surface-muted` | `#F1F5EE` | Form groups, ledger rows, subtle containers |
| `primary` | `#00B47E` | Main progression, confirmation, receipt highlights |
| `primary-700` | `#007A5A` | Pressed and darker success states |
| `secondary` | `#20313A` | Receipt/proof panels |
| `border` | `#DCE3DA` | Ledger lines, dividers, input borders |
| `muted` | `#52605D` | Labels, helper text, metadata |
| `warning` | `#C7831E` | Pending action states |
| `danger` | `#B4463A` | Errors and destructive actions |

## Typography

- Headings: `font-heading`, Space Grotesk.
- Body and controls: `font-sans`, Inter.
- Hashes, receipts, transaction IDs: `font-mono`, IBM Plex Mono.

## Components

- Primary action: `bg-primary text-white active:bg-primary-700 rounded-xl`.
- Secondary action: `bg-surface text-foreground border border-border`.
- Base card: `bg-surface border border-border rounded-xl` with subtle ledger shadow.
- Muted section: `bg-surface-muted border border-border rounded-lg`.
- Receipt card: `bg-secondary text-white rounded-xl border border-white/10`.
- Status success: `bg-primary-50 text-primary-700 border-primary/20`.
- Pending state: pair `text-warning` with a clear label.

## Icon Style

- Use Lucide React with thin strokes, usually `strokeWidth={1.55}` to `1.75`.
- Prefer refined legal/ledger metaphors: `Scale`, `ScrollText`, `Handshake`, `Signature`, `ReceiptText`, `FileCheck`.
- Place important process icons in small circular mint medallions instead of using bare utility icons.
- Avoid overusing lock icons. Proof should feel calm and official, not paranoid.

## Landing Direction

- Headline: “Agreements fixed. Proof that lasts.”
- Subhead: BlockDeal helps both sides confirm the terms and create a blockchain-backed receipt without legal theatre or crypto noise.
- Primary CTA: “Fix a deal”.
- Secondary CTA: “See sample receipt”.
- Show a large calm product mockup and dark receipt card with a restrained hash preview.

## Product Rules

- Make blockchain invisible until proof matters.
- Show the next action above the fold.
- Use plain-language states: Draft, Invite, Sign, Fixed, Receipt.
- Receipt is the product aha; never bury it.
- Hashes and transaction IDs should be available, copyable, and quiet.
