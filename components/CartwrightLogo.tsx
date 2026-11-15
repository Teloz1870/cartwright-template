/**
 * Cartwright wordmark — lowercase "cartwright" with a brand-vermilion dot on
 * "i". Pure typography + a positioned dot (no external font dependency), so it
 * renders identically server-side and scales with the font-size set on it.
 *
 * The dot colour is the Cartwright brand accent (`--cw-brand`, falling back to
 * the literal vermilion). Set the wordmark colour with a text-colour class on
 * the parent.
 */
export function CartwrightLogo({
  className = "",
  title = "Cartwright",
  dotColor = "var(--cw-brand, #c33f16)",
  dotGlow = "var(--cw-brand-shadow-strong, rgb(195 63 22 / 0.7))",
  textGradient,
}: {
  className?: string;
  title?: string;
  /** Override the dot fill (e.g. black when the wordmark sits on a brand banner). */
  dotColor?: string;
  /** Override the dot's glow shadow color. */
  dotGlow?: string;
  /** Optional CSS gradient painted into the wordmark text (clipped to glyphs).
      The i-stem inherits the same gradient; the dot stays its own color. */
  textGradient?: string;
}) {
  const gradientStyle = textGradient
    ? {
        backgroundImage: textGradient,
        WebkitBackgroundClip: "text" as const,
        backgroundClip: "text" as const,
        color: "transparent",
      }
    : undefined;
  return (
    <span
      role="img"
      aria-label={title}
      className={`inline-flex select-none items-baseline font-semibold lowercase leading-none tracking-[-0.02em] ${className}`}
      style={gradientStyle}
    >
      <span aria-hidden>cartwr</span>
      {/* dotless i-stem with its own dot floating a hair above it */}
      <span
        aria-hidden
        className="relative inline-block align-baseline"
        style={{ width: "0.2em", height: "0.72em" }}
      >
        <span
          className={`absolute bottom-0 left-1/2 block -translate-x-1/2 rounded-[0.03em] ${textGradient ? "" : "bg-current"}`}
          style={
            textGradient
              ? { width: "0.13em", height: "0.46em", backgroundImage: textGradient }
              : { width: "0.13em", height: "0.46em" }
          }
        />
        <span
          className="absolute left-1/2 top-0 block -translate-x-1/2 rounded-full"
          style={{
            width: "0.2em",
            height: "0.2em",
            background: dotColor,
            boxShadow: `0 0 0.7em ${dotGlow}`,
          }}
        />
      </span>
      <span aria-hidden>ght</span>
    </span>
  );
}
