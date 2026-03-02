// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DriftIndicator } from "@/components/drift-indicator";

describe("DriftIndicator", () => {
  it("shows '—' when drift is null (version unknown)", () => {
    const { container } = render(<DriftIndicator drift={null} />);
    expect(container.textContent).toContain("—");
  });

  it("shows 'Match' when drift=false", () => {
    render(<DriftIndicator drift={false} />);
    expect(screen.getByText("Match")).toBeTruthy();
  });

  it("shows 'Drift' badge when drift=true", () => {
    render(
      <DriftIndicator drift={true} expected="2.1.0" observed="1.9.0" />
    );
    expect(screen.getByText("Drift")).toBeTruthy();
  });

  it("sets a descriptive title on the drift badge", () => {
    render(
      <DriftIndicator drift={true} expected="2.1.0" observed="1.9.0" />
    );
    const badge = screen.getByTitle("Expected 2.1.0, got 1.9.0");
    expect(badge).toBeTruthy();
  });
});
