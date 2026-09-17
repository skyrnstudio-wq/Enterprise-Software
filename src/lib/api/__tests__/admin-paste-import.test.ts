import { describe, expect, it } from "vitest";
import { parsePastedDimensions } from "../admin";

/**
 * Excel paste-import tests (execution-plan.md Phase 2, IM-06 accelerant).
 * Edge cases: 2.6 (duplicate serials collapse, first wins, reported), 2.7
 * (unparseable lines listed, never dropped silently).
 */

describe("parsePastedDimensions", () => {
  it("parses simple tab-separated drawing-table rows", () => {
    const result = parsePastedDimensions("1\tSHAFT DIA\tØ25±0.2\n2\tLENGTH\t120 ±0.5");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      serial: 1,
      label: "SHAFT DIA",
      nominal: 25,
      tolPlus: 0.2,
      tolMinus: 0.2,
      symbol: "Ø",
    });
    expect(result.rows[1]).toMatchObject({
      serial: 2,
      label: "LENGTH",
      nominal: 120,
      tolPlus: 0.5,
      tolMinus: 0.5,
    });
    expect(result.duplicates).toEqual([]);
    expect(result.failedLines).toEqual([]);
  });

  it("keeps multi-word labels intact — dimension starts at the first numeric token", () => {
    const result = parsePastedDimensions("SHAFT DIA Ø25±0.2");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.label).toBe("SHAFT DIA");
    expect(result.rows[0]?.raw).toBe("Ø25±0.2");
  });

  it("collapses duplicate serials to the first occurrence and reports them (edge 2.6)", () => {
    const result = parsePastedDimensions("5\tA\tØ10\n5\tB\tØ12\n5\tC\tØ14\n6\tD\tØ8");
    expect(result.rows).toHaveLength(2); // serials 5, 6 — first occurrences only
    expect(result.rows[0]?.label).toBe("A");
    expect(result.rows[0]?.nominal).toBe(10);
    expect(result.duplicates).toEqual([5]); // reported once per duplicated serial
  });

  it("lists unparseable lines with their 1-based numbers (edge 2.7)", () => {
    const result = parsePastedDimensions("1\tOK\tØ10\nheat treatment per spec\n2\tALSO OK\t120");
    expect(result.rows).toHaveLength(2);
    expect(result.failedLines).toEqual([{ line: 2, text: "heat treatment per spec" }]);
  });

  it("supports explicit dot and paren serial prefixes", () => {
    const result = parsePastedDimensions("12. SHAFT DIA Ø25±0.2\n(13)\tBORE\tØ40H7");
    expect(result.rows[0]?.serial).toBe(12);
    expect(result.rows[1]?.serial).toBe(13);
  });

  it("handles reference dims, asymmetric tolerances, min-only and CRLF", () => {
    const result = parsePastedDimensions(
      "1\tREF\t(2065)\r\n2\tSTEP\t10 +0.2/-0.1\r\n3\tNOTE\t20 min",
    );
    expect(result.rows[0]).toMatchObject({ nominal: 2065, isReference: true });
    expect(result.rows[1]).toMatchObject({ nominal: 10, tolPlus: 0.2, tolMinus: 0.1 });
    // No explicit tolerance ⇒ 0/0 (DB tol columns are NOT NULL); the raw
    // string "20 min" is preserved for the editor's one-sided display.
    expect(result.rows[2]).toMatchObject({ nominal: 20, tolPlus: 0, tolMinus: 0, raw: "20 min" });
  });

  it("auto-numbers rows without serials and renumbers after explicit serials", () => {
    const result = parsePastedDimensions("Ø10\nØ12\n7\tEXPLICIT\tØ14\nØ16");
    expect(result.rows.map((r) => r.serial)).toEqual([1, 2, 7, 8]);
  });

  it("sorts out-of-order serials ascending", () => {
    const result = parsePastedDimensions("9\tC\tØ30\n2\tA\tØ10");
    expect(result.rows.map((r) => r.serial)).toEqual([2, 9]);
  });
});
