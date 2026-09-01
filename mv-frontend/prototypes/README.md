# Prototypes

Design work from before the app used real APIs. **Nothing here is imported by
the application**, and nothing here ships — the build only reads `src/` and
`public/`, and the linter only reads `src/`.

Kept rather than deleted because the ideas are worth having back, and moved out
of `src/pages/` because sitting there they were actively misleading: two of them
share a name with a real component that superseded them, and between them they
produced 34 of the project's 36 lint errors, burying the two that were real.

| File | What it is | Superseded by |
|---|---|---|
| `poster.jsx` | Placeholder poster art generated from a film's palette — geometric archetypes, so every card looks authored rather than blank. Never reproduces real artwork. | `src/components/ui/Poster.jsx`, which shows the real cover and falls back to a mark |
| `star-rating.jsx` | Half-star precision, hover preview, click the same star to clear | `src/components/ui/StarRating.jsx` |
| `films.jsx` | Sample catalogue — fictional and public-domain titles, no real branding | TMDB, RAWG, Open Library and MusicBrainz |
| `tweaks-panel.jsx` | A live design-tweaking shell that talks to a host page over `postMessage` | nothing — this one was never part of the app |

## Why they might come back

`poster.jsx` is the interesting one. Cover art is missing often enough to
matter — the Cover Art Archive has no scan for a good share of albums, and
Open Library serves plenty of books without one — and palette-generated
artwork is a better answer than a grey box with initials in it.

`films.jsx` would give a demo mode that runs with no API keys at all, which is
the difference between someone cloning this repo seeing the app and seeing an
empty page.
