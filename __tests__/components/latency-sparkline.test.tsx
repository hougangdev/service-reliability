// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
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
});
