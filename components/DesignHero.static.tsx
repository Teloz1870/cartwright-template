/**
 * B3 static seam variant — the one-line aurora hero WITHOUT the
 * three-scenes plugin (site-profile program). The materializer copies this
 * file over `components/DesignHero.tsx` when the three-scenes plugin is not
 * in the profile; NOTHING imports it in the shipped engine (byte-identical
 * until then).
 *
 * Same contract as the plugin component: it renders nothing when the 3D
 * layer is unavailable and the pack's own CSS background stays the visible
 * hero — exactly the plugin's unsupported/reduced-motion fallback.
 */
export function DesignHero({
  intensity = 0.7,
  className,
}: {
  /** 0..1 density/brightness. Default 0.7 (unused without the 3D layer). */
  intensity?: number;
  className?: string;
}) {
  void intensity;
  void className;
  return null;
}
