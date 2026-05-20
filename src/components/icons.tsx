import React from 'react';
import type { ColorValue } from 'react-native';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  File,
  Folder,
  Image,
  KeyRound,
  Lock,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  ShieldCheck,
  Timer,
  Eye,
  ArrowUpDown,
  X,
  Play,
} from 'lucide-react-native';

const icons = {
  arrowDownToLine: ArrowDownToLine,
  arrowUpDown: ArrowUpDown,
  arrowUpFromLine: ArrowUpFromLine,
  check: Check,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  cloud: Cloud,
  eye: Eye,
  file: File,
  folder: Folder,
  image: Image,
  key: KeyRound,
  lock: Lock,
  plus: Plus,
  play: Play,
  refresh: RefreshCcw,
  search: Search,
  settings: Settings,
  shield: ShieldCheck,
  timer: Timer,
  x: X,
};

export type AppIconName = keyof typeof icons;

export function AppIcon({
  name,
  size = 20,
  color,
  strokeWidth = 2,
}: {
  name: AppIconName;
  size?: number;
  color: ColorValue;
  strokeWidth?: number;
}) {
  const Icon = icons[name];
  return (
    <Icon
      size={size}
      color={color as string}
      strokeWidth={strokeWidth}
    />
  );
}
