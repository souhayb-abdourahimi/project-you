import { ICONS } from '@/components/ui/Icon';

/** The five main destinations (W-9): one icon family, a visible label, the same order everywhere. */
export const TABS = [
  { name: 'index', href: '/', labelKey: 'tabs.today', icon: 'today' },
  { name: 'program', href: '/program', labelKey: 'tabs.program', icon: 'program' },
  { name: 'nutrition', href: '/nutrition', labelKey: 'tabs.nutrition', icon: 'nutrition' },
  { name: 'progress', href: '/progress', labelKey: 'tabs.progress', icon: 'progress' },
  { name: 'profile', href: '/profile', labelKey: 'tabs.profile', icon: 'profile' },
] as const satisfies readonly { name: string; href: string; labelKey: string; icon: keyof typeof ICONS }[];
