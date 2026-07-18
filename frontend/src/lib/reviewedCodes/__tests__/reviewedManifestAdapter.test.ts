import { describe, expect, it } from "vitest";
import {
  getQuoteCodes,
  getReportCodes,
  getReviewedCodes,
  type ManifestData,
} from "../reviewedManifestAdapter";
import { REVIEWED_SEGMENT_CODES } from "../reviewedSegmentCodes";

// SAMPLE mirrors reviewedSegmentCodes but allows mutation in tests.
const SAMPLE = JSON.parse(JSON.stringify(REVIEWED_SEGMENT_CODES)) as ManifestData;

describe("reviewedManifestAdapter", () => {
  it("getQuoteCodes returns quote-only code", () => {
    expect(getQuoteCodes(SAMPLE, "aiComputing", "computeChip")).toEqual(["688041.SH"]);
  });

  it("getReportCodes returns non-quote codes, excludes quote-only", () => {
    const codes = getReportCodes(SAMPLE, "aiComputing", "computeChip");
    expect(codes).not.toContain("688041.SH");
    // At least one code with report dataUse exists in the current manifest.
    expect(codes.length).toBeGreaterThanOrEqual(1);
  });

  it("getReviewedCodes with 'report' filter excludes quote-only code", () => {
    const codes = getReviewedCodes(SAMPLE, "aiComputing", "computeChip", "report");
    expect(codes).not.toContain("688041.SH");
  });

  it("unknown segmentKey returns empty", () => {
    expect(getQuoteCodes(SAMPLE, "aiComputing", "nonexistent")).toEqual([]);
  });

  it("unknown scope returns empty", () => {
    expect(getQuoteCodes(SAMPLE, "nonexistent", "computeChip")).toEqual([]);
  });

  it("null manifest returns empty", () => {
    expect(getQuoteCodes(null, "aiComputing", "computeChip")).toEqual([]);
  });

  it("humanoidRobot quote codes are all empty", () => {
    expect(getQuoteCodes(SAMPLE, "humanoidRobot", "harmonicReducer")).toEqual([]);
    expect(getQuoteCodes(SAMPLE, "humanoidRobot", "dexterousHand")).toEqual([]);
  });

  it("disabled code excluded", () => {
    const m = JSON.parse(JSON.stringify(SAMPLE)) as ManifestData;
    m.segments.aiComputing.computeChip.codes[0].status = "disabled";
    expect(getQuoteCodes(m, "aiComputing", "computeChip")).toEqual([]);
  });

  it("missing dataUse excluded", () => {
    const m = JSON.parse(JSON.stringify(SAMPLE)) as ManifestData;
    delete m.segments.aiComputing.computeChip.codes[0].dataUse;
    expect(getQuoteCodes(m, "aiComputing", "computeChip")).toEqual([]);
  });

  it("report-only dataUse excluded from quote (synthetic placeholder)", () => {
    const m = JSON.parse(JSON.stringify(SAMPLE)) as ManifestData;
    // Use a synthetic placeholder, not the real reviewed code.
    m.segments.aiComputing.computeChip.codes = [{
      code: "000000.SH",
      status: "approved",
      reason: "synthetic",
      source: "test",
      reviewer: "test",
      reviewedAt: "2026-01-01",
      dataUse: ["report"],
    }];
    expect(getQuoteCodes(m, "aiComputing", "computeChip")).toEqual([]);
    expect(getReportCodes(m, "aiComputing", "computeChip")).toEqual(["000000.SH"]);
  });
});
