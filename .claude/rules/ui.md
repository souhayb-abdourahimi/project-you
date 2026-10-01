# UI rules

- Use tokens from `src/theme` and primitives from `src/components/ui`. No hard-coded colours, font sizes or spacing.
- No user-visible string in code: use `t('…')` with keys in both `src/i18n/locales/fr.ts` and `en.ts` (a test enforces parity).
- Screens stay thin: call a store or a domain engine; no business rules in components. Keep components < ~200 lines.
- Every screen handles loading, empty, error, offline and "Donnée indisponible" states.
- Interactive elements: `accessibilityRole`, `accessibilityLabel`, touch target ≥ 44×44, keyboard reachable on web.
- Respect reduce-motion; animations ≤ 250 ms, subtle.
- Tone: warm, never guilt-inducing. A short session is a win, never a failure.
- Anything MOCK shows `<MockBadge />`.
