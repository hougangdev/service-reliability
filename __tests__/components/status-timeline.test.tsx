// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { StatusTimeline } from "@/components/status-timeline";

const checks = [
  { ok: true, checkedAt: "2026-03-03T00:02:00Z" },
  { ok: false, checkedAt: "2026-03-03T00:01:00Z" },
  { ok: true, checkedAt: "2026-03-03T00:00:00Z" },
];

describe("StatusTimeline", () => {
  it("renders correct number of dots", () => {
    const { container } = render(<StatusTimeline checks={checks} />);
    // Reversed: oldest → newest, so 3 dots
    const dots = container.querySelectorAll("span.inline-block");
    expect(dots.length).toBe(3);
  });

  it("renders 'No data' for empty checks", () => {
    const { container } = render(<StatusTimeline checks={[]} />);
    expect(container.textContent).toContain("No data");
  });

  it("shows tooltip with status and time on hover", () => {
    const { container } = render(<StatusTimeline checks={checks} />);
    const dots = container.querySelectorAll("span.inline-block");

    // Hover on first dot (oldest, ok=true after reversal)
    fireEvent.mouseEnter(dots[0]);
    expect(container.textContent).toContain("UP");

    // Hover on second dot (middle, ok=false)
    fireEvent.mouseLeave(dots[0]);
    fireEvent.mouseEnter(dots[1]);
    expect(container.textContent).toContain("DOWN");
  });

  it("highlights hovered dot with ring", () => {
    const { container } = render(<StatusTimeline checks={checks} />);
    const dots = container.querySelectorAll("span.inline-block");

    fireEvent.mouseEnter(dots[0]);
    expect(dots[0].className).toContain("ring-1");

    fireEvent.mouseLeave(dots[0]);
    expect(dots[0].className).not.toContain("ring-1");
  });

  it("respects max prop", () => {
    const { container } = render(<StatusTimeline checks={checks} max={2} />);
    const dots = container.querySelectorAll("span.inline-block");
    expect(dots.length).toBe(2);
  });
});
