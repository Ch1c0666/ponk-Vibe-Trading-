import { describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HumanoidRobot } from "../HumanoidRobot";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/humanoid-robot" element={<HumanoidRobot />} />
        <Route path="/humanoid-robot/:segmentKey" element={<HumanoidRobot />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("HumanoidRobot page", () => {
  // -- Tab layout --------------------------------------------------------

  it("renders the page heading", () => {
    renderAt("/humanoid-robot");
    expect(
      screen.getByRole("heading", { name: "Humanoid Robot" }),
    ).toBeInTheDocument();
  });

  it("renders overview tab and 6 segment tabs", () => {
    renderAt("/humanoid-robot");
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
    for (const label of [
      "Harmonic Reducer",
      "Planetary Roller Screw",
      "Frameless Torque Motor",
      "6-Axis Force Sensor",
      "Dexterous Hand",
      "Ball Screw",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("renders structure and reports tabs", () => {
    renderAt("/humanoid-robot");
    expect(screen.getByRole("button", { name: "Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reports" })).toBeInTheDocument();
  });

  // -- Overview tab ------------------------------------------------------

  it("renders 6 segment cards with field labels", () => {
    renderAt("/humanoid-robot");
    // "Segment Positioning" appears in every overview card (6) + may appear elsewhere
    expect(screen.getAllByText("Segment Positioning").length).toBeGreaterThanOrEqual(6);
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThanOrEqual(6);
  });

  it("overview shows supply chain structure", () => {
    renderAt("/humanoid-robot");
    // Tier labels visible in the overview area
    expect(screen.getByText("Upstream · Core Components")).toBeInTheDocument();
    expect(screen.getByText("Midstream · Sensing & Actuation")).toBeInTheDocument();
  });

  // -- Segment tabs -------------------------------------------------------

  it("clicking a segment tab shows the research framework inline", () => {
    renderAt("/humanoid-robot");
    act(() =>
      screen.getByRole("button", { name: "Harmonic Reducer" }).click(),
    );
    expect(screen.getAllByText("Harmonic Reducer").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Research Framework")).toBeInTheDocument();
  });

  // -- Structure tab ------------------------------------------------------

  it("structure tab renders supply chain", () => {
    renderAt("/humanoid-robot");
    act(() => screen.getByRole("button", { name: "Structure" }).click());
    expect(screen.getByText("Upstream · Core Components")).toBeInTheDocument();
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThanOrEqual(9);
  });

  // -- Reports tab --------------------------------------------------------

  it("reports tab shows empty state", () => {
    renderAt("/humanoid-robot");
    act(() => screen.getByRole("button", { name: "Reports" }).click());
    expect(screen.getByText("No reports yet")).toBeInTheDocument();
  });

  // -- Detail pages -------------------------------------------------------

  it("renders detail page for a valid segment key", () => {
    renderAt("/humanoid-robot/harmonicReducer");
    expect(
      screen.getByText("Back to Humanoid Robot overview"),
    ).toBeInTheDocument();
    expect(screen.getByText("Research Framework")).toBeInTheDocument();
  });

  it("all 6 segment detail pages are accessible", () => {
    const keys = [
      "harmonicReducer",
      "planetaryRollerScrew",
      "framelessTorqueMotor",
      "sixAxisForceSensor",
      "dexterousHand",
      "ballScrew",
    ];
    for (const key of keys) {
      const { unmount } = renderAt(`/humanoid-robot/${key}`);
      expect(
        screen.getByText("Back to Humanoid Robot overview"),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("shows invalid segment view for unknown key", () => {
    renderAt("/humanoid-robot/nonexistent");
    expect(screen.getByText("Segment not found")).toBeInTheDocument();
  });

  // -- Safety -------------------------------------------------------------

  it("page contains no real A-share stock code patterns", () => {
    renderAt("/humanoid-robot");
    expect(document.body.textContent).not.toMatch(/\b\d{6}\.(SH|SZ|BJ)\b/i);
  });

  it("page does not trigger fetch on render", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    renderAt("/humanoid-robot");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
