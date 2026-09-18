import { FORMAT_META } from "@/lib/print";
import { sheetTitle } from "@/lib/report-meta";
import { evaluateProfileUm } from "@/domain/coating";
import { computeDftStats, evaluateIso19840 } from "@/domain/dft-stats";
import type { Iso19840Compliance } from "@/domain/dft-stats";
import type { ReportData, ReportCoatRow } from "@/lib/api/review";
import {
  ReportFooter,
  ReportHeaderFields,
  ReportLetterhead,
  ReportRejectionComments,
  ReportSignOffs,
} from "./ReportSheet";

/**
 * ST/QC/04 — Surface Preparation & Protective Coating Report
 * (report-export-spec §4, two-page anatomy). Psychrometric verdicts print as
 * RECORDED at inspection time — re-derived with the same Magnus-Tetens gate
 * engines (`getReportData`), never re-judged. DFT statistics derive live from
 * the recorded 26-point grids via the same `computeDftStats` / ISO 19840
 * engine as the review screen (edge 6.4: the stats block never splits).
 */

const DEFECTS: Array<[string, string]> = [
  ["pinholes", "Pinholes"],
  ["sagging", "Sagging"],
  ["gloss_loss", "Gloss loss"],
  ["peel_off", "Peel-off"],
  ["blisters", "Blisters"],
];

const yesNo = (b: boolean): string => (b ? "✓ Yes" : "✗ No");

function IsoVerdict({ iso }: { iso: Iso19840Compliance }): React.ReactElement {
  return (
    <span className="measurement print-chip px-1">
      {iso.compliant
        ? "ISO 19840 PASS"
        : iso.reason === "insufficient-readings"
          ? "MIN 5 READINGS"
          : "ISO 19840 FAIL"}
    </span>
  );
}

function CoatRowCells({ c }: { c: ReportCoatRow }): React.ReactElement {
  return (
    <tr>
      <td className="measurement">{String(c.coatNo)}</td>
      <td>{c.product}</td>
      <td className="measurement">{c.ral ?? "—"}</td>
      <td className="measurement">{c.partABatch}</td>
      <td className="measurement">{c.partAMfg ?? "—"}</td>
      <td className="measurement">{c.partBBatch ?? "—"}</td>
      <td className="measurement">{c.partBMfg ?? "—"}</td>
      <td className="measurement">{c.thinnerBatch ?? "—"}</td>
      <td className="measurement">{c.viscosityS === null ? "—" : `${String(c.viscosityS)} s`}</td>
      <td className="measurement">{c.wftUm === null ? "—" : `${String(c.wftUm)} µm`}</td>
    </tr>
  );
}

function PsychroRow({ c }: { c: ReportCoatRow }): React.ReactElement {
  const prohibited = c.verdict === "PROHIBITED";
  return (
    <tr>
      <td className="measurement">{String(c.coatNo)}</td>
      <td className="measurement">{String(c.ambientC)}</td>
      <td className="measurement">{String(c.rhPct)}</td>
      <td className="measurement">{String(c.steelC)}</td>
      <td className="measurement">{c.dewPointC === null ? "—" : String(c.dewPointC)}</td>
      <td className="measurement">{c.deltaTC === null ? "—" : String(c.deltaTC)}</td>
      <td className={`measurement print-chip ${prohibited ? "bg-status-fail-bg text-status-fail-fg" : ""}`}>
        {prohibited ? "✗ PROHIBITED at time" : "✓ APPROVED"}
      </td>
    </tr>
  );
}

function DftPanel({
  side,
  values,
  nominal,
  system,
}: {
  side: "INSIDE" | "OUTSIDE";
  values: (number | null)[];
  nominal: number;
  system: string;
}): React.ReactElement {
  const stats = computeDftStats(values, nominal);
  const iso = evaluateIso19840(stats);
  return (
    <div className="print-keep mb-4">
      <div className="print-section-title">
        DFT — {side === "INSIDE" ? "Inside" : "Outside"} ({system}, nominal {String(nominal)} µm)
      </div>
      <table className="print-repeat w-full">
        <thead>
          <tr>
            {Array.from({ length: 13 }, (_, i) => (
              <th key={i} className="text-center">
                {String(i + 1).padStart(2, "0")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {values.slice(0, 13).map((v, i) => (
              <td
                key={i}
                className={`measurement text-center ${
                  v !== null && (v < 0.8 * nominal || v > 2 * nominal)
                    ? "bg-status-fail-bg text-status-fail-fg"
                    : ""
                }`}
              >
                {v === null ? "—" : String(v)}
              </td>
            ))}
          </tr>
          <tr>
            {values.slice(13, 26).map((v, i) => (
              <td
                key={i}
                className={`measurement text-center ${
                  v !== null && (v < 0.8 * nominal || v > 2 * nominal)
                    ? "bg-status-fail-bg text-status-fail-fg"
                    : ""
                }`}
              >
                {v === null ? "—" : String(v)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <table className="print-stats-block mt-2 w-full">
        <tbody>
          <tr>
            <th className="w-[14%]">Min (µm)</th>
            <td className="measurement w-[10%]">{String(stats.min)}</td>
            <th className="w-[14%]">Max (µm)</th>
            <td className="measurement w-[10%]">{String(stats.max)}</td>
            <th className="w-[14%]">Average</th>
            <td className="measurement w-[10%]">{stats.mean.toFixed(1)}</td>
            <th className="w-[14%]">Std dev σ</th>
            <td className="measurement w-[10%]">{stats.stdDev.toFixed(2)}</td>
            <th className="w-[10%]">Verdict</th>
            <td className="w-[14%]">
              <IsoVerdict iso={iso} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ReportCoating({
  data,
  auditRef = null,
}: {
  data: Extract<ReportData, { workflow: "COATING" }>;
  auditRef?: string | null;
}): React.ReactElement {
  const a = data.surfacePrep;
  const profileVerdict =
    a.profileUm === null ? null : evaluateProfileUm(a.profileUm);
  return (
    <article
      id="print-preview"
      className="print-sheet mx-auto max-w-[210mm] bg-white px-[14mm] py-[10mm] shadow-lg print:shadow-none"
    >
      <ReportLetterhead meta={FORMAT_META["ST/QC/04"]} />
      <h1 className="mt-4 text-center text-[12pt] font-semibold uppercase tracking-[0.08em]">
        {sheetTitle(data)}
      </h1>
      <ReportHeaderFields header={data.header} title="Batch details" />

      {/* Section A — surface preparation (COAT-01/02) */}
      <div className="print-keep mt-4">
        <div className="print-section-title">A — Surface preparation</div>
        <table className="print-field-table">
          <tbody>
            <tr>
              <th scope="row" className="w-[20%]">Steel grade</th>
              <td className="w-[30%]">{a.steelGrade}</td>
              <th scope="row" className="w-[20%]">Blast method</th>
              <td className="w-[30%]">{a.blastMethod}</td>
            </tr>
            <tr>
              <th scope="row">Blast grade</th>
              <td>{a.blastGrade}</td>
              <th scope="row">Grit size</th>
              <td>{a.gritSize}</td>
            </tr>
            <tr>
              <th scope="row">Weld / edge dressing (P-2)</th>
              <td>{yesNo(a.weldEdgeOk)}</td>
              <th scope="row">Solvent clean</th>
              <td>{yesNo(a.solventCleanOk)}</td>
            </tr>
            <tr>
              <th scope="row">Water break test</th>
              <td>{yesNo(a.waterBreakPass)}</td>
              <th scope="row">Profile (µm)</th>
              <td className="measurement">
                {a.profileUm === null ? "—" : String(a.profileUm)}
                {profileVerdict !== null ? (
                  <span className="ml-2 print-chip px-1">
                    {profileVerdict === "pass" ? "✓ 45–75" : profileVerdict === "warn" ? "! near 45–75" : "✗ out of 45–75"}
                  </span>
                ) : null}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section B — psychrometric records per coat event */}
      <div className="print-keep mt-4">
        <div className="print-section-title">B — Psychrometric conditions (per coat)</div>
        <table className="w-full">
          <thead>
            <tr>
              <th>Coat</th>
              <th>Ambient °C</th>
              <th>%RH</th>
              <th>Steel °C</th>
              <th>Dew point °C</th>
              <th>ΔT °C</th>
              <th>Compliance verdict</th>
            </tr>
          </thead>
          <tbody>
            {data.coats.map((c) => (
              <PsychroRow key={c.coatNo} c={c} />
            ))}
            {data.coats.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-ink-500">No coat events recorded</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Section C — paint batch log */}
      <div className="mt-4">
        <div className="print-section-title">C — Paint batch log</div>
        <table className="print-repeat w-full">
          <thead>
            <tr>
              <th>Coat</th>
              <th>Product</th>
              <th>RAL</th>
              <th>Part A batch</th>
              <th>A mfg</th>
              <th>Part B batch</th>
              <th>B mfg</th>
              <th>Thinner</th>
              <th>Viscosity</th>
              <th>WFT</th>
            </tr>
          </thead>
          <tbody>
            {data.coats.map((c) => (
              <CoatRowCells key={c.coatNo} c={c} />
            ))}
            {data.coats.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-ink-500">No coats recorded</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Section D — DFT grids + statistics (edge 6.4: keep-together) */}
      <div className="mt-4">
        <div className="print-section-title">D — Dry film thickness</div>
        <DftPanel side="INSIDE" values={data.dft.INSIDE} nominal={data.dftNominals.inside} system={data.systems.inside} />
        <DftPanel side="OUTSIDE" values={data.dft.OUTSIDE} nominal={data.dftNominals.outside} system={data.systems.outside} />
      </div>

      {/* Section E — visual inspection (COAT-07) */}
      <div className="print-keep mt-2">
        <div className="print-section-title">E — Visual inspection</div>
        <table className="w-full">
          <tbody>
            <tr>
              {DEFECTS.map(([key, label]) => (
                <th key={key} scope="col" className="text-center">
                  {label}:{" "}
                  <span className={`measurement print-chip px-1 ${data.visual[key] === true ? "bg-status-fail-bg text-status-fail-fg" : ""}`}>
                    {data.visual[key] === true ? "✗ present" : "✓ not present"}
                  </span>
                </th>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <ReportRejectionComments signOffs={data.signOffs} />
      {/* NACE sign-off (PDF-03): certification line on the inspector block. */}
      <ReportSignOffs signOffs={data.signOffs} nace />
      <ReportFooter data={data} auditRef={auditRef} />
    </article>
  );
}
