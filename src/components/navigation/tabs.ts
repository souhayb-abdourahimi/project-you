export const TABS = [
  { name: 'index', href: '/', labelKey: 'tabs.today', sf: 'sun.max', md: 'today' },
  {
    name: 'program',
    href: '/program',
    labelKey: 'tabs.program',
    sf: 'figure.strengthtraining.traditional',
    md: 'fitness_center',
  },
  { name: 'nutrition', href: '/nutrition', labelKey: 'tabs.nutrition', sf: 'fork.knife', md: 'restaurant' },
  { name: 'progress', href: '/progress', labelKey: 'tabs.progress', sf: 'chart.line.uptrend.xyaxis', md: 'monitoring' },
  { name: 'explore', href: '/explore', labelKey: 'tabs.explore', sf: 'map', md: 'explore' },
] as const;
