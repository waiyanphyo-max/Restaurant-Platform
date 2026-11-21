import type { NavigationItem, OperationsRole } from "./policy";
import { Action, Body, Card, Page } from "../components/ui";
import { useOperationsText } from "./OperationsLanguage";
import { workspaceNavigation } from "./presentation";

const labels: Record<string, readonly [string, string]> = {
  dashboard: ["Today", "ယနေ့"], orders: ["Orders & counter ordering", "မှာယူမှုနှင့် ကောင်တာအော်ဒါ"],
  queue: ["Pickup queue", "လာယူရန် စောင့်ဆိုင်းစာရင်း"], deliveries: ["Delivery tasks", "ပို့ဆောင်ရေးတာဝန်များ"],
  menu: ["Menu", "မီနူး"], tables: ["Tables & QR", "စားပွဲနှင့် QR"], settings: ["Restaurant & runtime colors", "ဆိုင်နှင့် အက်ပ်အရောင်များ"],
  team: ["Team", "ဝန်ထမ်းများ"], shopping: ["Shopping", "ဝယ်ယူရန်စာရင်း"], purchasing: ["Purchases & suppliers", "ဝယ်ယူမှုနှင့် ပေးသွင်းသူများ"],
  "sales-history": ["Sales history", "အရောင်းမှတ်တမ်း"], accounting: ["Expenses & cashbook", "အသုံးစရိတ်နှင့် ငွေစာရင်း"],
  reports: ["Reports", "အစီရင်ခံစာများ"], profile: ["Account", "အကောင့်"], notifications: ["Updates", "အသိပေးချက်များ"],
};

export function WorkspaceTools({ items, role, navigate, close }: {
  items: readonly NavigationItem[]; role: OperationsRole; navigate(path: NavigationItem["path"]): void; close(): void;
}) {
  const t = useOperationsText();
  const titles = { operations: t("Daily operations", "နေ့စဉ်လုပ်ငန်းများ"), management: t("Restaurant tools", "ဆိုင်စီမံရေး ကိရိယာများ"),
    finance: t("Finance", "ဘဏ္ဍာရေး"), account: t("Account & access", "အကောင့်နှင့် ဝင်ရောက်ခွင့်") };
  return <Page title={t(role === "STAFF" ? "Staff tools" : role === "MANAGER" ? "Manager tools" : "More tools", "လုပ်ငန်းကိရိယာများ")}
    subtitle={t("Your permitted workspace", "သင့်အတွက် ခွင့်ပြုထားသော လုပ်ငန်းခွင်")}>
    {workspaceNavigation(items, role).groups.map(group => <Card key={group.id} title={titles[group.id]}>
      {group.items.map(item => <Action key={item.id} secondary title={t(...labels[item.id])} onPress={() => navigate(item.path)} />)}
    </Card>)}
    {role === "MANAGER" ? <Body tone="muted">{t("Runtime colors are in Restaurant. Logo upload, Featured selection and Team remain Owner-only.",
      "အက်ပ်အရောင်ကို ဆိုင်စီမံရေးတွင် ပြင်နိုင်သည်။ အမှတ်တံဆိပ်၊ အထူးရွေးချယ်မှုနှင့် ဝန်ထမ်းစီမံရေးသည် ပိုင်ရှင်အတွက်သာ ဖြစ်သည်။")}</Body> : null}
    <Action title={t("Back to workspace", "လုပ်ငန်းခွင်သို့ ပြန်သွားရန်")} onPress={close} />
  </Page>;
}
