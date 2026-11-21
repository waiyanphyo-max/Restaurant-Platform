import { useState } from "react";
import { Switch, View } from "react-native";
import type { CategoryResponse, ModifierGroupResponse, ModifierOptionResponse, ProductManagementResponse, ProductVariantResponse } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { Action, Badge, Body, Card, ConfirmDialog, FormField, Page, StateView, Status, useUiTheme } from "../../components/ui";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useDraftNavigation } from "../../hooks/useUnsavedChanges";
import { mutationError } from "../../hooks/mutation";
import { operationalAmount } from "../operations/format";
import { categoryRequest, draftForProduct, modifierGroupRequest, modifierOptionRequest, named, productPage, productRequest, variantRequest, wholeNumber } from "./model";
import { FeaturedProductPanel } from "./FeaturedProductPanel";
import { CatalogImageControl, CatalogPicture } from "./CatalogImageControl";
import { CatalogEditorActions } from "./CatalogEditorActions";

type Mutation = ReturnType<typeof useApiMutation>;
type ViewName = "products" | "categories" | "modifiers";

function fieldError(validate: () => unknown, show: boolean): string | undefined {
  if (!show) return undefined;
  try { validate(); return undefined; } catch (failure) { return mutationError(failure); }
}

function Toggle({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange(value: boolean): void; disabled?: boolean }) {
  const { color } = useUiTheme();
  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 48 }}>
    <Body style={{ flex: 1 }}>{label}</Body>
    <Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: color.primary }} />
  </View>;
}

function Feedback({ mutation }: { mutation: Mutation }) {
  return <>{mutation.error ? <Status tone="danger">{mutation.error}</Status> : null}
    {mutation.message ? <Body>{mutation.message}</Body> : null}</>;
}

function useCatalogApi() {
  const { state, assertWorkspaceAccess } = useOperationsAuth();
  return () => {
    if (state.status !== "ready") throw new Error("Workspace access is unavailable");
    const { userId, membership: { role } } = state;
    return getOperationsApi({ userId, assertCurrentAccess: () => assertWorkspaceAccess(userId, role) });
  };
}

export function MenuScreen() {
  const { state } = useOperationsAuth();
  if (state.status !== "ready" || !["OWNER", "MANAGER", "STAFF"].includes(state.membership.role)) {
    return <StateView kind="forbidden" message="Your restaurant role cannot access the catalog." />;
  }
  return <MenuWorkspace key={`${state.userId}:${state.membership.restaurantId}:${state.membership.role}`} />;
}

function MenuWorkspace() {
  const { state } = useOperationsAuth();
  const { requestNavigation } = useDraftNavigation();
  const canManage = state.status === "ready" && ["OWNER", "MANAGER"].includes(state.membership.role);
  const [view, setView] = useState<ViewName>("products");
  const query = useApiQuery(async signal => {
    const api = getOperationsApi();
    const [products, categories, groups, settings] = await Promise.all([
      api.listProducts({ signal }), api.listCategories({ signal }), api.listModifierGroups({ signal }), canManage ? api.getSettings({ signal }) : Promise.resolve(null)
    ]);
    return { products, categories, groups, currency: settings?.currency ?? null };
  }, `owner-menu:${canManage}`, { keepPreviousData: true });
  return <Page title="Menu" subtitle="Products, categories, variants and extras" onRefresh={query.reload} refreshing={query.state.status === "loading" || query.refreshing}>
    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{(["products", "categories", "modifiers"] as const).map(tab =>
      <Action key={tab} title={tab[0].toUpperCase() + tab.slice(1)} selected={view === tab} secondary={view !== tab} onPress={() => { if (view !== tab) requestNavigation(() => setView(tab)); }} />)}</View>
    {!canManage ? <Body>Your restaurant role can browse the menu. Menu changes require Owner or Manager access.</Body> : null}
    <QueryResult {...query}>{data => <>
      <Body>{data.currency ? `Currency: ${data.currency}` : "Currency settings require management access"} · Prices use the existing whole currency amounts.</Body>
      {view === "products" ? <><FeaturedProductPanel products={data.products} categories={data.categories} />
        <Products products={data.products} categories={data.categories} groups={data.groups} canManage={canManage} refresh={query.reload} /></>
        : view === "categories" ? <Categories categories={data.categories} canManage={canManage} refresh={query.reload} />
          : <ModifierGroups groups={data.groups} canManage={canManage} refresh={query.reload} />}
      <Action title="Refresh menu" secondary onPress={query.reload} />
    </>}</QueryResult>
  </Page>;
}

function Categories({ categories, canManage, refresh }: { categories: CategoryResponse[]; canManage: boolean; refresh(): void }) {
  const api = useCatalogApi();
  const [editor, setEditor] = useState<CategoryResponse | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<CategoryResponse | null>(null);
  const [saved, setSaved] = useState(false);
  const mutation = useApiMutation();
  return <>
    <Feedback mutation={mutation} />
    {saved && !editor ? <Status tone="success">Category save confirmed by the server.</Status> : null}
    {editor ? <CategoryForm key={editor === "new" ? "new" : editor.id} category={editor === "new" ? undefined : editor} done={() => { setEditor(null); setSaved(true); refresh(); }} cancel={() => { setEditor(null); refresh(); }} /> : <>
      {canManage ? <Action title="Create category" onPress={() => setEditor("new")} /> : null}
      {!categories.length ? <Card><Body>No categories yet. Create a category before adding products.</Body></Card> : null}
      {categories.map(category => <Card key={category.id} title={category.name}>
        <Body>Display order: {category.displayOrder} · {category.active ? "Active" : "Inactive"}</Body>
        {canManage ? <><Action title={`Edit ${category.name}`} secondary disabled={mutation.busy} onPress={() => setEditor(category)} />
          {category.active ? <Action title={`Deactivate ${category.name}`} secondary disabled={mutation.busy} onPress={() => setDeactivating(category)} /> : null}</> : null}
      </Card>)}
      <Body>Categories are deactivated to preserve catalogue and order history. Deactivating a category stops ordering all products in it.</Body>
    </>}
    <ConfirmDialog visible={deactivating !== null} title="Deactivate category?" danger message="Products in this category will stop accepting orders. Historical orders stay available."
      confirmLabel="Deactivate category" onCancel={() => setDeactivating(null)} onConfirm={() => {
        const category = deactivating; setDeactivating(null);
        if (category) void mutation.run(() => api().updateCategory(category.id, { name: category.name, displayOrder: category.displayOrder, active: false }), refresh);
      }} />
  </>;
}

function CategoryForm({ category, done, cancel }: { category?: CategoryResponse; done(): void; cancel(): void }) {
  const api = useCatalogApi();
  const [name, setName] = useState(category?.name ?? "");
  const [order, setOrder] = useState(String(category?.displayOrder ?? 0));
  const [active, setActive] = useState(category?.active ?? true);
  const mutation = useApiMutation();
  const dirty = name !== (category?.name ?? "") || order !== String(category?.displayOrder ?? 0) || active !== (category?.active ?? true);
  return <Card title={category ? "Edit category" : "New category"}>
    <FormField label="Category name" value={name} onChangeText={setName} maxLength={100} error={fieldError(() => named(name, "Category name"), dirty)} editable={!mutation.busy} />
    <FormField label="Display order" value={order} onChangeText={setOrder} keyboardType="number-pad" error={fieldError(() => wholeNumber(order, "Display order", 2147483647), dirty)} editable={!mutation.busy} />
    <Toggle label="Active" value={active} onChange={setActive} disabled={mutation.busy} />
    <CatalogEditorActions label="Category" mutation={mutation} dirty={dirty} request={() => categoryRequest(name, order, active)}
      summary={request => `${category ? `Update ${category.name}` : "Create category"}: ${request.name}\nDisplay order: ${request.displayOrder}\n${request.active ? "Active" : "Inactive — all products in this category stop accepting new orders."}`}
      save={request => category ? api().updateCategory(category.id, request) : api().createCategory(request)} done={done} cancel={cancel} />
  </Card>;
}

function Products({ products, categories, groups, canManage, refresh }: {
  products: ProductManagementResponse[]; categories: CategoryResponse[]; groups: ModifierGroupResponse[]; canManage: boolean; refresh(): void;
}) {
  const api = useCatalogApi();
  const { requestNavigation } = useDraftNavigation();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [availability, setAvailability] = useState<"all" | "available" | "unavailable">("all");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<ProductManagementResponse | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<ProductManagementResponse | null>(null);
  const [saved, setSaved] = useState(false);
  const mutation = useApiMutation();
  const listing = productPage(products, search, categoryId, availability, page);
  const selected = products.find(product => product.id === selectedId);
  if (editor) return <ProductForm key={editor === "new" ? "new" : editor.id} product={editor === "new" ? undefined : editor}
    latest={editor === "new" ? undefined : products.find(product => product.id === editor.id)} categories={categories}
    done={() => { setEditor(null); setSaved(true); refresh(); }} cancel={() => { setEditor(null); refresh(); }} />;
  if (selected) return <><Action title="Back to products" secondary onPress={() => requestNavigation(() => setSelectedId(null))} />
    <ProductDetail product={selected} categories={categories} groups={groups} canManage={canManage} edit={() => setEditor(selected)} refresh={refresh} /></>;
  return <>
    {saved ? <Status tone="success">Product save confirmed by the server.</Status> : null}
    <FormField label="Search all products" value={search} onChangeText={text => { setSearch(text); setPage(0); }} placeholder="Name or description" />
    <Card title="Filters"><Action title="All categories" secondary={categoryId !== ""} onPress={() => { setCategoryId(""); setPage(0); }} />
      {categories.map(category => <Action key={category.id} title={`${category.name}${category.active ? "" : " (inactive)"}`} secondary={categoryId !== category.id}
        onPress={() => { setCategoryId(category.id); setPage(0); }} />)}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{(["all", "available", "unavailable"] as const).map(value =>
        <Action key={value} title={value[0].toUpperCase() + value.slice(1)} secondary={availability !== value} onPress={() => { setAvailability(value); setPage(0); }} />)}</View>
    </Card>
    {canManage ? <Action title="Create product" disabled={!categories.some(category => category.active)} onPress={() => setEditor("new")} /> : null}
    {!categories.some(category => category.active) ? <Body>Create or reactivate a category before adding products.</Body> : null}
    <Feedback mutation={mutation} />
    <Body>{listing.total} matching products · Page {listing.page + 1} of {listing.pages}</Body>
    {!listing.products.length ? <Card><Body>No products match these filters.</Body></Card> : null}
    {listing.products.map(product => <Card key={product.id}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <CatalogPicture key={product.imageUrl} url={product.imageUrl} name={product.name} compact />
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Body accessibilityRole="header" style={{ fontWeight: "700" }}>{product.name}</Body>
          <Body tone="muted">{categories.find(category => category.id === product.categoryId)?.name ?? "Category unavailable"}</Body>
          <Body style={{ fontWeight: "600" }}>{operationalAmount(product.price)}</Body>
          <Badge tone={product.available && categories.some(category => category.id === product.categoryId && category.active) && (!product.trackStock || (product.stockQuantity ?? 0) > 0) ? "success" : "warning"}>
            {!product.available ? "Unavailable" : !categories.some(category => category.id === product.categoryId && category.active) ? "Category inactive" : product.trackStock && (product.stockQuantity ?? 0) === 0 ? "Out of stock" : "Available"}
          </Badge>
          <Body>{product.trackStock ? `Stock: ${product.stockQuantity ?? "Unavailable"}` : "Stock tracking off"}</Body>
        </View>
      </View>
      <Action title={`View ${product.name}`} secondary disabled={mutation.busy} onPress={() => setSelectedId(product.id)} />
      {canManage ? <><Action title={`Edit ${product.name}`} secondary disabled={mutation.busy} onPress={() => setEditor(product)} />
        {product.available ? <Action title={`Make ${product.name} unavailable`} secondary disabled={mutation.busy} onPress={() => setDeactivating(product)} /> : null}</> : null}
    </Card>)}
    <Action title="Previous products" secondary disabled={listing.page === 0} onPress={() => setPage(listing.page - 1)} />
    <Action title="Next products" secondary disabled={listing.page + 1 >= listing.pages} onPress={() => setPage(listing.page + 1)} />
    <Body>Products are made unavailable instead of deleted. Existing order names, prices and item snapshots remain unchanged.</Body>
    <ConfirmDialog visible={deactivating !== null} title="Make product unavailable?" danger message="New orders cannot select this product. Existing orders and historical prices remain unchanged."
      confirmLabel="Make unavailable" onCancel={() => setDeactivating(null)} onConfirm={() => {
        const product = deactivating; setDeactivating(null);
        if (product) void mutation.run(async () => api().updateProduct(product.id, productRequest({ ...draftForProduct(product), available: false }, categories)), refresh);
      }} />
  </>;
}

function ProductForm({ product, latest, categories, done, cancel }: { product?: ProductManagementResponse; latest?: ProductManagementResponse; categories: CategoryResponse[]; done(): void; cancel(): void }) {
  const api = useCatalogApi();
  const [draft, setDraft] = useState(() => draftForProduct(product, categories.find(category => category.active)?.id));
  const [baseline, setBaseline] = useState(() => draftForProduct(product, categories.find(category => category.active)?.id));
  const mutation = useApiMutation();
  const stale = !!product && (!latest || JSON.stringify(draftForProduct(latest)) !== JSON.stringify(baseline));
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const { requestNavigation } = useDraftNavigation();
  return <Card title={product ? "Edit product" : "New product"}>
    <FormField label="Product name" value={draft.name} onChangeText={name => setDraft({ ...draft, name })} maxLength={150} error={fieldError(() => named(draft.name, "Product name", 150), dirty)} editable={!mutation.busy} />
    <FormField label="Description" value={draft.description} onChangeText={description => setDraft({ ...draft, description })} maxLength={5000} multiline numberOfLines={4}
      textAlignVertical="top" style={{ minHeight: 100, paddingVertical: 10 }} editable={!mutation.busy} />
    <Body>Category</Body>{categories.filter(category => category.active || category.id === draft.categoryId).map(category =>
      <Action key={category.id} title={`${category.name}${category.active ? "" : " (inactive — reactivate first)"}`} secondary={draft.categoryId !== category.id}
        disabled={mutation.busy || !category.active} onPress={() => setDraft({ ...draft, categoryId: category.id })} />)}
    <FormField label="Price (whole currency amount)" value={draft.price} onChangeText={price => setDraft({ ...draft, price })} keyboardType="number-pad" error={fieldError(() => wholeNumber(draft.price, "Price"), dirty)} editable={!mutation.busy} />
    <Toggle label="Available for orders" value={draft.available} onChange={available => setDraft({ ...draft, available })} disabled={mutation.busy} />
    <Toggle label="Track stock" value={draft.trackStock} onChange={trackStock => setDraft({ ...draft, trackStock })} disabled={mutation.busy} />
    {draft.trackStock ? <FormField label="Current stock quantity" value={draft.stockQuantity} onChangeText={stockQuantity => setDraft({ ...draft, stockQuantity })} keyboardType="number-pad" error={fieldError(() => wholeNumber(draft.stockQuantity, "Stock quantity", 2147483647), dirty)} editable={!mutation.busy} /> : null}
    <Body>Upload a product image after saving. Price, availability and stock changes affect new checkouts; existing orders retain their snapshots.</Body>
    {stale ? <Status tone="warning">The server product changed while this draft was open. Your edits are kept here. Load the current product and review again before saving.</Status> : null}
    {stale && latest ? <Action title="Load current product" secondary disabled={mutation.busy} onPress={() => requestNavigation(() => {
      const current = draftForProduct(latest); setDraft(current); setBaseline(current);
    })} /> : null}
    <CatalogEditorActions label="Product" mutation={mutation} dirty={dirty} blocked={stale} request={() => productRequest(draft, categories)}
      summary={request => `${product ? `Update ${product.name}` : "Create product"}: ${request.name}\nCategory: ${categories.find(category => category.id === request.categoryId)?.name ?? "Unavailable"}\nPrice: ${operationalAmount(request.price)}\n${request.available ? "Available" : "Unavailable"} · ${request.trackStock ? `Stock: ${request.stockQuantity}` : "Stock tracking off"}`}
      save={request => product ? api().updateProduct(product.id, request) : api().createProduct(request)} done={done} cancel={cancel} />
  </Card>;
}

function ProductDetail({ product, categories, groups, canManage, edit, refresh }: {
  product: ProductManagementResponse; categories: CategoryResponse[]; groups: ModifierGroupResponse[]; canManage: boolean; edit(): void; refresh(): void;
}) {
  const api = useCatalogApi();
  const { requestNavigation } = useDraftNavigation();
  const { color } = useUiTheme();
  const [variantEditor, setVariantEditor] = useState<ProductVariantResponse | "new" | null>(null);
  const [unlinking, setUnlinking] = useState<ModifierGroupResponse | null>(null);
  const [linking, setLinking] = useState<ModifierGroupResponse | null>(null);
  const [variantSaved, setVariantSaved] = useState(false);
  const mutation = useApiMutation();
  const query = useApiQuery(async signal => {
    const api = getOperationsApi();
    const [variants, linked] = await Promise.all([api.listVariants(product.id, { signal }), api.getProductModifierGroups(product.id, { signal })]);
    return { variants, linked };
  }, `menu-product:${product.id}`, { keepPreviousData: true });
  const refreshDetails = () => { query.reload(); refresh(); };
  return <>
    <Card title={product.name}>
      {!canManage ? <CatalogPicture key={product.imageUrl} url={product.imageUrl} name={product.name} /> : null}
      <Body>{product.description || "No description"}</Body>
      <Body>{categories.find(category => category.id === product.categoryId)?.name ?? "Category unavailable"} · {operationalAmount(product.price)}</Body>
      <Body>{product.available ? "Available" : "Unavailable"} · {product.trackStock ? `Stock: ${product.stockQuantity ?? "Unavailable"}` : "Stock tracking off"}</Body>
      <Feedback mutation={mutation} />
      {canManage ? <><Action title="Edit product and stock" onPress={() => requestNavigation(edit)} disabled={mutation.busy} />
        <CatalogImageControl id={product.id} name={product.name} publishedUrl={product.imageUrl}
          upload={(api, form) => api.uploadProductImage(product.id, form, { timeoutMs: 60_000 })}
          check={async api => (await api.listProducts()).find(item => item.id === product.id) ?? null} onSaved={refresh} /></> : null}
    </Card>
    <QueryResult {...query}>{({ variants, linked }) => <>
      <Card title="Variants">
        {variantSaved ? <Status tone="success">Variant save confirmed by the server.</Status> : null}
        {!variants.length ? <Body>No variants. Orders use the standard product price.</Body> : null}
        {variants.map(variant => <View key={variant.id} style={{ gap: 12, borderTopWidth: 1, borderTopColor: color.border, paddingTop: 12 }}>
          <Body>{variant.name} · {operationalAmount(variant.price)} · {variant.available ? "Available" : "Unavailable"}</Body>
          {variant.description ? <Body>{variant.description}</Body> : null}
          {!canManage ? <CatalogPicture key={variant.imageUrl} url={variant.imageUrl} name={variant.name} /> : null}
          {canManage ? <><Action title={`Edit variant ${variant.name}`} secondary disabled={mutation.busy} onPress={() => requestNavigation(() => setVariantEditor(variant))} />
            <CatalogImageControl id={variant.id} name={variant.name} publishedUrl={variant.imageUrl}
              upload={(api, form) => api.uploadVariantImage(product.id, variant.id, form, { timeoutMs: 60_000 })}
              check={async api => (await api.listVariants(product.id)).find(item => item.id === variant.id) ?? null} onSaved={refreshDetails} /></> : null}
        </View>)}
        {canManage ? <Action title="Add variant" disabled={mutation.busy} onPress={() => requestNavigation(() => setVariantEditor("new"))} /> : null}
      </Card>
      {variantEditor ? <VariantForm key={variantEditor === "new" ? "new" : variantEditor.id} productId={product.id} variant={variantEditor === "new" ? undefined : variantEditor}
        done={() => { setVariantEditor(null); setVariantSaved(true); refreshDetails(); }} cancel={() => { setVariantEditor(null); refreshDetails(); }} /> : null}
      <Card title="Linked modifier groups">
        {!linked.length ? <Body>No modifier groups linked.</Body> : null}
        {linked.map(group => <View key={group.id} style={{ gap: 8 }}><Body>{group.name} · {group.required ? "Required" : "Optional"} · {group.active ? "Active" : "Inactive"} · Choose {group.minSelections}–{group.maxSelections}</Body>
          {group.options.map(option => <Body key={option.id}>{option.name} +{operationalAmount(option.additionalPrice)} · {option.available ? "Available" : "Unavailable"}</Body>)}
          {canManage ? <Action title={`Detach ${group.name}`} secondary disabled={mutation.busy} onPress={() => setUnlinking(group)} /> : null}
        </View>)}
        {canManage ? groups.filter(group => group.active && !linked.some(item => item.id === group.id)).map(group => <Action key={group.id} title={`Attach ${group.name}`} secondary disabled={mutation.busy}
          onPress={() => setLinking(group)} />) : null}
      </Card>
    </>}</QueryResult>
    <Action title="Refresh variants and extras" secondary onPress={refreshDetails} />
    <ConfirmDialog visible={unlinking !== null} title="Detach modifier group?" danger message="This group will no longer be offered for new orders of this product. Historical order modifiers remain unchanged."
      confirmLabel="Detach group" onCancel={() => setUnlinking(null)} onConfirm={() => {
        const group = unlinking; setUnlinking(null);
        if (group) void mutation.run(() => api().unlinkProductModifierGroup(product.id, group.id), refreshDetails);
      }} />
    <ConfirmDialog visible={linking !== null} title="Attach modifier group?" confirmLabel="Attach group"
      message={linking ? `${linking.name}: ${linking.required ? "Required" : "Optional"}, choose ${linking.minSelections}–${linking.maxSelections}. This affects new checkouts for ${product.name}. Required choices must be available before customers can order. Historical order modifiers remain unchanged.` : ""}
      onCancel={() => setLinking(null)} onConfirm={() => {
        const group = linking; setLinking(null);
        if (group && groups.some(current => current.id === group.id && current.active)) void mutation.run(() => api().linkProductModifierGroup(product.id, group.id), refreshDetails);
      }} />
  </>;
}

function VariantForm({ productId, variant, done, cancel }: { productId: string; variant?: ProductVariantResponse; done(): void; cancel(): void }) {
  const api = useCatalogApi();
  const [name, setName] = useState(variant?.name ?? "");
  const [description, setDescription] = useState(variant?.description ?? "");
  const [price, setPrice] = useState(variant && Number.isSafeInteger(variant.price) ? String(variant.price) : "");
  const [available, setAvailable] = useState(variant?.available ?? true);
  const mutation = useApiMutation();
  const dirty = name !== (variant?.name ?? "") || description !== (variant?.description ?? "") || price !== (variant && Number.isSafeInteger(variant.price) ? String(variant.price) : "") || available !== (variant?.available ?? true);
  return <Card title={variant ? "Edit variant" : "New variant"}>
    <FormField label="Variant name" value={name} onChangeText={setName} maxLength={100} error={fieldError(() => named(name, "Variant name"), dirty)} editable={!mutation.busy} />
    <FormField label="Variant description (optional)" value={description} onChangeText={setDescription} multiline numberOfLines={4}
      textAlignVertical="top" style={{ minHeight: 100, paddingVertical: 10 }} maxLength={5000} editable={!mutation.busy} />
    <FormField label="Variant price (whole currency amount)" value={price} onChangeText={setPrice} keyboardType="number-pad" error={fieldError(() => wholeNumber(price, "Variant price"), dirty)} editable={!mutation.busy} />
    <Toggle label="Variant available" value={available} onChange={setAvailable} disabled={mutation.busy} />
    <CatalogEditorActions label="Variant" mutation={mutation} dirty={dirty} request={() => variantRequest(name, price, available, variant?.imageUrl ?? null, description)}
      summary={request => `${variant ? `Update ${variant.name}` : "Create variant"}: ${request.name}\nPrice: ${operationalAmount(request.price)} · ${request.available ? "Available" : "Unavailable"}\n${request.description ?? "No description"}`}
      save={request => variant ? api().updateVariant(productId, variant.id, request) : api().createVariant(productId, request)} done={done} cancel={cancel} />
  </Card>;
}

function ModifierGroups({ groups, canManage, refresh }: { groups: ModifierGroupResponse[]; canManage: boolean; refresh(): void }) {
  const [editor, setEditor] = useState<ModifierGroupResponse | "new" | null>(null);
  const [option, setOption] = useState<{ groupId: string; option?: ModifierOptionResponse } | null>(null);
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState(false);
  if (editor) return <GroupForm key={editor === "new" ? "new" : editor.id} group={editor === "new" ? undefined : editor} done={() => { setEditor(null); setSaved(true); refresh(); }} cancel={() => { setEditor(null); refresh(); }} />;
  if (option) return <OptionForm key={option.option?.id ?? option.groupId} groupId={option.groupId} option={option.option} done={() => { setOption(null); setSaved(true); refresh(); }} cancel={() => { setOption(null); refresh(); }} />;
  const matching = groups.filter(group => `${group.name} ${group.options.map(item => item.name).join(" ")}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <>
    {saved ? <Status tone="success">Modifier save confirmed by the server.</Status> : null}
    <FormField label="Search groups and options" value={search} onChangeText={setSearch} />
    {canManage ? <Action title="Create modifier group" onPress={() => setEditor("new")} /> : null}
    {!matching.length ? <Card><Body>No modifier groups match.</Body></Card> : null}
    {matching.map(group => <Card key={group.id} title={group.name}>
      <Body>{group.active ? "Active" : "Inactive"} · {group.required ? "Required" : "Optional"} · Choose {group.minSelections}–{group.maxSelections}</Body>
      {canManage ? <Action title={`Edit ${group.name} rules`} secondary onPress={() => setEditor(group)} /> : null}
      {!group.options.length ? <Body>No options yet.</Body> : null}
      {group.options.map(item => <View key={item.id} style={{ gap: 8 }}><Body>{item.name} +{operationalAmount(item.additionalPrice)} · {item.available ? "Available" : "Unavailable"}</Body>
        {canManage ? <Action title={`Edit option ${item.name}`} secondary onPress={() => setOption({ groupId: group.id, option: item })} /> : null}</View>)}
      {canManage ? <Action title={`Add option to ${group.name}`} secondary disabled={!group.active} onPress={() => setOption({ groupId: group.id })} /> : null}
    </Card>)}
    <Body>Attach groups from a product's details. Inactive groups and unavailable options stop appearing on new orders.</Body>
  </>;
}

function GroupForm({ group, done, cancel }: { group?: ModifierGroupResponse; done(): void; cancel(): void }) {
  const api = useCatalogApi();
  const [name, setName] = useState(group?.name ?? "");
  const [required, setRequired] = useState(group?.required ?? false);
  const [minimum, setMinimum] = useState(String(group?.minSelections ?? 0));
  const [maximum, setMaximum] = useState(String(group?.maxSelections ?? 1));
  const [active, setActive] = useState(group?.active ?? true);
  const mutation = useApiMutation();
  const dirty = name !== (group?.name ?? "") || required !== (group?.required ?? false) || minimum !== String(group?.minSelections ?? 0)
    || maximum !== String(group?.maxSelections ?? 1) || active !== (group?.active ?? true);
  return <Card title={group ? "Edit modifier group" : "New modifier group"}>
    <FormField label="Group name" value={name} onChangeText={setName} maxLength={100} error={fieldError(() => named(name, "Group name"), dirty)} editable={!mutation.busy} />
    <Toggle label="Selection required" value={required} onChange={setRequired} disabled={mutation.busy} />
    <FormField label="Minimum selections" value={minimum} onChangeText={setMinimum} keyboardType="number-pad" error={fieldError(() => wholeNumber(minimum, "Minimum selections", 2147483647), dirty)} editable={!mutation.busy} />
    <FormField label="Maximum selections" value={maximum} onChangeText={setMaximum} keyboardType="number-pad" error={fieldError(() => modifierGroupRequest(name, required, minimum, maximum, active), dirty)} editable={!mutation.busy} />
    <Toggle label="Group active" value={active} onChange={setActive} disabled={mutation.busy} />
    <Body>Required rules and unavailable choices can prevent a new checkout. Review every linked product after changing this group.</Body>
    <CatalogEditorActions label="Group" mutation={mutation} dirty={dirty} request={() => modifierGroupRequest(name, required, minimum, maximum, active)}
      summary={request => `${group ? `Update ${group.name}` : "Create modifier group"}: ${request.name}\n${request.required ? "Required" : "Optional"} · Choose ${request.minSelections}–${request.maxSelections}\n${request.active ? "Active" : "Inactive"}. Applies to all linked products.`}
      save={request => group ? api().updateModifierGroup(group.id, request) : api().createModifierGroup(request)} done={done} cancel={cancel} />
  </Card>;
}

function OptionForm({ groupId, option, done, cancel }: { groupId: string; option?: ModifierOptionResponse; done(): void; cancel(): void }) {
  const api = useCatalogApi();
  const [name, setName] = useState(option?.name ?? "");
  const [price, setPrice] = useState(option && Number.isSafeInteger(option.additionalPrice) ? String(option.additionalPrice) : "");
  const [available, setAvailable] = useState(option?.available ?? true);
  const mutation = useApiMutation();
  const dirty = name !== (option?.name ?? "") || price !== (option && Number.isSafeInteger(option.additionalPrice) ? String(option.additionalPrice) : "") || available !== (option?.available ?? true);
  return <Card title={option ? "Edit modifier option" : "New modifier option"}>
    <FormField label="Option name" value={name} onChangeText={setName} maxLength={100} error={fieldError(() => named(name, "Option name"), dirty)} editable={!mutation.busy} />
    <FormField label="Additional price (whole currency amount)" value={price} onChangeText={setPrice} keyboardType="number-pad" error={fieldError(() => wholeNumber(price, "Additional price"), dirty)} editable={!mutation.busy} />
    <Toggle label="Option available" value={available} onChange={setAvailable} disabled={mutation.busy} />
    <CatalogEditorActions label="Option" mutation={mutation} dirty={dirty} request={() => modifierOptionRequest(name, price, available)}
      summary={request => `${option ? `Update ${option.name}` : "Create modifier option"}: ${request.name}\nAdditional price: ${operationalAmount(request.additionalPrice)} · ${request.available ? "Available" : "Unavailable — check required-group minimums before customers order."}`}
      save={request => option ? api().updateModifierOption(groupId, option.id, request) : api().createModifierOption(groupId, request)} done={done} cancel={cancel} />
  </Card>;
}
