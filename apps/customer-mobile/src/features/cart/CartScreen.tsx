import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { foundationTokens } from "@restaurant-platform/ui-tokens";
import type { PublicMenuResponse } from "@restaurant-platform/shared-types";
import { getCustomerPublicApi } from "../../api";
import { Action, Body, Card, Page } from "../../components/ui";
import { useCustomerLanguage, useCustomerText } from "../../i18n";
import { useCustomerCheckout } from "../checkout/CheckoutProvider";
import { usePublicMenu } from "../storefront/MenuProvider";
import { formatMoney } from "../storefront/presentation";
import { useCustomerCart } from "./CartProvider";
import { cartSubtotal, reviewCart, type CartLine } from "./cart";

export function CartScreen() {
  const router = useRouter();
  const language = useCustomerLanguage();
  const t = useCustomerText();
  const { lines, unavailable, remove } = useCustomerCart();
  const { state: menuState, reload } = usePublicMenu();
  const { state: checkout } = useCustomerCheckout();
  const [checked, setChecked] = useState<{ lines: CartLine[]; menu: PublicMenuResponse } | null>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const latest = useRef({ lines });
  latest.current = { lines };
  useEffect(() => () => request.current?.abort(), []);

  const menu = checked?.lines === lines ? checked.menu : menuState.status === "ready" ? menuState.data : null;
  const review = menu ? reviewCart(menu, lines) : null;
  const subtotal = review ? review.subtotal : cartSubtotal(lines);
  const currency = menu?.currency ?? lines[0]?.currency ?? "";
  const needsRecovery = checkout.status !== "idle" && checkout.status !== "rejected";
  const money = (amount: number, code = currency) => formatMoney(amount, code, language);

  async function continueToCheckout() {
    // Receipt recovery remains reachable even if today's catalog or cart has changed.
    if (needsRecovery) { router.navigate("/checkout"); return; }
    if (request.current || !lines.length) return;
    const controller = new AbortController();
    const source = lines;
    request.current = controller;
    setChecking(true);
    setNotice(null);
    try {
      const currentMenu = await getCustomerPublicApi().getPublicMenu({ signal: controller.signal });
      if (controller.signal.aborted || latest.current.lines !== source) return;
      setChecked({ lines: source, menu: currentMenu });
      const current = reviewCart(currentMenu, source);
      if (current.lines.some(line => line === null)) {
        setNotice(t("Some items or choices are unavailable. Edit or remove them before checkout.",
          "အစားအစာ သို့မဟုတ် ရွေးချယ်မှုအချို့ မရနိုင်ပါ။ အတည်မပြုမီ ပြင်ဆင်ပါ သို့မဟုတ် ဖယ်ရှားပါ။"));
        return;
      }
      if (current.subtotal === null) {
        setNotice(t("This subtotal cannot be displayed accurately. Edit your cart before checkout.",
          "စုစုပေါင်းငွေကို တိကျစွာ မပြနိုင်ပါ။ အတည်မပြုမီ ခြင်းတောင်းကို ပြင်ဆင်ပါ။"));
        return;
      }
      router.navigate("/checkout");
    } catch {
      if (!controller.signal.aborted) setNotice(t("Could not check the current menu. Reconnect and try again.",
        "လက်ရှိမီနူးကို စစ်ဆေး၍မရပါ။ အင်တာနက်ပြန်ချိတ်ပြီး ထပ်ကြိုးစားပါ။"));
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setChecking(false);
    }
  }

  return <Page title={t("Your cart", "သင့်ခြင်းတောင်း")}
    subtitle={lines.length ? t("Review your items before checkout", "အတည်မပြုမီ အစားအစာများကို ပြန်စစ်ပါ") : undefined}
    onRefresh={() => {
      request.current?.abort(); request.current = null;
      setChecking(false); setChecked(null); setNotice(null); reload();
    }}>
    {unavailable.length ? <Card title={t("Some previous items are unavailable", "ယခင်မှာယူထားသည့် အစားအစာအချို့ မရနိုင်ပါ")}>
      <Body>{unavailable.join(", ")}</Body>
    </Card> : null}
    {lines.length === 0 ? <Card title={t("Your cart is empty", "ခြင်းတောင်းထဲတွင် အစားအစာမရှိသေးပါ")}>
      <Body>{t("Choose something from the menu to get started.", "မှာယူလိုသော အစားအစာကို မီနူးမှ ရွေးပါ။")}</Body>
    </Card> : null}
    {lines.map((line, index) => {
      const current = review?.lines[index];
      const display = current ?? line;
      return <Card key={line.id} title={`${display.name} × ${line.item.quantity}`}>
        {display.variantName ? <Body tone="muted">{display.variantName}</Body> : null}
        {display.modifierNames.length ? <Body tone="muted">{display.modifierNames.join(", ")}</Body> : null}
        {line.item.specialInstruction ? <Body>{t("Kitchen note", "မီးဖိုချောင်သို့ မှတ်ချက်")} · {line.item.specialInstruction}</Body> : null}
        {current === null ? <Body tone="warning" accessibilityLiveRegion="polite">{t("Unavailable selection · edit or remove this item", "ဤရွေးချယ်မှု မရနိုင်ပါ · ပြင်ဆင်ပါ သို့မဟုတ် ဖယ်ရှားပါ")}</Body> :
          <Body style={styles.amount}>{t("Estimated line total", "အစားအစာ ခန့်မှန်းတန်ဖိုး")} · {money(display.unitPrice * display.item.quantity, display.currency)}</Body>}
        <View style={styles.actions}>
          <View style={styles.action}><Action title={t("Edit item", "အစားအစာ ပြင်ရန်")} accessibilityHint={line.name} secondary onPress={() => router.push({
            pathname: "/product/[productId]", params: { productId: line.item.productId, lineId: line.id }
          })} /></View>
          <View style={styles.action}><Action title={t("Remove item", "အစားအစာ ဖယ်ရန်")} accessibilityHint={line.name} secondary onPress={() => remove(line.id)} /></View>
        </View>
      </Card>;
    })}
    {lines.length > 0 ? <Card title={t("Estimated subtotal", "ခန့်မှန်း စုစုပေါင်းတန်ဖိုး")}>
      {subtotal !== null ? <Body style={styles.total}>{money(subtotal)}</Body> : <Body tone="warning" accessibilityLiveRegion="polite">{t("Review unavailable choices or amounts in your cart.", "ခြင်းတောင်းရှိ မရနိုင်သော ရွေးချယ်မှုများ သို့မဟုတ် ငွေပမာဏကို ပြန်စစ်ပါ။")}</Body>}
      <Body tone="muted">{t("Prices, availability and the delivery fee are checked at checkout.", "ဈေးနှုန်း၊ ရရှိနိုင်မှုနှင့် ပို့ဆောင်ခကို အမှာစာ အတည်ပြုချိန်တွင် စစ်ဆေးပါမည်။")}</Body>
      <Body tone="muted">{t("Delivery fee is calculated for your address in the server quote.", "ပို့ဆောင်ခကို သင့်လိပ်စာအတွက် ဆာဗာမှ တွက်ချက်ပါမည်။")}</Body>
      {!menu ? <Body tone="muted">{t("Saved estimates shown. Check the current menu before checkout.", "ယခင်ခန့်မှန်းငွေကို ပြထားသည်။ အတည်မပြုမီ လက်ရှိမီနူးကို စစ်ဆေးပါ။")}</Body> : null}
      {notice ? <Body tone="warning" accessibilityRole="alert" accessibilityLiveRegion="polite">{notice}</Body> : null}
      <Action title={t("Continue to checkout", "အမှာစာ အတည်ပြုရန် ဆက်သွားပါ")} loading={checking}
        onPress={() => void continueToCheckout()} accessibilityHint={t("Checks current menu choices before opening checkout", "အတည်ပြုစာမျက်နှာ မဖွင့်မီ လက်ရှိရွေးချယ်မှုကို စစ်ဆေးမည်")} />
    </Card> : null}
    {needsRecovery ? <Card title={t("Previous checkout needs review", "ယခင်မှာယူမှုကို ပြန်စစ်ရန် လိုအပ်သည်")}>
      <Body>{t("Review the previous checkout even if your cart is now empty or unavailable.", "ခြင်းတောင်း ဗလာဖြစ်သော်လည်း သို့မဟုတ် အစားအစာ မရနိုင်သော်လည်း ယခင်မှာယူမှုကို ပြန်စစ်ပါ။")}</Body>
      <Action title={t("Review previous checkout", "ယခင်မှာယူမှု ပြန်စစ်ရန်")} onPress={() => router.navigate("/checkout")} />
    </Card> : null}
    <Action title={t("Browse menu", "မီနူးကြည့်ရန်")} secondary={lines.length > 0} onPress={() => router.navigate("/menu")} />
  </Page>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: foundationTokens.spacing.sm },
  action: { flexGrow: 1, flexBasis: 120, minWidth: 0 },
  amount: { fontWeight: "600" },
  total: { ...foundationTokens.typography.title }
});
