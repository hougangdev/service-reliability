type Props = {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
};

/**
 * Lightweight SVG polyline sparkline — no external charting dependency.
 * Renders a mini latency trend line. Points are normalized min→max.
 */
export function LatencySparkline({
  data,
  width = 120,
  height = 28,
  className,
}: Props) {
  const valid = data.filter((v) => v != null && !isNaN(v));
  if (valid.length < 2) {
    return <span className="text-zinc-600 text-xs">—</span>;
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const pad = 2;

  const points = valid
    .map((v, i) => {
      const x = pad + (i / (valid.length - 1)) * (width - pad * 2);
      const y = pad + (1 - (v - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // colour based on latest value vs median
  const latest = valid[valid.length - 1];
  const strokeColour =
    latest < 200 ? "#34d399" : latest < 1000 ? "#fbbf24" : "#f87171";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={strokeColour}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  );
}
