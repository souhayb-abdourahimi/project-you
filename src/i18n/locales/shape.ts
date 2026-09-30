import type fr from './fr';

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

/** Every locale must have exactly the keys of the French source locale. */
export type LocaleShape = Widen<typeof fr>;
