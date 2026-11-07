import { useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image, StyleSheet, Text } from "react-native";
import type { CreateOrderItemRequest, MenuModifierGroupDto, MenuProductDto } from "@restaurant-platform/shared-types";
import { getCustomerPublicApi } from "../../api";
import { Action, Body, Card, FormField, Page, StateView } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { queryStateLabel, useCustomerLanguage, useCustomerText } from "../../i18n";
import { useCustomerCart } from "../cart/CartProvider";
import {
  findMenuProduct, MAX_CART_LINES, MAX_ITEM_INSTRUCTION, MAX_MODIFIER_OPTIONS, MAX_MODIFIER_QUANTITY,
  prepareCartLine, productAvailable, productStockRemaining, type CartLine
} from "../cart/cart";

export function ProductScreen() {
  const { productId, lineId } = useLocalSearchParams<{ productId?: string; lineId?: string }>();
  const router = useRouter();
  const t = useCustomerText();
  const cart = useCustomerCart();
  const query = useApiQuery(signal => getCustomerPublicApi().getPublicMenu({ signal }), `product:${productId}`);
  if (query.state.status !== "ready") return <Page title={t("Item details", "အစားအစာ အသေးစိတ်")}>
    <StateView kind={query.state.status} title={queryStateLabel(query.state.status, t)} onRetry={query.reload} retryLabel={t("Try again", "ထပ်ကြိုးစားပါ")} />
  </Page>;

  const menu = query.state.data;
  const product = typeof productId === "string" ? findMenuProduct(menu, productId) : undefined;
  const line = cart.lines.find(entry => entry.id === lineId && entry.item.productId === productId);
  if (!product || lineId !== undefined && !line) return <Page title={t("Item unavailable", "ဤအစားအစာ မရနိုင်ပါ")}>
    <Action title={lineId ? t("Back to cart", "ခြင်းတောင်းသို့ ပြန်သွားရန်") : t("Back to menu", "မီနူးသို့ ပြန်ရန်")}
      onPress={() => router.navigate(lineId ? "/cart" : "/menu")} />
  </Page>;
  return <ProductDetails key={`${product.id}:${line?.id ?? "new"}`} product={product} line={line} currency={menu.currency} />;
}

function ProductDetails({ product, line, currency }: { product: MenuProductDto; line?: CartLine; currency: string }) {
  const router = useRouter();
  const t = useCustomerText();
  const language = useCustomerLanguage();
  const cart = useCustomerCart();
  const [selection, setSelection] = useState<CreateOrderItemRequest>(() => line?.item ?? {
    productId: product.id, variantId: null, quantity: 1, modifiers: [], specialInstruction: null
  });
  const [saveFailed, setSaveFailed] = useState(false);
  const submitted = useRef(false);
  const modifiers = selection.modifiers ?? [];
  const available = productAvailable(product);
  const stockRemaining = productStockRemaining(product, cart.lines, line?.id);
  const hasRoom = Boolean(line) || cart.lines.length < MAX_CART_LINES;
  const estimate = prepareCartLine(line?.id ?? "preview", product, selection, currency, cart.lines);
  const unavailableModifiers = modifiers.filter(selected => !product.modifierGroups.some(group =>
    group.options.some(option => option.id === selected.modifierOptionId && option.available)));
  const imageUrl = product.variants.find(variant => variant.id === selection.variantId)?.imageUrl ?? product.imageUrl;
  const money = (amount: number) => `${amount.toLocaleString(language)} ${currency}`.trim();
  function update(changes: Partial<CreateOrderItemRequest>) {
    setSelection(previous => ({ ...previous, ...changes }));
    setSaveFailed(false);
  }
  function setModifier(id: string, quantity: number) {
    setSelection(previous => ({ ...previous, modifiers: [
      ...(previous.modifiers ?? []).filter(option => option.modifierOptionId !== id),
      ...(quantity > 0 ? [{ modifierOptionId: id, quantity }] : [])
    ] }));
    setSaveFailed(false);
  }
  function optionLimit(group: MenuModifierGroupDto) {
    return modifiers.length >= MAX_MODIFIER_OPTIONS || group.options.filter(option =>
      modifiers.some(selected => selected.modifierOptionId === option.id)).length >= group.maxSelections;
  }
  function save() {
    if (submitted.current) return;
    submitted.current = true;
    if (cart.saveLine(product, selection, currency, line?.id)) router.replace("/cart");
    else { submitted.current = false; setSaveFailed(true); }
  }

  return <Page title={product.name} subtitle={product.description ?? undefined}>
    {imageUrl ? <Image source={{ uri: imageUrl }} accessibilityLabel={product.name} style={styles.image} resizeMode="cover" /> : null}
    {!available || stockRemaining === 0 ? <Card title={t("Item unavailable", "ဤအစားအစာ မရနိုင်ပါ")}>
      <Body>{t("Check the menu for another option.", "အခြား အစားအစာများကို မီနူးတွင် ကြည့်ပါ။")}</Body>
    </Card> : <>
      {product.variants.length ? <Card title={t("Choose a variant", "အမျိုးကွဲ ရွေးရန်")}>
        {product.variants.map(variant => <Action key={variant.id}
          title={`${variant.name} · ${variant.available && variant.price !== null ? money(variant.price) : t("Unavailable", "မရနိုင်ပါ")}`}
          selected={variant.id === selection.variantId} secondary={variant.id !== selection.variantId}
          disabled={!variant.available || variant.price === null} onPress={() => update({ variantId: variant.id })} />)}
      </Card> : null}
      {unavailableModifiers.length ? <Card title={t("Some selected options are unavailable", "ရွေးချယ်ထားသော အပိုပစ္စည်းအချို့ မရနိုင်ပါ")}>
        <Action title={t("Remove unavailable options", "မရနိုင်သော အပိုပစ္စည်းများကို ဖယ်ရန်")} secondary onPress={() => update({
          modifiers: modifiers.filter(option => !unavailableModifiers.includes(option))
        })} />
      </Card> : null}
      {product.modifierGroups.map(group => <Card key={group.id} title={group.name}>
        <Body>{group.minSelections === group.maxSelections
          ? t(`Choose ${group.minSelections}`, `${group.minSelections} မျိုး ရွေးပါ`)
          : t(`Choose ${group.minSelections}–${group.maxSelections}`, `${group.minSelections}–${group.maxSelections} မျိုး ရွေးပါ`)}</Body>
        {group.options.filter(option => option.available).map(option => {
          const quantity = modifiers.find(selected => selected.modifierOptionId === option.id)?.quantity ?? 0;
          return <Card key={option.id} title={option.name}>
            <Body>{money(option.additionalPrice)}</Body>
            <Action title={quantity ? t("Remove option", "ထပ်ထည့်ထားသည်ကို ဖယ်ရန်") : t("Select option", "ထပ်ထည့်ရန်")}
              selected={quantity > 0} secondary={quantity === 0} disabled={!quantity && optionLimit(group)}
              onPress={() => setModifier(option.id, quantity ? 0 : 1)} />
            {quantity > 0 ? <Quantity value={quantity} limit={MAX_MODIFIER_QUANTITY} onChange={value => setModifier(option.id, value)} /> : null}
          </Card>;
        })}
      </Card>)}
      <Card title={t("Quantity and preparation", "အရေအတွက်နှင့် ပြင်ဆင်ရန်")}>
        <Quantity value={selection.quantity} limit={stockRemaining} onChange={quantity => update({ quantity })} />
        <FormField label={t("Preparation instructions (optional)", "ပြင်ဆင်ရန် မှတ်ချက် (မဖြစ်မနေ မဟုတ်ပါ)")}
          value={selection.specialInstruction ?? ""} onChangeText={specialInstruction => update({ specialInstruction })} maxLength={MAX_ITEM_INSTRUCTION} />
        {estimate ? <Body>{t("Estimated item total", "ခန့်မှန်းတန်ဖိုး")} · {money(estimate.unitPrice * selection.quantity)}</Body> :
          <Body>{t("Review the required options and quantity.", "လိုအပ်သော ရွေးချယ်မှုနှင့် အရေအတွက်ကို စစ်ဆေးပါ။")}</Body>}
        {!hasRoom ? <Body>{t("Your cart is full.", "ခြင်းတောင်း ပြည့်နေပါသည်။")}</Body> : null}
        {saveFailed ? <Text accessibilityRole="alert">{t("Unable to save this selection. Review your cart and try again.", "ဤရွေးချယ်မှုကို သိမ်း၍မရပါ။ ခြင်းတောင်းကို စစ်ဆေးပြီး ထပ်ကြိုးစားပါ။")}</Text> : null}
        <Action title={line ? t("Save changes", "ပြောင်းလဲမှု သိမ်းရန်") : t("Add to cart", "ခြင်းတောင်းထဲ ထည့်ရန်")}
          onPress={save} disabled={!estimate || !hasRoom} />
      </Card>
    </>}
    <Action title={line ? t("Back to cart", "ခြင်းတောင်းသို့ ပြန်သွားရန်") : t("Back to menu", "မီနူးသို့ ပြန်ရန်")}
      secondary onPress={() => router.navigate(line ? "/cart" : "/menu")} />
  </Page>;
}

function Quantity({ value, limit, onChange }: { value: number; limit: number; onChange(value: number): void }) {
  const t = useCustomerText();
  return <>
    <Body>{t("Quantity", "အရေအတွက်")} · {value}</Body>
    <Action title={t("Decrease quantity", "အရေအတွက် လျှော့ရန်")} disabled={value <= 1} secondary onPress={() => onChange(Math.max(1, Math.min(limit, value - 1)))} />
    <Action title={t("Increase quantity", "အရေအတွက် တိုးရန်")} disabled={value >= limit} secondary onPress={() => onChange(value + 1)} />
  </>;
}

const styles = StyleSheet.create({ image: { height: 200, borderRadius: 10 } });
