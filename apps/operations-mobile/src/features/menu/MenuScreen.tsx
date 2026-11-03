import { useState } from "react";
import { Image, Switch, Text, View } from "react-native";
import type { CategoryResponse, ModifierGroupResponse, ModifierOptionResponse, ProductManagementResponse, ProductVariantResponse } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { pickAndUploadImage } from "../../components/imageUpload";
import { Action, Body, Card, ConfirmDialog, FormField, Page } from "../../components/ui";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { operationalAmount } from "../operations/format";
import { categoryRequest, draftForProduct, modifierGroupRequest, modifierOptionRequest, productPage, productRequest, variantRequest } from "./model";

type Mutation = ReturnType<typeof useApiMutation>;
type ViewName = "products" | "categories" | "modifiers";

function Toggle({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange(value: boolean): void; disabled?: boolean }) {
  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
    <Text style={{ flex: 1, color: "#334155", fontSize: 15 }}>{label}</Text>
    <Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} />
  </View>;
}

function Feedback({ mutation }: { mutation: Mutation }) {
  return <>{mutation.error ? <Text accessibilityRole="alert" style={{ color: "#b91c1c" }}>{mutation.error}</Text> : null}
    {mutation.message ? <Body>{mutation.message}</Body> : null}</>;
}

function SaveAction({ title, mutation, onSave, confirmMessage }: { title: string; mutation: Mutation; onSave(): void; confirmMessage?: string }) {
  const [confirming, setConfirming] = useState(false);
  return <><Action title={mutation.busy ? "Saving…" : title} disabled={mutation.busy}
    onPress={() => confirmMessage ? setConfirming(true) : onSave()} />
    <ConfirmDialog visible={confirming} title="Confirm availability change" message={confirmMessage ?? ""} confirmLabel="Save change"
      onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); onSave(); }} />
  </>;
}

function Picture({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? <Image accessibilityLabel={`${name} image`} source={{ uri: url }} onError={() => setFailed(true)}
    style={{ width: "100%", height: 140, borderRadius: 8 }} resizeMode="contain" /> : <Body>Image unavailable</Body>;
}

export function MenuScreen() {
  const { state } = useOperationsAuth();
  const canManage = state.status === "ready" && ["OWNER", "MANAGER"].includes(state.membership.role);
  const [view, setView] = useState<ViewName>("products");
  const query = useApiQuery(async signal => {
    const api = getOperationsApi();
    const [products, categories, groups, settings] = await Promise.all([
      api.listProducts({ signal }), api.listCategories({ signal }), api.listModifierGroups({ signal }), canManage ? api.getSettings({ signal }) : Promise.resolve(null)
    ]);
    return { products, categories, groups, currency: settings?.currency ?? null };
  }, `owner-menu:${canManage}`);
  return <Page title="Menu" subtitle="Products, categories, variants and extras" onRefresh={query.reload} refreshing={query.state.status === "loading"}>
    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{(["products", "categories", "modifiers"] as const).map(tab =>
      <Action key={tab} title={tab[0].toUpperCase() + tab.slice(1)} secondary={view !== tab} onPress={() => setView(tab)} />)}</View>
    {!canManage ? <Body>Your restaurant role can browse the menu. Menu changes require Owner or Manager access.</Body> : null}
    <QueryResult {...query}>{data => <>
      <Body>{data.currency ? `Currency: ${data.currency}` : "Currency settings require management access"} · Prices use the existing whole currency amounts.</Body>
      {view === "products" ? <Products products={data.products} categories={data.categories} groups={data.groups} canManage={canManage} refresh={query.reload} />
        : view === "categories" ? <Categories categories={data.categories} canManage={canManage} refresh={query.reload} />
          : <ModifierGroups groups={data.groups} canManage={canManage} refresh={query.reload} />}
      <Action title="Refresh menu" secondary onPress={query.reload} />
    </>}</QueryResult>
  </Page>;
}

function Categories({ categories, canManage, refresh }: { categories: CategoryResponse[]; canManage: boolean; refresh(): void }) {
  const [editor, setEditor] = useState<CategoryResponse | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<CategoryResponse | null>(null);
  const mutation = useApiMutation();
  return <>
    <Feedback mutation={mutation} />
    {editor ? <CategoryForm key={editor === "new" ? "new" : editor.id} category={editor === "new" ? undefined : editor} done={refresh} cancel={() => setEditor(null)} /> : <>
      {canManage ? <Action title="Create category" onPress={() => setEditor("new")} /> : null}
      {!categories.length ? <Card><Body>No categories yet. Create a category before adding products.</Body></Card> : null}
      {categories.map(category => <Card key={category.id} title={category.name}>
        <Body>Display order: {category.displayOrder} · {category.active ? "Active" : "Inactive"}</Body>
        {canManage ? <><Action title={`Edit ${category.name}`} secondary disabled={mutation.busy} onPress={() => setEditor(category)} />
          {category.active ? <Action title={`Deactivate ${category.name}`} secondary disabled={mutation.busy} onPress={() => setDeactivating(category)} /> : null}</> : null}
      </Card>)}
      <Body>Categories are deactivated to preserve catalogue and order history. Deactivating a category stops ordering all products in it.</Body>
    </>}
    <ConfirmDialog visible={deactivating !== null} title="Deactivate category?" message="Products in this category will stop accepting orders. Historical orders stay available."
      confirmLabel="Deactivate category" onCancel={() => setDeactivating(null)} onConfirm={() => {
        const category = deactivating; setDeactivating(null);
        if (category) void mutation.run(() => getOperationsApi().updateCategory(category.id, { name: category.name, displayOrder: category.displayOrder, active: false }), refresh);
      }} />
  </>;
}

function CategoryForm({ category, done, cancel }: { category?: CategoryResponse; done(): void; cancel(): void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [order, setOrder] = useState(String(category?.displayOrder ?? 0));
  const [active, setActive] = useState(category?.active ?? true);
  const mutation = useApiMutation();
  return <Card title={category ? "Edit category" : "New category"}>
    <FormField label="Category name" value={name} onChangeText={setName} maxLength={100} editable={!mutation.busy} />
    <FormField label="Display order" value={order} onChangeText={setOrder} keyboardType="number-pad" editable={!mutation.busy} />
    <Toggle label="Active" value={active} onChange={setActive} disabled={mutation.busy} />
    <Feedback mutation={mutation} />
    <SaveAction title="Save category" mutation={mutation} confirmMessage={category?.active && !active ? "All products in this category will stop accepting orders. Historical orders remain unchanged." : undefined} onSave={() => void mutation.run(async () => {
      const request = categoryRequest(name, order, active);
      return category ? getOperationsApi().updateCategory(category.id, request) : getOperationsApi().createCategory(request);
    }, done)} />
    <Action title="Cancel" secondary onPress={cancel} disabled={mutation.busy} />
  </Card>;
}

function Products({ products, categories, groups, canManage, refresh }: {
  products: ProductManagementResponse[]; categories: CategoryResponse[]; groups: ModifierGroupResponse[]; canManage: boolean; refresh(): void;
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [availability, setAvailability] = useState<"all" | "available" | "unavailable">("all");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<ProductManagementResponse | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<ProductManagementResponse | null>(null);
  const mutation = useApiMutation();
  const listing = productPage(products, search, categoryId, availability, page);
  const selected = products.find(product => product.id === selectedId);
  if (editor) return <ProductForm key={editor === "new" ? "new" : editor.id} product={editor === "new" ? undefined : editor} categories={categories}
    done={refresh} cancel={() => setEditor(null)} />;
  if (selected) return <><Action title="Back to products" secondary onPress={() => setSelectedId(null)} />
    <ProductDetail product={selected} categories={categories} groups={groups} canManage={canManage} edit={() => setEditor(selected)} refresh={refresh} /></>;
  return <>
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
    {listing.products.map(product => <Card key={product.id} title={product.name}>
      <Body>{categories.find(category => category.id === product.categoryId)?.name ?? "Category unavailable"} · {operationalAmount(product.price)}</Body>
      <Body>{product.available ? "Available" : "Unavailable"} · {product.trackStock ? `Stock: ${product.stockQuantity ?? "Unavailable"}` : "Stock tracking off"}</Body>
      <Action title={`View ${product.name}`} secondary disabled={mutation.busy} onPress={() => setSelectedId(product.id)} />
      {canManage ? <><Action title={`Edit ${product.name}`} secondary disabled={mutation.busy} onPress={() => setEditor(product)} />
        {product.available ? <Action title={`Make ${product.name} unavailable`} secondary disabled={mutation.busy} onPress={() => setDeactivating(product)} /> : null}</> : null}
    </Card>)}
    <Action title="Previous products" secondary disabled={listing.page === 0} onPress={() => setPage(listing.page - 1)} />
    <Action title="Next products" secondary disabled={listing.page + 1 >= listing.pages} onPress={() => setPage(listing.page + 1)} />
    <Body>Products are made unavailable instead of deleted. Existing order names, prices and item snapshots remain unchanged.</Body>
    <ConfirmDialog visible={deactivating !== null} title="Make product unavailable?" message="New orders cannot select this product. Existing orders and historical prices remain unchanged."
      confirmLabel="Make unavailable" onCancel={() => setDeactivating(null)} onConfirm={() => {
        const product = deactivating; setDeactivating(null);
        if (product) void mutation.run(async () => getOperationsApi().updateProduct(product.id, productRequest({ ...draftForProduct(product), available: false }, categories)), refresh);
      }} />
  </>;
}

function ProductForm({ product, categories, done, cancel }: { product?: ProductManagementResponse; categories: CategoryResponse[]; done(): void; cancel(): void }) {
  const [draft, setDraft] = useState(() => draftForProduct(product, categories.find(category => category.active)?.id));
  const mutation = useApiMutation();
  return <Card title={product ? "Edit product" : "New product"}>
    <FormField label="Product name" value={draft.name} onChangeText={name => setDraft({ ...draft, name })} maxLength={150} editable={!mutation.busy} />
    <FormField label="Description" value={draft.description} onChangeText={description => setDraft({ ...draft, description })} maxLength={5000} multiline editable={!mutation.busy} />
    <Body>Category</Body>{categories.filter(category => category.active || category.id === draft.categoryId).map(category =>
      <Action key={category.id} title={`${category.name}${category.active ? "" : " (inactive — reactivate first)"}`} secondary={draft.categoryId !== category.id}
        disabled={mutation.busy || !category.active} onPress={() => setDraft({ ...draft, categoryId: category.id })} />)}
    <FormField label="Price (whole currency amount)" value={draft.price} onChangeText={price => setDraft({ ...draft, price })} keyboardType="number-pad" editable={!mutation.busy} />
    <Toggle label="Available for orders" value={draft.available} onChange={available => setDraft({ ...draft, available })} disabled={mutation.busy} />
    <Toggle label="Track stock" value={draft.trackStock} onChange={trackStock => setDraft({ ...draft, trackStock })} disabled={mutation.busy} />
    {draft.trackStock ? <FormField label="Current stock quantity" value={draft.stockQuantity} onChangeText={stockQuantity => setDraft({ ...draft, stockQuantity })} keyboardType="number-pad" editable={!mutation.busy} /> : null}
    <Body>Upload a product image after saving. Stock changes affect future orders; historical order prices remain unchanged.</Body>
    <Feedback mutation={mutation} />
    <SaveAction title="Save product" mutation={mutation} confirmMessage={product?.available && !draft.available ? "This product will stop accepting new orders. Historical order prices remain unchanged." : undefined} onSave={() => void mutation.run(async () => {
      const request = productRequest(draft, categories);
      return product ? getOperationsApi().updateProduct(product.id, request) : getOperationsApi().createProduct(request);
    }, done)} />
    <Action title="Cancel" secondary onPress={cancel} disabled={mutation.busy} />
  </Card>;
}

function ProductDetail({ product, categories, groups, canManage, edit, refresh }: {
  product: ProductManagementResponse; categories: CategoryResponse[]; groups: ModifierGroupResponse[]; canManage: boolean; edit(): void; refresh(): void;
}) {
  const [variantEditor, setVariantEditor] = useState<ProductVariantResponse | "new" | null>(null);
  const [unlinking, setUnlinking] = useState<ModifierGroupResponse | null>(null);
  const mutation = useApiMutation();
  const query = useApiQuery(async signal => {
    const api = getOperationsApi();
    const [variants, linked] = await Promise.all([api.listVariants(product.id, { signal }), api.getProductModifierGroups(product.id, { signal })]);
    return { variants, linked };
  }, `menu-product:${product.id}`);
  return <>
    <Card title={product.name}><Picture key={product.imageUrl} url={product.imageUrl} name={product.name} />
      <Body>{product.description || "No description"}</Body>
      <Body>{categories.find(category => category.id === product.categoryId)?.name ?? "Category unavailable"} · {operationalAmount(product.price)}</Body>
      <Body>{product.available ? "Available" : "Unavailable"} · {product.trackStock ? `Stock: ${product.stockQuantity ?? "Unavailable"}` : "Stock tracking off"}</Body>
      <Feedback mutation={mutation} />
      {canManage ? <><Action title="Edit product and stock" onPress={edit} disabled={mutation.busy} />
        <Action title={mutation.busy ? "Uploading…" : "Upload product image"} secondary disabled={mutation.busy} onPress={() => void mutation.run(
          () => pickAndUploadImage(form => getOperationsApi().uploadProductImage(product.id, form)),
          uploaded => { if (uploaded) refresh(); else mutation.reset(); }
        )} /></> : null}
    </Card>
    <QueryResult {...query}>{({ variants, linked }) => <>
      <Card title="Variants">
        {!variants.length ? <Body>No variants. Orders use the standard product price.</Body> : null}
        {variants.map(variant => <View key={variant.id} style={{ gap: 10, borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 12 }}>
          <Body>{variant.name} · {operationalAmount(variant.price)} · {variant.available ? "Available" : "Unavailable"}</Body>
          {variant.imageUrl ? <Picture key={variant.imageUrl} url={variant.imageUrl} name={variant.name} /> : null}
          {canManage ? <><Action title={`Edit variant ${variant.name}`} secondary disabled={mutation.busy} onPress={() => setVariantEditor(variant)} />
            <Action title={`Upload ${variant.name} image`} secondary disabled={mutation.busy} onPress={() => void mutation.run(
              () => pickAndUploadImage(form => getOperationsApi().uploadVariantImage(product.id, variant.id, form)),
              uploaded => { if (uploaded) query.reload(); else mutation.reset(); }
            )} /></> : null}
        </View>)}
        {canManage ? <Action title="Add variant" disabled={mutation.busy} onPress={() => setVariantEditor("new")} /> : null}
      </Card>
      {variantEditor ? <VariantForm key={variantEditor === "new" ? "new" : variantEditor.id} productId={product.id} variant={variantEditor === "new" ? undefined : variantEditor}
        done={() => { setVariantEditor(null); query.reload(); }} cancel={() => setVariantEditor(null)} /> : null}
      <Card title="Linked modifier groups">
        {!linked.length ? <Body>No modifier groups linked.</Body> : null}
        {linked.map(group => <View key={group.id} style={{ gap: 8 }}><Body>{group.name} · {group.active ? "Active" : "Inactive"} · Choose {group.minSelections}–{group.maxSelections}</Body>
          {group.options.map(option => <Body key={option.id}>{option.name} +{operationalAmount(option.additionalPrice)} · {option.available ? "Available" : "Unavailable"}</Body>)}
          {canManage ? <Action title={`Detach ${group.name}`} secondary disabled={mutation.busy} onPress={() => setUnlinking(group)} /> : null}
        </View>)}
        {canManage ? groups.filter(group => group.active && !linked.some(item => item.id === group.id)).map(group => <Action key={group.id} title={`Attach ${group.name}`} secondary disabled={mutation.busy}
          onPress={() => void mutation.run(() => getOperationsApi().linkProductModifierGroup(product.id, group.id), query.reload)} />) : null}
      </Card>
    </>}</QueryResult>
    <Action title="Refresh variants and extras" secondary onPress={query.reload} />
    <ConfirmDialog visible={unlinking !== null} title="Detach modifier group?" message="This group will no longer be offered for new orders of this product. Historical order modifiers remain unchanged."
      confirmLabel="Detach group" onCancel={() => setUnlinking(null)} onConfirm={() => {
        const group = unlinking; setUnlinking(null);
        if (group) void mutation.run(() => getOperationsApi().unlinkProductModifierGroup(product.id, group.id), query.reload);
      }} />
  </>;
}

function VariantForm({ productId, variant, done, cancel }: { productId: string; variant?: ProductVariantResponse; done(): void; cancel(): void }) {
  const [name, setName] = useState(variant?.name ?? "");
  const [price, setPrice] = useState(variant && Number.isSafeInteger(variant.price) ? String(variant.price) : "");
  const [available, setAvailable] = useState(variant?.available ?? true);
  const mutation = useApiMutation();
  return <Card title={variant ? "Edit variant" : "New variant"}>
    <FormField label="Variant name" value={name} onChangeText={setName} maxLength={100} editable={!mutation.busy} />
    <FormField label="Variant price (whole currency amount)" value={price} onChangeText={setPrice} keyboardType="number-pad" editable={!mutation.busy} />
    <Toggle label="Variant available" value={available} onChange={setAvailable} disabled={mutation.busy} />
    <Feedback mutation={mutation} />
    <SaveAction title="Save variant" mutation={mutation} confirmMessage={variant?.available && !available ? "This variant will no longer be offered on new orders. Historical variants remain unchanged." : undefined} onSave={() => void mutation.run(async () => {
      const request = variantRequest(name, price, available, variant?.imageUrl ?? null);
      return variant ? getOperationsApi().updateVariant(productId, variant.id, request) : getOperationsApi().createVariant(productId, request);
    }, done)} />
    <Action title="Cancel" secondary disabled={mutation.busy} onPress={cancel} />
  </Card>;
}

function ModifierGroups({ groups, canManage, refresh }: { groups: ModifierGroupResponse[]; canManage: boolean; refresh(): void }) {
  const [editor, setEditor] = useState<ModifierGroupResponse | "new" | null>(null);
  const [option, setOption] = useState<{ groupId: string; option?: ModifierOptionResponse } | null>(null);
  const [search, setSearch] = useState("");
  if (editor) return <GroupForm key={editor === "new" ? "new" : editor.id} group={editor === "new" ? undefined : editor} done={refresh} cancel={() => setEditor(null)} />;
  if (option) return <OptionForm key={option.option?.id ?? option.groupId} groupId={option.groupId} option={option.option} done={refresh} cancel={() => setOption(null)} />;
  const matching = groups.filter(group => `${group.name} ${group.options.map(item => item.name).join(" ")}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <>
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
  const [name, setName] = useState(group?.name ?? "");
  const [required, setRequired] = useState(group?.required ?? false);
  const [minimum, setMinimum] = useState(String(group?.minSelections ?? 0));
  const [maximum, setMaximum] = useState(String(group?.maxSelections ?? 1));
  const [active, setActive] = useState(group?.active ?? true);
  const mutation = useApiMutation();
  return <Card title={group ? "Edit modifier group" : "New modifier group"}>
    <FormField label="Group name" value={name} onChangeText={setName} maxLength={100} editable={!mutation.busy} />
    <Toggle label="Selection required" value={required} onChange={setRequired} disabled={mutation.busy} />
    <FormField label="Minimum selections" value={minimum} onChangeText={setMinimum} keyboardType="number-pad" editable={!mutation.busy} />
    <FormField label="Maximum selections" value={maximum} onChangeText={setMaximum} keyboardType="number-pad" editable={!mutation.busy} />
    <Toggle label="Group active" value={active} onChange={setActive} disabled={mutation.busy} />
    <Feedback mutation={mutation} />
    <SaveAction title="Save group" mutation={mutation} confirmMessage={group?.active && !active ? "This modifier group will stop appearing on every linked product. Historical order modifiers remain unchanged." : undefined} onSave={() => void mutation.run(async () => {
      const request = modifierGroupRequest(name, required, minimum, maximum, active);
      return group ? getOperationsApi().updateModifierGroup(group.id, request) : getOperationsApi().createModifierGroup(request);
    }, done)} />
    <Action title="Cancel" secondary disabled={mutation.busy} onPress={cancel} />
  </Card>;
}

function OptionForm({ groupId, option, done, cancel }: { groupId: string; option?: ModifierOptionResponse; done(): void; cancel(): void }) {
  const [name, setName] = useState(option?.name ?? "");
  const [price, setPrice] = useState(option && Number.isSafeInteger(option.additionalPrice) ? String(option.additionalPrice) : "");
  const [available, setAvailable] = useState(option?.available ?? true);
  const mutation = useApiMutation();
  return <Card title={option ? "Edit modifier option" : "New modifier option"}>
    <FormField label="Option name" value={name} onChangeText={setName} maxLength={100} editable={!mutation.busy} />
    <FormField label="Additional price (whole currency amount)" value={price} onChangeText={setPrice} keyboardType="number-pad" editable={!mutation.busy} />
    <Toggle label="Option available" value={available} onChange={setAvailable} disabled={mutation.busy} />
    <Feedback mutation={mutation} />
    <SaveAction title="Save option" mutation={mutation} confirmMessage={option?.available && !available ? "This modifier option will no longer be offered on new orders. Historical order modifiers remain unchanged." : undefined} onSave={() => void mutation.run(async () => {
      const request = modifierOptionRequest(name, price, available);
      return option ? getOperationsApi().updateModifierOption(groupId, option.id, request) : getOperationsApi().createModifierOption(groupId, request);
    }, done)} />
    <Action title="Cancel" secondary disabled={mutation.busy} onPress={cancel} />
  </Card>;
}
