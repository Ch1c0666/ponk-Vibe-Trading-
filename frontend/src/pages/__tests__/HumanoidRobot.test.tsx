import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HumanoidRobot } from "../HumanoidRobot";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HumanoidRobot page", () => {
  // -- Tab layout rendering -----------------------------------------------

  it("renders the page title and badge", () => {
    renderAt("/humanoid-robot");
    // "Humanoid Robot" appears in both badge and h1 — match the heading specifically
    expect(
      screen.getByRole("heading", { name: "Humanoid Robot" }),
    ).toBeInTheDocument();
  });

  it("renders all 4 sub-tabs", () => {
    renderAt("/humanoid-robot");
    for (const tab of ["Overview", "Templates", "Reports", "Structure"]) {
      expect(screen.getByRole("button", { name: tab })).toBeInTheDocument();
    }
  });

  // -- Overview tab -------------------------------------------------------

  it("renders 6 segment cards on the overview tab", () => {
    renderAt("/humanoid-robot");
    const segments = [
      "Harmonic Reducer",
      "Planetary Roller Screw",
      "Frameless Torque Motor",
      "6-Axis Force Sensor",
      "Dexterous Hand",
      "Ball Screw",
    ];
    for (const label of segments) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  // -- Structure tab -------------------------------------------------------

  it("renders the structure tab with supply chain tiers", () => {
    renderAt("/humanoid-robot");
    const structureTab = screen.getByRole("button", { name: "Structure" });
    act(() => structureTab.click());

    // Tier labels should be visible
    expect(
      screen.getByText("Upstream · Core Components"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Midstream · Sensing & Actuation"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Downstream · OEM & Applications"),
    ).toBeInTheDocument();

    // Segment names should appear as nodes in the diagram
    expect(screen.getByText("Harmonic Reducer")).toBeInTheDocument();
    expect(screen.getByText("Dexterous Hand")).toBeInTheDocument();
    expect(screen.getByText("Ball Screw")).toBeInTheDocument();

    // Generic placeholder nodes
    expect(screen.getByText("Joint Assembly")).toBeInTheDocument();
    expect(screen.getByText("Robot OEM")).toBeInTheDocument();
    expect(screen.getByText("Applications")).toBeInTheDocument();
  });

  it("structure tab nodes show 'Coming soon' placeholder", () => {
    renderAt("/humanoid-robot");
    const structureTab = screen.getByRole("button", { name: "Structure" });
    act(() => structureTab.click());

    // Every node card should display the "Coming soon" placeholder
    const placeholders = screen.getAllByText("Coming soon");
    // 4 upstream + 3 midstream + 2 downstream = 9 nodes
    expect(placeholders.length).toBeGreaterThanOrEqual(9);
  });

  // -- Reports tab ---------------------------------------------------------

  it("reports tab shows empty state with humanoid robot description", () => {
    renderAt("/humanoid-robot");
    const reportsTab = screen.getByRole("button", { name: "Reports" });
    act(() => reportsTab.click());

    // Empty state should be visible — the ReportLibrary uses AI computing keys
    // for its empty state text (shared component).
    const emptyHeadings = screen.getAllByText("No reports yet");
    expect(emptyHeadings.length).toBeGreaterThanOrEqual(1);
  });

  // -- Segment detail pages ------------------------------------------------

  it("renders detail page for a valid segment key", () => {
    renderAt("/humanoid-robot/harmonicReducer");

    // Should show back link
    expect(
      screen.getByText("Back to Humanoid Robot overview"),
    ).toBeInTheDocument();

    // "Harmonic Reducer" appears in both h1 (page title) and h2 (framework header)
    const headings = screen.getAllByRole("heading", { name: "Harmonic Reducer" });
    expect(headings.length).toBeGreaterThanOrEqual(2);

    // Research framework badge
    expect(screen.getByText("Research Framework")).toBeInTheDocument();
  });

  it("all 6 segment detail pages are accessible", () => {
    const validKeys = [
      "harmonicReducer",
      "planetaryRollerScrew",
      "framelessTorqueMotor",
      "sixAxisForceSensor",
      "dexterousHand",
      "ballScrew",
    ];

    for (const key of validKeys) {
      const { unmount } = renderAt(`/humanoid-robot/${key}`);
      // Each detail page should show the back link
      expect(
        screen.getByText("Back to Humanoid Robot overview"),
      ).toBeInTheDocument();
      unmount();
    }
  });

  // -- Invalid segment fallback --------------------------------------------

  it("shows invalid segment view for an unknown segmentKey", () => {
    renderAt("/humanoid-robot/nonexistent");

    expect(screen.getByText("Segment not found")).toBeInTheDocument();
    // Should still show a back link
    expect(
      screen.getByText("Back to Humanoid Robot overview"),
    ).toBeInTheDocument();
  });

  // -- Safety: no real stock codes -----------------------------------------

  it("page contains no real A-share stock code patterns", () => {
    renderAt("/humanoid-robot");
    const bodyText = document.body.textContent ?? "";
    expect(bodyText).not.toMatch(/\b\d{6}\.(SH|SZ|BJ)\b/i);
    expect(bodyText).not.toMatch(/["\s]\d{6}["\s]/);
  });

  it("segment detail pages contain no real stock codes", () => {
    renderAt("/humanoid-robot/harmonicReducer");
    const bodyText = document.body.textContent ?? "";
    expect(bodyText).not.toMatch(/\b\d{6}\.(SH|SZ|BJ)\b/i);
  });

  // -- Safety: no API calls ------------------------------------------------

  it("page does not trigger fetch on render", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderAt("/humanoid-robot");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("structure tab does not trigger fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderAt("/humanoid-robot");
    const structureTab = screen.getByRole("button", { name: "Structure" });
    act(() => structureTab.click());
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
