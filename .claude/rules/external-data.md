# External data rules

- Never invent prices, promotions, opening hours, crowd levels, addresses, equipment, safety info, travel times or statistics.
- Access external data only through interfaces in `src/providers/types.ts`; features never import a concrete provider.
- Providers return `ProviderResult<T>`: `ok` (with `ExternalDataMeta`), `unavailable`, or `error`. UI shows "Donnée indisponible" for `unavailable`.
- Mock providers set `meta.isMock = true`; UI must render the MOCK badge. Mock data never ships as real data.
- Collaborative sources (Open Food Facts) → `confidence: 'medium'` and user confirmation before saving.
- Never label a place "safe"/"dangerous".
