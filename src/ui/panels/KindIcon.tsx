import { Brush, Circle, Folder, Hexagon, Image, Slash, Spline, Square, Type } from 'lucide-react';
import type { LayerKind } from '../../editor/types';

const ICONS: Record<LayerKind, typeof Brush> = {
  paint: Brush,
  path: Spline,
  rect: Square,
  ellipse: Circle,
  line: Slash,
  polygon: Hexagon,
  text: Type,
  image: Image,
  group: Folder,
};

export function KindIcon({ kind, size = 14 }: { kind: LayerKind; size?: number }) {
  const Icon = ICONS[kind] ?? Square;
  return <Icon size={size} strokeWidth={1.75} className="sw-kind-icon" aria-hidden />;
}
