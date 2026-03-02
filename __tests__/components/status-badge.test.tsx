// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/status-badge";

describe("StatusBadge", () => {
  it("renders UP with correct text when ok=true", () => {
    render(<StatusBadge ok={true} />);
    expect(screen.getByText("UP")).toBeTruthy();
  });

  it("renders DOWN with correct text when ok=false", () => {
    render(<StatusBadge ok={false} />);
    expect(screen.getByText("DOWN")).toBeTruthy();
  });

  it("renders INACTIVE when isActive=false", () => {
    render(<StatusBadge ok={null} isActive={false} />);
    expect(screen.getByText("INACTIVE")).toBeTruthy();
  });

  it("renders UNKNOWN when ok=null and service is active", () => {
    render(<StatusBadge ok={null} isActive={true} />);
    expect(screen.getByText("UNKNOWN")).toBeTruthy();
  });

  it("defaults isActive to true", () => {
    render(<StatusBadge ok={true} />);
    expect(screen.queryByText("INACTIVE")).toBeNull();
  });
});
