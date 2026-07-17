import { describe, expect, it, vi, beforeEach } from "vitest";
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

const fetchSpy = vi.fn();
globalThis.fetch = fetchSpy;

const mockLoadReportLibrary = vi.fn();
mockLoadReportLibrary.mockResolvedValue({
  ok: true,
  reports: [],
  total: 0,
  partial: false,
});

vi.mock("@/lib/aiComputing/reportLibraryService", () => ({
  loadReportLibrary: (...args: unknown[]) => mockLoadReportLibrary(...args),
}));

vi.mock("@/lib/humanoidRobot/segmentCodeMap", () => ({
  humanoidSegmentCodeMap: {
    harmonicReducer: [],
    planetaryRollerScrew: [],
    framelessTorqueMotor: [],
    sixAxisForceSensor: [],
    dexterousHand: [],
    ballScrew: [],
  },
  HUMANOID_ROBOT_SEGMENT_KEYS: [
    "harmonicReducer", "planetaryRollerScrew", "framelessTorqueMotor",
    "sixAxisForceSensor", "dexterousHand", "ballScrew",
  ],
}));

beforeEach(() => {
  fetchSpy.mockReset();
  mockLoadReportLibrary.mockReset();
  mockLoadReportLibrary.mockResolvedValue({
    ok: true,
    reports: [],
    total: 0,
    partial: false,
  });
});

describe("HumanoidRobot page", () => {
  // -- Tab layout --------------------------------------------------------

  it("renders the page heading", () => {
    renderAt("/humanoid-robot");
    expect(screen.getByRole("heading", { name: "Humanoid Robot" })).toBeInTheDocument();
  });

  it("renders overview tab and 6 segment tabs", () => {
    renderAt("/humanoid-robot");
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
    for (const label of [
      "Harmonic Reducer", "Planetary Roller Screw", "Frameless Torque Motor",
      "6-Axis Force Sensor", "Dexterous Hand", "Ball Screw",
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
    expect(screen.getAllByText("Segment Positioning").length).toBeGreaterThanOrEqual(6);
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThanOrEqual(6);
  });

  it("overview shows supply chain structure", () => {
    renderAt("/humanoid-robot");
    expect(screen.getByText("Upstream · Core Components")).toBeInTheDocument();
  });

  // -- Segment tabs -------------------------------------------------------

  it("clicking a segment tab shows the research framework inline", () => {
    renderAt("/humanoid-robot");
    act(() => screen.getByRole("button", { name: "Harmonic Reducer" }).click());
    expect(screen.getByText("Research Framework")).toBeInTheDocument();
  });

  // -- Structure tab ------------------------------------------------------

  it("structure tab renders supply chain", () => {
    renderAt("/humanoid-robot");
    act(() => screen.getByRole("button", { name: "Structure" }).click());
    expect(screen.getByText("Upstream · Core Components")).toBeInTheDocument();
  });

  // -- Reports tab --------------------------------------------------------

  it("reports tab shows aggregation notice", () => {
    renderAt("/humanoid-robot");
    act(() => screen.getByRole("button", { name: "Reports" }).click());

    expect(
      screen.getByText(/Stock-level report aggregation/),
    ).toBeInTheDocument();
  });

  it("reports tab shows codes-pending-review notice", () => {
    renderAt("/humanoid-robot");
    act(() => screen.getByRole("button", { name: "Reports" }).click());

    expect(
      screen.getByText(/Stock code list pending manual review/),
    ).toBeInTheDocument();
  });

  it("reports tab shows empty state", () => {
    renderAt("/humanoid-robot");
    act(() => screen.getByRole("button", { name: "Reports" }).click());

    expect(screen.getByText("No reports yet")).toBeInTheDocument();
  });

  it("reports tab calls loadReportLibrary with empty codes and mode:real", () => {
    renderAt("/humanoid-robot");
    act(() => screen.getByRole("button", { name: "Reports" }).click());

    expect(mockLoadReportLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ codes: [], segmentKey: "harmonicReducer" }),
      { mode: "real" },
    );
  });

  it("reports tab does NOT trigger global fetch", () => {
    renderAt("/humanoid-robot");
    act(() => screen.getByRole("button", { name: "Reports" }).click());

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports tab clicking 6-Axis Force Sensor calls service with correct segmentKey", () => {
    renderAt("/humanoid-robot");
    act(() => screen.getByRole("button", { name: "Reports" }).click());
    mockLoadReportLibrary.mockClear();

    // "6-Axis Force Sensor" in reports segment picker (second occurrence after top tab bar).
    const buttons = screen.getAllByRole("button", { name: "6-Axis Force Sensor" });
    act(() => buttons[1].click());

    expect(mockLoadReportLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ codes: [], segmentKey: "sixAxisForceSensor" }),
      { mode: "real" },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("switching reports segment calls service with updated key and empty codes", () => {
    renderAt("/humanoid-robot");
    act(() => screen.getByRole("button", { name: "Reports" }).click());
    mockLoadReportLibrary.mockClear();

    // "Dexterous Hand" appears in both top tab bar and reports segment selector.
    // Click the second occurrence (reports segment picker).
    const buttons = screen.getAllByRole("button", { name: "Dexterous Hand" });
    act(() => buttons[1].click());

    expect(mockLoadReportLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ codes: [], segmentKey: "dexterousHand" }),
      { mode: "real" },
    );
  });

  it("reports tab does not claim to show industry reports", () => {
    renderAt("/humanoid-robot");
    act(() => screen.getByRole("button", { name: "Reports" }).click());

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toMatch(/NOT.*industry/i);
    expect(bodyText).not.toMatch(/q_type=1\b/);
  });

  // -- Detail pages -------------------------------------------------------

  it("renders detail page for a valid segment key", () => {
    renderAt("/humanoid-robot/harmonicReducer");
    expect(screen.getByText("Back to Humanoid Robot overview")).toBeInTheDocument();
    expect(screen.getByText("Research Framework")).toBeInTheDocument();
  });

  it("all 6 segment detail pages are accessible", () => {
    const keys = [
      "harmonicReducer", "planetaryRollerScrew", "framelessTorqueMotor",
      "sixAxisForceSensor", "dexterousHand", "ballScrew",
    ];
    for (const key of keys) {
      const { unmount } = renderAt(`/humanoid-robot/${key}`);
      expect(screen.getByText("Back to Humanoid Robot overview")).toBeInTheDocument();
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
    renderAt("/humanoid-robot");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
