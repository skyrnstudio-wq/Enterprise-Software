import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, PackageSearch } from "lucide-react";
import { listItems } from "@/lib/api/admin";
import { DataTable, THead, TH, TR, TD } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/FormRow";

export const Route = createFileRoute("/_authenticated/admin/items")({
  component: ItemsPage,
});

/** S4 Item Master list (ui-ux-plan §6.4): unified search, revision chip, count. */
export default function ItemsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 200);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["items", debounced],
    queryFn: () => listItems(debounced),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Item Master</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            Item → drawing revision → dimension template chain (IM-01…05)
          </p>
        </div>
        <Button onClick={() => void navigate({ to: "/admin/items/new" })}>
          <Plus size={16} className="mr-1 inline" /> New item
        </Button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute top-3 left-3 text-ink-500" aria-hidden />
        <TextInput
          placeholder="Search item code, drawing no., customer, description…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          className="pl-8"
        />
      </div>

      {isLoading ? (
        <EmptyState icon={<PackageSearch size={24} />} message="Loading items…" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<PackageSearch size={24} />}
          message={
            search
              ? "No items match this search."
              : "No items yet. Import from the existing Excel dimension file during the wizard — the one-time migration is the fastest path."
          }
          action={
            <Button onClick={() => void navigate({ to: "/admin/items/new" })}>
              <Plus size={16} className="mr-1 inline" /> New item
            </Button>
          }
        />
      ) : (
        <DataTable>
          <THead>
            <TH sticky>Item code</TH>
            <TH>Drawing no.</TH>
            <TH>Description</TH>
            <TH>Customer</TH>
            <TH>Rev</TH>
            <TH mono>Dimensions</TH>
            <TH> </TH>
          </THead>
          <tbody>
            {items.map((it) => (
              <TR key={it.id}>
                <TD sticky mono>
                  {it.item_code}
                </TD>
                <TD mono>{it.drawing_number}</TD>
                <TD>{it.description}</TD>
                <TD>{it.customer_name}</TD>
                <TD>
                  {it.latest_rev ? (
                    <StatusChip status="info" label={it.latest_rev} />
                  ) : (
                    <span className="text-ink-500">—</span>
                  )}
                </TD>
                <TD mono>{it.dimension_count > 0 ? String(it.dimension_count) : "0"}</TD>
                <TD>
                  <button
                    type="button"
                    className="text-xs text-ink-700 underline-offset-2 hover:underline"
                    onClick={() =>
                      void navigate({ to: "/admin/items/$itemId", params: { itemId: it.id } })
                    }
                  >
                    Edit
                  </button>
                </TD>
              </TR>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => {
      setV(value);
    }, ms);
    return () => {
      clearTimeout(t);
    };
  }, [value, ms]);
  return v;
}
