import { createFileRoute } from "@tanstack/react-router";
import { ItemEditorPage } from "@/components/admin/ItemEditor";

export const Route = createFileRoute("/_authenticated/admin/items/new")({
  component: NewItemPage,
});

function NewItemPage(): React.ReactElement {
  return <ItemEditorPage />;
}
