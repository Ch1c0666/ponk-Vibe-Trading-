import { describe, expect, it } from "vitest";
import {
  toReportLibraryView,
  type ProviderReportEnvelope,
} from "../reportLibraryAdapter";

// ---------------------------------------------------------------------------
// All fixtures use [Mock]-prefixed values. Zero real companies, stock codes,
// or report titles.
// ---------------------------------------------------------------------------

describe("toReportLibraryView", () => {
  // -- error envelope -------------------------------------------------------

  it("maps ok=false to error state", () => {
    const envelope: ProviderReportEnvelope = {
      ok: false,
      error: { code: "PROVIDER_DOWN", message: "[Mock] upstream unreachable" },
    };
    const result = toReportLibraryView(envelope);
    expect(result).toEqual({
      kind: "error",
      errorCode: "PROVIDER_DOWN",
      message: "[Mock] upstream unreachable",
    });
  });

  it("falls back to unknown error when error field is missing on ok=false", () => {
    const envelope: ProviderReportEnvelope = { ok: false };
    const result = toReportLibraryView(envelope);
    expect(result).toEqual({
      kind: "error",
      errorCode: "unknown",
      message: "Provider returned an error with no details.",
    });
  });

  // -- empty envelope -------------------------------------------------------

  it("maps ok=true with empty reports array to empty state", () => {
    const envelope: ProviderReportEnvelope = {
      ok: true,
      reports: [],
    };
    const result = toReportLibraryView(envelope);
    expect(result).toEqual({ kind: "empty" });
  });

  it("maps ok=true with missing reports field to empty state", () => {
    const envelope: ProviderReportEnvelope = { ok: true };
    const result = toReportLibraryView(envelope);
    expect(result).toEqual({ kind: "empty" });
  });

  // -- data envelope --------------------------------------------------------

  it("maps ok=true with non-empty reports to data state", () => {
    const envelope: ProviderReportEnvelope = {
      ok: true,
      reports: [
        {
          id: "MOCK-001",
          title: "[Mock] Test Report",
          brokerage: "[Mock] Broker X",
          analyst: null,
          publishDate: "2026-07-01",
          rating: "[Mock] Buy",
          segmentKey: "computeChip",
        },
        {
          id: "MOCK-002",
          title: "[Mock] Another Report",
          brokerage: "[Mock] Broker Y",
          analyst: "[Mock] Analyst A",
          publishDate: "2026-06-15",
          rating: null,
          segmentKey: "hbm",
        },
      ],
      total: 5,
    };
    const result = toReportLibraryView(envelope);
    expect(result).toEqual({
      kind: "data",
      reports: envelope.reports,
      total: 5,
      shown: 2,
    });
  });

  // -- partial envelope -----------------------------------------------------

  it("maps ok=true + partial=true with warnings to partial state", () => {
    const envelope: ProviderReportEnvelope = {
      ok: true,
      partial: true,
      reports: [
        {
          id: "MOCK-P01",
          title: "[Mock] Partial Report",
          brokerage: "[Mock] Broker Z",
          analyst: null,
          publishDate: "2026-07-10",
          rating: "[Mock] Hold",
          segmentKey: "liquidCooling",
        },
      ],
      total: 10,
      warnings: [
        {
          code: "provider_page_failed",
          message: "[Mock] page 2 failed",
          page: 2,
          sourceCode: "<CODE_A.SH>",
        },
        {
          code: "provider_hits_absent",
          message: "[Mock] hits missing",
          page: 1,
          sourceCode: "<CODE_B.SZ>",
        },
      ],
    };
    const result = toReportLibraryView(envelope);
    expect(result).toEqual({
      kind: "partial",
      reports: envelope.reports,
      total: 10,
      shown: 1,
      warnings: [
        {
          code: "provider_page_failed",
          message: "[Mock] page 2 failed",
          page: 2,
          sourceCode: "<CODE_A.SH>",
        },
        {
          code: "provider_hits_absent",
          message: "[Mock] hits missing",
          page: 1,
          sourceCode: "<CODE_B.SZ>",
        },
      ],
    });
  });

  // -- warnings preserve page / sourceCode ----------------------------------

  it("preserves page and sourceCode through warning conversion", () => {
    const envelope: ProviderReportEnvelope = {
      ok: true,
      partial: true,
      reports: [
        {
          id: "MOCK-W01",
          title: "[Mock] Warning Test",
          brokerage: "[Mock] Broker W",
          analyst: null,
          publishDate: "2026-07-01",
          rating: null,
          segmentKey: "pcb",
        },
      ],
      warnings: [
        {
          code: "provider_page_failed",
          message: "[Mock] failed",
          page: 3,
          sourceCode: "<CODE.SH>",
        },
      ],
    };
    const result = toReportLibraryView(envelope);
    expect(result.kind).toBe("partial");
    if (result.kind === "partial") {
      expect(result.warnings[0].page).toBe(3);
      expect(result.warnings[0].sourceCode).toBe("<CODE.SH>");
    }
  });

  // -- total fallback -------------------------------------------------------

  it("defaults total to reports.length when total is absent", () => {
    const envelope: ProviderReportEnvelope = {
      ok: true,
      reports: [
        {
          id: "MOCK-T01",
          title: "[Mock] Fallback Test",
          brokerage: "[Mock] Broker F",
          analyst: null,
          publishDate: "2026-07-01",
          rating: null,
          segmentKey: "mlcc",
        },
      ],
      // no total field
    };
    const result = toReportLibraryView(envelope);
    expect(result.kind).toBe("data");
    if (result.kind === "data") {
      expect(result.total).toBe(1);
      expect(result.shown).toBe(1);
    }
  });

  // -- safety: no real data in fixtures -----------------------------------

  it("adapter fixture reports contain no real stock code patterns", () => {
    const envelope: ProviderReportEnvelope = {
      ok: true,
      reports: [
        {
          id: "MOCK-S01",
          title: "[Mock] Safety Test",
          brokerage: "[Mock] Broker S",
          analyst: null,
          publishDate: "2026-07-01",
          rating: null,
          segmentKey: "glassSubstrate",
        },
      ],
    };
    const result = toReportLibraryView(envelope);
    expect(result.kind).toBe("data");
    if (result.kind === "data") {
      for (const r of result.reports) {
        expect(r.id).not.toMatch(/^\d{6}\.(SH|SZ|BJ)$/);
        expect(r.title).not.toMatch(/\d{6}\.(SH|SZ|BJ)/);
        expect(r.brokerage).not.toMatch(/\d{6}\.(SH|SZ|BJ)/);
        expect(r.title).toMatch(/^\[Mock\]/);
        expect(r.brokerage).toMatch(/^\[Mock\]/);
      }
    }
  });

  it("warnings in partial envelope carry sourceCode as part of the message context", () => {
    // sourceCode flows through ProviderWarning; consumer decides how to render.
    const envelope: ProviderReportEnvelope = {
      ok: true,
      partial: true,
      reports: [
        {
          id: "MOCK-SC01",
          title: "[Mock] Source Code Context",
          brokerage: "[Mock] Broker SC",
          analyst: null,
          publishDate: "2026-07-01",
          rating: null,
          segmentKey: "computeChip",
        },
      ],
      warnings: [
        {
          code: "provider_page_failed",
          message: "[Mock] page 2 failed",
          page: 2,
          sourceCode: "<CODE_A.SH>",
        },
      ],
    };
    const result = toReportLibraryView(envelope);
    expect(result.kind).toBe("partial");
    if (result.kind === "partial") {
      expect(result.warnings[0].code).toBe("provider_page_failed");
      expect(result.warnings[0].page).toBe(2);
    }
  });
});
