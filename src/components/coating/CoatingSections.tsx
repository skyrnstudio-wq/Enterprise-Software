import { SectionCard } from "@/components/ui/SectionCard";
import { FormRow, TextInput } from "@/components/ui/FormRow";
import { ProfileVerdictChip, ShelfLifeChip, WftVerdictChip } from "@/components/coating/CoatingPanels";
import { parseCoatingNumber } from "@/domain/coating";
import { useCoatingStore } from "@/lib/store/coating-store";
import type { CoatingDraft } from "@/lib/dexie/db";

/**
 * Section components for the coating wizard (E1) — extracted from the route
 * so the route file owns only orchestration: derived verdicts, gating, and
 * submission. Each section mutates the coating store directly; the route
 * passes the draft slice + the instrument list it already queries.
 */

interface InstrumentOption {
  id: string;
  label: string;
  expired: boolean;
}

const selectClass =
  "h-9 w-full rounded-xs border border-ink-300 bg-paper-raised px-2 text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-50";

export function SurfacePrepSection({
  surfacePrep,
  instruments,
  disabled,
}: {
  surfacePrep: CoatingDraft["surfacePrep"];
  instruments: InstrumentOption[];
  disabled: boolean;
}): React.ReactElement {
  const set = useCoatingStore.getState().setSurfacePrep;
  return (
    <SectionCard letter="A" title="Surface preparation">
      <div className="space-y-4">
        <FormRow label="Steel grade" htmlFor="sp-steel">
          <TextInput
            id="sp-steel"
            value={surfacePrep.steelGrade}
            disabled={disabled}
            onChange={(e) => {
              set({ steelGrade: e.target.value });
            }}
          />
        </FormRow>
        <FormRow label="Blast method" htmlFor="sp-method">
          <TextInput
            id="sp-method"
            value={surfacePrep.blastMethod}
            disabled={disabled}
            onChange={(e) => {
              set({ blastMethod: e.target.value });
            }}
          />
        </FormRow>
        <div className="grid grid-cols-2 gap-4">
          <FormRow label="Blast grade" htmlFor="sp-grade" helper="ISO 8501-1">
            <TextInput
              id="sp-grade"
              value={surfacePrep.blastGrade}
              disabled={disabled}
              onChange={(e) => {
                set({ blastGrade: e.target.value });
              }}
            />
          </FormRow>
          <FormRow label="Grit size" htmlFor="sp-grit">
            <TextInput
              id="sp-grit"
              value={surfacePrep.gritSize}
              disabled={disabled}
              onChange={(e) => {
                set({ gritSize: e.target.value });
              }}
            />
          </FormRow>
        </div>
        <FormRow
          label="Comparator grade"
          htmlFor="sp-comparator"
          helper="ISO 8501-3 surface comparator (COAT-02) — required before Continue"
        >
          <select
            id="sp-comparator"
            className={selectClass}
            value={surfacePrep.comparatorGrade ?? ""}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              set({
                comparatorGrade: v === "fine" || v === "medium" || v === "coarse" ? v : null,
              });
            }}
          >
            <option value="">— not assessed —</option>
            <option value="fine">Fine</option>
            <option value="medium">Medium (G)</option>
            <option value="coarse">Coarse</option>
          </select>
        </FormRow>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink-700">
            Pre-treatment verification (ISO 8501-3 P-2 / ISO 12944-4)
          </legend>
          {(
            [
              ["weldEdgeOk", "Welds / edges dressed smooth (P-2)"],
              ["solventCleanOk", "Solvent clean per ISO 12944-4"],
              ["waterBreakPass", "Water break test — no beading"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-ink-900">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={surfacePrep[key]}
                disabled={disabled}
                onChange={(e) => {
                  set({ [key]: e.target.checked });
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <FormRow
          label="Profile µm"
          htmlFor="sp-profile"
          helper="Comparator G, Medium — working band 45–75 µm (COAT-02)"
        >
          <div className="flex items-center gap-3">
            <TextInput
              id="sp-profile"
              inputMode="decimal"
              className="measurement max-w-[140px]"
              value={surfacePrep.profileUm === null ? "" : String(surfacePrep.profileUm)}
              disabled={disabled}
              onChange={(e) => {
                set({ profileUm: parseCoatingNumber(e.target.value) });
              }}
            />
            <ProfileVerdictChip valueUm={surfacePrep.profileUm} />
          </div>
        </FormRow>
        <FormRow
          label="Profile gauge"
          htmlFor="sp-gauge"
          helper="Edge 4.12: per batch, shown on both DFT panels"
        >
          <select
            id="sp-gauge"
            className={selectClass}
            value={surfacePrep.gaugeInstrumentId ?? ""}
            disabled={disabled}
            onChange={(e) => {
              set({ gaugeInstrumentId: e.target.value === "" ? null : e.target.value });
            }}
          >
            <option value="">— select instrument —</option>
            {instruments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
                {i.expired ? " (EXPIRED)" : ""}
              </option>
            ))}
          </select>
        </FormRow>
      </div>
    </SectionCard>
  );
}

export function PaintLogSection({
  coats,
  today,
  disabled,
}: {
  coats: CoatingDraft["coats"];
  today: string;
  disabled: boolean;
}): React.ReactElement {
  return (
    <div className="space-y-4">
      {/* G5 — build-up stack: the system so far, one chip per coat; logged
          coats show the ✓ pass treatment. */}
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Coating build-up stack">
        {coats.map((c) => {
          const logged = c.product.trim() !== "" && c.partABatch.trim() !== "";
          return (
            <span
              key={c.coatNo}
              className={`inline-flex items-center gap-1 rounded-xs border px-2 py-0.5 text-[11px] font-medium ${
                logged
                  ? "border-status-pass-fg bg-status-pass-bg text-status-pass-fg"
                  : "border-ink-300 text-ink-500"
              }`}
            >
              {logged ? "✓" : String(c.coatNo)} Coat {String(c.coatNo)}
            </span>
          );
        })}
      </div>
      {coats.map((coat, idx) => (
        <CoatCard key={coat.coatNo} coat={coat} idx={idx} today={today} disabled={disabled} />
      ))}
    </div>
  );
}

function CoatCard({
  coat,
  idx,
  today,
  disabled,
}: {
  coat: CoatingDraft["coats"][number];
  idx: number;
  today: string;
  disabled: boolean;
}): React.ReactElement {
  const setCoat = useCoatingStore.getState().setCoat;
  return (
    <SectionCard
      letter="C"
      title={`Coat ${String(coat.coatNo)} — ${
        coat.coatNo === 1 ? "Primer" : coat.coatNo === 2 ? "Intermediate" : "PU Finish"
      }`}
    >
      <div className="space-y-4">
        <FormRow label="Product" htmlFor={`c${String(idx)}-product`}>
          <TextInput
            id={`c${String(idx)}-product`}
            value={coat.product}
            disabled={disabled}
            onChange={(e) => {
              setCoat({ ...coat, product: e.target.value });
            }}
          />
        </FormRow>
        <FormRow
          label="Part A mfg date"
          htmlFor={`c${String(idx)}-mfg`}
          helper="Shelf-life is validated from this date (COAT-04)"
        >
          <div className="flex items-center gap-3">
            <TextInput
              id={`c${String(idx)}-mfg`}
              type="date"
              className="max-w-[200px]"
              value={coat.mfgDate ?? ""}
              disabled={disabled}
              onChange={(e) => {
                setCoat({
                  ...coat,
                  mfgDate: e.target.value === "" ? null : e.target.value,
                });
              }}
            />
            <ShelfLifeChip mfgDate={coat.mfgDate} today={today} />
          </div>
        </FormRow>
        <div className="grid grid-cols-2 gap-4">
          <FormRow label="Part A batch" htmlFor={`c${String(idx)}-pa`}>
            <TextInput
              id={`c${String(idx)}-pa`}
              className="measurement"
              value={coat.partABatch}
              disabled={disabled}
              onChange={(e) => {
                setCoat({ ...coat, partABatch: e.target.value });
              }}
            />
          </FormRow>
          <FormRow label="Part B hardener" htmlFor={`c${String(idx)}-pb`}>
            <TextInput
              id={`c${String(idx)}-pb`}
              className="measurement"
              value={coat.partBBatch}
              disabled={disabled}
              onChange={(e) => {
                setCoat({ ...coat, partBBatch: e.target.value });
              }}
            />
          </FormRow>
        </div>
        <FormRow
          label="Thinner %"
          htmlFor={`c${String(idx)}-th`}
          helper="Advisory — recorded on the form"
        >
          <TextInput
            id={`c${String(idx)}-th`}
            inputMode="decimal"
            className="measurement max-w-[140px]"
            value={coat.thinnerPercent === null ? "" : String(coat.thinnerPercent)}
            disabled={disabled}
            onChange={(e) => {
              setCoat({ ...coat, thinnerPercent: parseCoatingNumber(e.target.value) });
            }}
          />
        </FormRow>
        <WftRow coat={coat} disabled={disabled} />
      </div>
    </SectionCard>
  );
}
function WftRow({
  coat,
  disabled,
}: {
  coat: CoatingDraft["coats"][number];
  disabled: boolean;
}): React.ReactElement {
  const setCoat = useCoatingStore.getState().setCoat;
  const wftEntered = coat.wftUm.filter((w): w is number => w !== null);
  const wftAvg =
    wftEntered.length > 0 ? wftEntered.reduce((s, v) => s + v, 0) / wftEntered.length : null;
  return (
    <FormRow
      label="WFT µm (×3)"
      htmlFor={`c${String(coat.coatNo)}-wft-0`}
      helper={
        wftAvg === null
          ? "Wet-film thickness, three readings"
          : `Average ƒx: ${wftAvg.toFixed(0)} µm`
      }
    >
      <div className="flex gap-2">
        {coat.wftUm.map((w, wi) => (
          <TextInput
            key={wi}
            id={`c${String(coat.coatNo)}-wft-${String(wi)}`}
            inputMode="decimal"
            className="measurement max-w-[110px]"
            value={w === null ? "" : String(w)}
            disabled={disabled}
            onChange={(e) => {
              const next = [...coat.wftUm];
              next[wi] = parseCoatingNumber(e.target.value);
              setCoat({ ...coat, wftUm: next });
            }}
          />
        ))}
        <WftVerdictChip valueUm={wftAvg} />
      </div>
    </FormRow>
  );
}
