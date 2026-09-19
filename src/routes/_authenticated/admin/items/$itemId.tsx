import { createFileRoute, useParams } from "@tanstack/react-router";
import { ItemEditorPage } from "@/components/admin/ItemEditor";

export const Route = createFileRoute("/_authenticated/admin/items/$itemId")({
  component: EditItemPage,
});

function EditItemPage(): React.ReactElement {
  const { itemId } = useParams({ from: "/_authenticated/admin/items/$itemId" });
  return <ItemEditorPage itemId={itemId} />;
}
