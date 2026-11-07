import { useRouter } from "expo-router";
import { Action, Body, Card, Page } from "../../components/ui";
import { useCustomerLanguage, useCustomerText } from "../../i18n";
import { useCustomerCart } from "./CartProvider";

export function CartScreen() {
  const router = useRouter();
  const language = useCustomerLanguage();
  const t = useCustomerText();
  const { lines, unavailable, remove } = useCustomerCart();
  const currency = lines[0]?.currency ?? "";
  const subtotal = lines.reduce((amount, line) => amount + line.unitPrice * line.item.quantity, 0);
  const money = (amount: number, currency: string) => `${amount.toLocaleString(language)} ${currency}`.trim();
  return <Page title={t("Your cart", "သင့်ခြင်းတောင်း")}>
    {unavailable.length ? <Card title={t("Some previous items are unavailable", "ယခင်မှာယူထားသည့် အစားအစာအချို့ မရနိုင်ပါ")}>
      <Body>{unavailable.join(", ")}</Body>
    </Card> : null}
    {lines.length === 0 ? <Card title={t("Your cart is empty", "ခြင်းတောင်းထဲတွင် အစားအစာမရှိသေးပါ")}>
      <Body>{t("Choose something from the menu to get started.", "မှာယူလိုသော အစားအစာကို မီနူးမှ ရွေးပါ။")}</Body>
    </Card> : null}
    {lines.map(line => <Card key={line.id} title={`${line.item.quantity} × ${line.name}`}>
      {line.variantName ? <Body>{line.variantName}</Body> : null}
      {line.modifierNames.length ? <Body>{line.modifierNames.join(", ")}</Body> : null}
      {line.item.specialInstruction ? <Body>{line.item.specialInstruction}</Body> : null}
      <Body>{money(line.unitPrice * line.item.quantity, line.currency)}</Body>
      <Action title={t("Edit item", "အစားအစာ ပြင်ရန်")} secondary onPress={() => router.push({
        pathname: "/product/[productId]", params: { productId: line.item.productId, lineId: line.id }
      })} />
      <Action title={t("Remove item", "အစားအစာ ဖယ်ရန်")} secondary onPress={() => remove(line.id)} />
    </Card>)}
    {lines.length > 0 ? <Card title={t("Estimated subtotal", "ခန့်မှန်း စုစုပေါင်းတန်ဖိုး")}>
      {Number.isSafeInteger(subtotal) && lines.every(line => line.currency === currency) ? <Body>{money(subtotal, currency)}</Body> : null}
      <Body>{t("Prices, availability and the delivery fee are checked at checkout.", "ဈေးနှုန်း၊ ရရှိနိုင်မှုနှင့် ပို့ဆောင်ခကို အမှာစာ အတည်ပြုချိန်တွင် စစ်ဆေးပါမည်။")}</Body>
      <Action title={t("Continue to checkout", "အမှာစာ အတည်ပြုရန် ဆက်သွားပါ")} onPress={() => router.navigate("/checkout")} />
    </Card> : null}
    <Action title={t("Browse menu", "မီနူးကြည့်ရန်")} secondary={lines.length > 0} onPress={() => router.navigate("/menu")} />
  </Page>;
}
