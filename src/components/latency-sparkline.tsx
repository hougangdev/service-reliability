"use client";

import { useState, useRef } from "react";

export type SparklinePoint = { value: number; time: string };

type Props = {
  /** Either raw numbers or {value, time} for tooltips */
  data: number[] | SparklinePoint[];
  width?: number;
  height?: number;
  className?: string;
};

function isPointArray(d: number[] | SparklinePoint[]): d is SparklinePoint[] {
  return d.length > 0 && typeof d[0] === "object";
}

/**
 * Lightweight SVG polyline sparkline — no external charting dependency.
 * Renders a mini latency trend line. Points are normalized min→max.
 * Hover over any point to see latency and timestamp.
 */
export function LatencySparkline({
  data,
  width = 120,
  height = 28,
  className,
}: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const hasTimestamps = isPointArray(data);
  const values = hasTimestamps ? data.map((d) => d.value) : data;
  const valid = values.filter((v) => v != null && !isNaN(v));

  if (valid.length < 2) {
    return <span className="text-zinc-600 text-xs">—</span>;
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const pad = 2;

  const coords = valid.map((v, i) => ({
    x: pad + (i / (valid.length - 1)) * (width - pad * 2),
    y: pad + (1 - (v - min) / range) * (height - pad * 2),
    value: v,
    time: hasTimestamps ? (data as SparklinePoint[])[i]?.time : undefined,
  }));

  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  const latest = valid[valid.length - 1];
  const strokeColour =
    latest < 200 ? "#34d399" : latest < 1000 ? "#fbbf24" : "#f87171";

  const hp = hovered !== null ? coords[hovered] : null;

  return (
    <div className="relative inline-block" style={{ width, height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-hidden
      >
        <polyline
          points={polyline}
          fill="none"
          stroke={strokeColour}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
        {/* Invisible hit targets for each data point */}
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={Math.max(4, width / valid.length / 2)}
            fill="transparent"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        {/* Visible dot on hovered point */}
        {hp && (
          <circle cx={hp.x} cy={hp.y} r={2.5} fill={strokeColour} />
        )}
      </svg>
      {hp && (
        <div
          className="absolute z-50 pointer-events-none rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-zinc-200 whitespace-nowrap shadow-lg"
          style={{
            left: Math.min(hp.x, width - 60),
            bottom: height + 4,
          }}
        >
          <span className="font-mono font-medium">{hp.value}ms</span>
          {hp.time && (
            <span className="text-zinc-400 ml-1.5">
              {new Date(hp.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
