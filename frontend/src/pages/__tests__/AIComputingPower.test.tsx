import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AIComputingPower } from "../AIComputingPower";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/ai-computing" element={<AIComputingPower />} />
        <Route path="/ai-computing/:segmentKey" element={<AIComputingPower />} />
      </Routes>
    </MemoryRouter>,
  );
}

const fetchSpy = vi.fn();
globalThis.fetch = fetchSpy;

// Mock segmentCodeMap — all empty arrays.
vi.mock("@/lib/aiComputing/segmentCodeMap", () => ({
  segmentCodeMap: {
    computeChip: [],
    hbm: [],
    opticalModule: [],
    pcb: [],
    switchChip: [],
    liquidCooling: [],
    mlcc: [],
    glassSubstrate: [],
  },
  AI_COMPUTING_SEGMENT_KEYS: [
    "computeChip", "hbm", "opticalModule", "pcb",
    "switchChip", "liquidCooling", "mlcc", "glassSubstrate",
  ],
}));

// Mock the service so we can assert call args without network.
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

describe("AIComputingPower page", () => {
  // -- Default: no fetch ---------------------------------------------------

  it("does not fetch on initial render", () => {
    renderAt("/ai-computing");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -- Reports tab ---------------------------------------------------------

  it("reports tab shows aggregation notice", () => {
    renderAt("/ai-computing");
    act(() => screen.getByRole("button", { name: "Reports" }).click());

    expect(
      screen.getByText(/Stock-level report aggregation/),
    ).toBeInTheDocument();
  });

  it("reports tab shows codes-pending-review notice", () => {
    renderAt("/ai-computing");
    act(() => screen.getByRole("button", { name: "Reports" }).click());

    expect(
      screen.getByText(/Stock code list pending manual review/),
    ).toBeInTheDocument();
  });

  it("reports tab shows empty state", () => {
    renderAt("/ai-computing");
    act(() => screen.getByRole("button", { name: "Reports" }).click());

    expect(screen.getByText("No reports yet")).toBeInTheDocument();
  });

  // -- Service call --------------------------------------------------------

  it("reports tab calls loadReportLibrary with empty codes and mode:real", () => {
    renderAt("/ai-computing");
    act(() => screen.getByRole("button", { name: "Reports" }).click());

    expect(mockLoadReportLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ codes: [], segmentKey: "computeChip" }),
      { mode: "real" },
    );
  });

  it("reports tab does NOT trigger global fetch", () => {
    renderAt("/ai-computing");
    act(() => screen.getByRole("button", { name: "Reports" }).click());

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -- Segment selector ----------------------------------------------------

  it("reports tab has 8 segment buttons", () => {
    renderAt("/ai-computing");
    act(() => screen.getByRole("button", { name: "Reports" }).click());

    const segments = [
      "Compute Chip", "HBM", "Optical Module", "PCB",
      "Switch Chip", "Liquid Cooling", "MLCC", "Glass Substrate",
    ];
    for (const label of segments) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("switching segment calls service with updated segmentKey and empty codes", () => {
    renderAt("/ai-computing");
    act(() => screen.getByRole("button", { name: "Reports" }).click());

    mockLoadReportLibrary.mockClear();

    act(() => screen.getByRole("button", { name: "HBM" }).click());

    expect(mockLoadReportLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ codes: [], segmentKey: "hbm" }),
      { mode: "real" },
    );
  });

  it("switching segment does NOT trigger global fetch", () => {
    renderAt("/ai-computing");
    act(() => screen.getByRole("button", { name: "Reports" }).click());
    fetchSpy.mockClear();

    act(() => screen.getByRole("button", { name: "HBM" }).click());

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -- No misleading q_type=1 / industry report language -------------------

  it("reports tab does not claim to show industry reports", () => {
    renderAt("/ai-computing");
    act(() => screen.getByRole("button", { name: "Reports" }).click());

    const bodyText = document.body.textContent ?? "";
    // Must explicitly deny, not claim "industry report"
    expect(bodyText).toMatch(/NOT.*industry/i);
    // Must NOT claim q_type=1
    expect(bodyText).not.toMatch(/q_type=1\b/);
  });

  // -- Detail pages still work ---------------------------------------------

  it("renders segment detail page", () => {
    renderAt("/ai-computing/computeChip");
    expect(screen.getByText("Back to AI Compute overview")).toBeInTheDocument();
    expect(screen.getByText("Research Framework")).toBeInTheDocument();
  });

  it("renders invalid segment fallback", () => {
    renderAt("/ai-computing/nonexistent");
    expect(screen.getByText("Segment not found")).toBeInTheDocument();
  });

  // -- Safety: no real stock codes -----------------------------------------

  it("page contains no real A-share stock code patterns", () => {
    renderAt("/ai-computing");
    act(() => screen.getByRole("button", { name: "Reports" }).click());
    expect(document.body.textContent).not.toMatch(/\b\d{6}\.(SH|SZ|BJ)\b/i);
  });

  // -- Quote card on computeChip detail page -------------------------------

  it("computeChip detail shows Reviewed Stock Quote section", () => {
    renderAt("/ai-computing/computeChip");
    expect(screen.getByText("Reviewed Stock Quote")).toBeInTheDocument();
    // The code and button label are in the same text node: "688041.SH — Load Quote"
    expect(screen.getByText(/688041\.SH/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load Quote" })).toBeInTheDocument();
  });

  it("computeChip detail does NOT fetch on mount", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    renderAt("/ai-computing/computeChip");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("clicking Load Quote fetches /api/stocks/quote only", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, source: "tencent", code: "688041.SH", data: { name: "X", price: 304.88, change_pct: -4.84 } }),
    } as Response);

    renderAt("/ai-computing/computeChip");
    await act(() => screen.getByRole("button", { name: "Load Quote" }).click());

    expect(spy).toHaveBeenCalledTimes(1);
    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe("/api/stocks/quote?code=688041.SH");
    expect(url).not.toContain("/api/reports/research");
    expect(url).not.toContain("/mcp");
    spy.mockRestore();
  });

  it("clicking Load Quote shows price and disclaimer", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, source: "tencent", code: "688041.SH", data: { name: "X", price: 304.88, change_pct: -4.84 } }),
    } as Response);

    renderAt("/ai-computing/computeChip");
    await act(() => screen.getByRole("button", { name: "Load Quote" }).click());

    expect(screen.getByText("304.88")).toBeInTheDocument();
    expect(screen.getByText("-4.84%")).toBeInTheDocument();
    expect(screen.getByText("For supply chain research only. Not investment advice.")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("hbm detail does NOT show Reviewed Stock Quote section", () => {
    renderAt("/ai-computing/hbm");
    expect(screen.queryByText("Reviewed Stock Quote")).toBeNull();
    expect(screen.queryByText(/688041/)).toBeNull();
  });

  it("reports tab still passes empty codes", () => {
    renderAt("/ai-computing");
    act(() => screen.getByRole("button", { name: "Reports" }).click());
    expect(mockLoadReportLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ codes: [] }),
      { mode: "real" },
    );
  });
});
