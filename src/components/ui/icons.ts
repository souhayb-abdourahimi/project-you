import type { SFSymbol } from 'expo-symbols';
import Activity from 'lucide-react-native/icons/activity';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowLeftRight from 'lucide-react-native/icons/arrow-left-right';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import Bell from 'lucide-react-native/icons/bell';
import BicepsFlexed from 'lucide-react-native/icons/biceps-flexed';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import CalendarSync from 'lucide-react-native/icons/calendar-sync';
import Camera from 'lucide-react-native/icons/camera';
import Carrot from 'lucide-react-native/icons/carrot';
import ChartLine from 'lucide-react-native/icons/chart-line';
import Check from 'lucide-react-native/icons/check';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Circle from 'lucide-react-native/icons/circle';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleMinus from 'lucide-react-native/icons/circle-minus';
import CircleUserRound from 'lucide-react-native/icons/circle-user-round';
import Clock from 'lucide-react-native/icons/clock';
import Cloud from 'lucide-react-native/icons/cloud';
import CloudOff from 'lucide-react-native/icons/cloud-off';
import CloudRain from 'lucide-react-native/icons/cloud-rain';
import Contrast from 'lucide-react-native/icons/contrast';
import Download from 'lucide-react-native/icons/download';
import Dumbbell from 'lucide-react-native/icons/dumbbell';
import FaceGrinning from 'lucide-react-native/icons/face-grinning';
import FaceNeutral from 'lucide-react-native/icons/face-neutral';
import FaceSlightlySmiling from 'lucide-react-native/icons/face-slightly-smiling';
import Flame from 'lucide-react-native/icons/flame';
import Footprints from 'lucide-react-native/icons/footprints';
import HeartHandshake from 'lucide-react-native/icons/heart-handshake';
import Info from 'lucide-react-native/icons/info';
import Leaf from 'lucide-react-native/icons/leaf';
import Link from 'lucide-react-native/icons/link';
import ListChecks from 'lucide-react-native/icons/list-checks';
import Lock from 'lucide-react-native/icons/lock';
import Medal from 'lucide-react-native/icons/medal';
import Minus from 'lucide-react-native/icons/minus';
import Moon from 'lucide-react-native/icons/moon';
import MoveVertical from 'lucide-react-native/icons/move-vertical';
import PersonStanding from 'lucide-react-native/icons/person-standing';
import Play from 'lucide-react-native/icons/play';
import Plus from 'lucide-react-native/icons/plus';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import RotateCcwClock from 'lucide-react-native/icons/rotate-ccw-clock';
import Ruler from 'lucide-react-native/icons/ruler';
import Settings from 'lucide-react-native/icons/settings';
import Share from 'lucide-react-native/icons/share';
import ShoppingCart from 'lucide-react-native/icons/shopping-cart';
import SkipForward from 'lucide-react-native/icons/skip-forward';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Star from 'lucide-react-native/icons/star';
import Sun from 'lucide-react-native/icons/sun';
import Sunrise from 'lucide-react-native/icons/sunrise';
import Target from 'lucide-react-native/icons/target';
import Timer from 'lucide-react-native/icons/timer';
import Trash from 'lucide-react-native/icons/trash';
import Trophy from 'lucide-react-native/icons/trophy';
import Utensils from 'lucide-react-native/icons/utensils';
import Watch from 'lucide-react-native/icons/watch';
import Weight from 'lucide-react-native/icons/weight';
import X from 'lucide-react-native/icons/x';
import Zap from 'lucide-react-native/icons/zap';
import type { ComponentType } from 'react';

/** What every drawn icon accepts (lucide-react-native components over react-native-svg). */
export type IconGlyph = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
}>;

/**
 * The app's icons, by meaning (D-048). Each entry names an explicit drawing, never a font glyph:
 * - `svg`: a vector component drawn with react-native-svg (web and Android). It needs no font, so
 *   it can never turn into a missing-glyph box (the PWA bug on iPhone Safari: the Material Symbols
 *   font was not waited for and the private-use characters showed as squares);
 * - `sf`: the SF Symbol drawn by iOS itself (native iOS only, a system image, not a font);
 * - `md`: the Material name the native Android tab bar draws itself (native tab bar only).
 * Screens name an icon by what it means; this table is the only place that knows the drawings.
 */
export const ICONS = {
  today: { sf: 'sun.max', md: 'today', svg: Sun },
  program: { sf: 'calendar', md: 'calendar_month', svg: CalendarDays },
  nutrition: { sf: 'fork.knife', md: 'restaurant', svg: Utensils },
  progress: { sf: 'chart.line.uptrend.xyaxis', md: 'monitoring', svg: ChartLine },
  profile: { sf: 'person.crop.circle', md: 'account_circle', svg: CircleUserRound },
  settings: { sf: 'gearshape', md: 'settings', svg: Settings },
  workout: { sf: 'figure.strengthtraining.traditional', md: 'fitness_center', svg: Dumbbell },
  walk: { sf: 'figure.walk', md: 'directions_walk', svg: Footprints },
  mobility: { sf: 'figure.mind.and.body', md: 'self_improvement', svg: PersonStanding },
  rest: { sf: 'moon', md: 'bedtime', svg: Moon },
  meal: { sf: 'fork.knife', md: 'restaurant', svg: Utensils },
  checkin: { sf: 'checklist', md: 'event_repeat', svg: ListChecks },
  weight: { sf: 'scalemass', md: 'scale', svg: Weight },
  steps: { sf: 'figure.walk', md: 'footprint', svg: Footprints },
  protein: { sf: 'leaf', md: 'nutrition', svg: Leaf },
  sessions: { sf: 'flame', md: 'local_fire_department', svg: Flame },
  time: { sf: 'clock', md: 'schedule', svg: Clock },
  coach: { sf: 'sparkles', md: 'auto_awesome', svg: Sparkles },
  safety: { sf: 'heart.text.square', md: 'health_and_safety', svg: HeartHandshake },
  offline: { sf: 'icloud.slash', md: 'cloud_off', svg: CloudOff },
  sync: { sf: 'arrow.triangle.2.circlepath', md: 'sync', svg: RefreshCw },
  done: { sf: 'checkmark.circle.fill', md: 'check_circle', svg: CircleCheck },
  todo: { sf: 'circle', md: 'radio_button_unchecked', svg: Circle },
  partial: { sf: 'circle.lefthalf.filled', md: 'contrast', svg: Contrast },
  skipped: { sf: 'minus.circle', md: 'do_not_disturb_on', svg: CircleMinus },
  timer: { sf: 'timer', md: 'timer', svg: Timer },
  swap: { sf: 'arrow.left.arrow.right', md: 'swap_horiz', svg: ArrowLeftRight },
  check: { sf: 'checkmark', md: 'check', svg: Check },
  chevron: { sf: 'chevron.right', md: 'chevron_right', svg: ChevronRight },
  arrow: { sf: 'arrow.right', md: 'arrow_forward', svg: ArrowRight },
  info: { sf: 'info.circle', md: 'info', svg: Info },
  bolt: { sf: 'bolt', md: 'bolt', svg: Zap },
  history: { sf: 'clock.arrow.circlepath', md: 'history', svg: RotateCcwClock },
  shopping: { sf: 'cart', md: 'shopping_cart', svg: ShoppingCart },
  celebrate: { sf: 'star', md: 'auto_awesome', svg: Star },
  back: { sf: 'chevron.left', md: 'chevron_left', svg: ChevronLeft },
  backArrow: { sf: 'arrow.left', md: 'arrow_back', svg: ArrowLeft },
  camera: { sf: 'camera', md: 'photo_camera', svg: Camera },
  plus: { sf: 'plus', md: 'add', svg: Plus },
  minus: { sf: 'minus', md: 'remove', svg: Minus },
  trophy: { sf: 'trophy', md: 'emoji_events', svg: Trophy },
  close: { sf: 'xmark', md: 'close', svg: X },
  target: { sf: 'target', md: 'target', svg: Target },
  bell: { sf: 'bell', md: 'notifications', svg: Bell },
  lock: { sf: 'lock', md: 'lock', svg: Lock },
  devices: { sf: 'applewatch', md: 'watch', svg: Watch },
  export: { sf: 'square.and.arrow.up', md: 'ios_share', svg: Share },
  trash: { sf: 'trash', md: 'delete', svg: Trash },
  sliders: { sf: 'slider.horizontal.3', md: 'tune', svg: SlidersHorizontal },
  play: { sf: 'play.fill', md: 'play_arrow', svg: Play, filled: true },
  skip: { sf: 'forward.end', md: 'skip_next', svg: SkipForward },
  link: { sf: 'link', md: 'link', svg: Link },
  calendarSync: { sf: 'calendar.badge.clock', md: 'event_available', svg: CalendarSync },
  ruler: { sf: 'ruler', md: 'straighten', svg: Ruler },
  download: { sf: 'square.and.arrow.down', md: 'download', svg: Download },
  // Movement families (drawn exercise artwork when no validated photo exists).
  patternSquat: { sf: 'figure.strengthtraining.functional', md: 'sports_gymnastics', svg: PersonStanding },
  patternHinge: { sf: 'figure.cross.training', md: 'fitness_center', svg: Dumbbell },
  patternPush: { sf: 'dumbbell', md: 'exercise', svg: BicepsFlexed },
  patternPull: { sf: 'figure.rower', md: 'rowing', svg: MoveVertical },
  patternCore: { sf: 'figure.core.training', md: 'self_improvement', svg: Activity },
  breakfast: { sf: 'sunrise', md: 'wb_twilight', svg: Sunrise },
  snack: { sf: 'carrot', md: 'nutrition', svg: Carrot },
  record: { sf: 'trophy.fill', md: 'emoji_events', svg: Medal },
  // A 5-step feeling scale, from the lightest to the hardest (never a red or alarming glyph).
  mood1: { sf: 'face.smiling.inverse', md: 'sentiment_very_satisfied', svg: FaceGrinning },
  mood2: { sf: 'face.smiling', md: 'sentiment_satisfied', svg: FaceSlightlySmiling },
  mood3: { sf: 'face.dashed', md: 'sentiment_neutral', svg: FaceNeutral },
  mood4: { sf: 'cloud', md: 'sentiment_dissatisfied', svg: Cloud },
  mood5: { sf: 'cloud.rain', md: 'sentiment_very_dissatisfied', svg: CloudRain },
} as const satisfies Record<string, { sf: SFSymbol; md: string; svg: IconGlyph; filled?: boolean }>;

export type IconName = keyof typeof ICONS;
