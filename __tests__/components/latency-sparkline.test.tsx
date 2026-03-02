// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { LatencySparkline } from "@/components/latency-sparkline";

describe("LatencySparkline", () => {
  it("renders an SVG when given sufficient data points", () => {
    const { container } = render(
      <LatencySparkline data={[50, 120, 80, 200, 60]} />
    );
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("polyline")).toBeTruthy();
  });

  it("renders '—' when fewer than 2 data points", () => {
    const { container } = render(<LatencySparkline data={[100]} />);
    expect(container.textContent).toContain("—");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders '—' for empty data", () => {
    const { container } = render(<LatencySparkline data={[]} />);
    expect(container.textContent).toContain("—");
  });

  it("uses custom width and height props", () => {
    const { container } = render(
      <LatencySparkline data={[50, 100, 75]} width={200} height={40} />
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("200");
    expect(svg?.getAttribute("height")).toBe("40");
  });

  it("accepts SparklinePoint[] with timestamps", () => {
    const data = [
      { value: 50, time: "2026-03-03T00:00:00Z" },
      { value: 120, time: "2026-03-03T00:01:00Z" },
      { value: 80, time: "2026-03-03T00:02:00Z" },
    ];
    const { container } = render(<LatencySparkline data={data} />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("polyline")).toBeTruthy();
  });

  it("shows tooltip on hover with latency value", () => {
    const data = [
      { value: 50, time: "2026-03-03T00:00:00Z" },
      { value: 120, time: "2026-03-03T00:01:00Z" },
    ];
    const { container } = render(<LatencySparkline data={data} />);
    const circles = container.querySelectorAll("circle");
    // Hover targets exist for each point
    expect(circles.length).toBe(2);

    // Hover on first circle shows tooltip
    fireEvent.mouseEnter(circles[0]);
    expect(container.textContent).toContain("50ms");

    // Mouse leave hides tooltip
    fireEvent.mouseLeave(circles[0]);
    expect(container.textContent).not.toContain("50ms");
  });

  it("shows visible dot on hovered point", () => {
    const data = [
      { value: 50, time: "2026-03-03T00:00:00Z" },
      { value: 120, time: "2026-03-03T00:01:00Z" },
    ];
    const { container } = render(<LatencySparkline data={data} />);
    const circles = container.querySelectorAll("circle");

    // Before hover: only invisible hit targets
    expect(container.querySelectorAll("circle").length).toBe(2);

    // After hover: hit targets + visible indicator dot
    fireEvent.mouseEnter(circles[0]);
    expect(container.querySelectorAll("circle").length).toBe(3);
  });
});
