# Zindagi — Life, in progress

An original editorial identity for a life-game: geometric lettering, warm surfaces,
five life aspects, visible effort. The user supplied Neurath X Collection as a
reference: https://www.behance.net/gallery/254609333/Neurath-X-Collection .
Behance and Awwwards were inaccessible under the development environment's
network policy. This implementation does not claim to reproduce that collection
or to represent a verified survey of 2025–2026 award winners.

## Typography and identity

- `src/identity.js` draws original Zindagi wordmark paths and a five-petal emblem.
  The wordmark is custom lettering, not a complete custom typeface. The installed app icon uses the light neutral palette.
- Space Grotesk is the interface/display font, locally hosted in `public/fonts`.
  Copyright and SIL Open Font License are included in `OFL-SpaceGrotesk.txt`.
  Source: https://github.com/google/fonts/tree/main/ofl/spacegrotesk .
- No request to a third-party font service is required. System sans-serif is the
  fallback while the font loads; the font is preloaded and uses `font-display: swap`.
- `public/icons/identity.svg` is the source artwork for the app icons.

## Theme and layout

`src/identity.css` owns the identity tokens: paper, surface, raised, ink, subtle,
line, brand-accent, accent-ink, soft, hero-bg and hero-ink. Dark uses slate blue, indigo, and purple; light uses cream, sand, peach, and warm brown from the supplied palette references. Categories retain their color
cues. The saved theme wins; first-time visitors start in light mode regardless of their device preference.

The dashboard leads with the slogan and five-aspect emblem, followed by progress
metrics, quest cards and people. All existing pages use the shared theme. Mobile
keeps the accessible drawer and uses a single column where needed.

## Motion

Finite, staggered page entrances; emblem unfolding; card lift and arrow movement;
animated progress; native dropdown chevrons and existing loading/buffering
indicators. Theme changes crossfade using View Transitions where supported and
switch immediately elsewhere. There is no new perpetual decorative animation.
Reduced-motion preferences disable transitions and animations. Interactions and
content never depend on animation completing.

## Verification

Production build, existing server/unit suite, and browser checks covering both
themes on all six pages at 320, 390, 768, 1024 and 1440 pixel widths; drawer
keyboard dismissal, quest briefing, session controls and reduced motion. Location,
request consent, scoring and media permissions are unchanged by the redesign.

The “Five aspects. One you.” caption sits centered across the hero, separate from
the decorative emblem, with readable text on desktop and mobile.

Home now uses a compact app dashboard: daily completions, total points and level
progress, one recommended next action, two alternative challenges, a small balance
chart, recent activity and navigation shortcuts. Full challenge browsing stays in
Challenges, and discovery stays in Community. The signature slogan is secondary.
