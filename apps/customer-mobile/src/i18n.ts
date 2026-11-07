import { useCallback } from "react";
import { useCustomerAccount } from "./features/profile/AccountProvider";
import type { QueryState } from "./hooks/useApiQuery";

export type CustomerLanguage = "en" | "my-MM";

export function customerLanguage(preference?: string | null): CustomerLanguage {
  return preference?.toLowerCase().split("-")[0] === "my" ? "my-MM" : "en";
}

export function useCustomerLanguage(): CustomerLanguage {
  const { state } = useCustomerAccount();
  return customerLanguage(state.status === "ready" ? state.data.profile.preferredLanguage : undefined);
}

export function localize(language: CustomerLanguage, english: string, burmese: string): string {
  return language === "my-MM" ? burmese : english;
}

type CustomerText = (english: string, burmese: string) => string;

export function useCustomerText(): CustomerText {
  const language = useCustomerLanguage();
  return useCallback((english, burmese) => localize(language, english, burmese), [language]);
}

export function queryStateLabel(status: Exclude<QueryState<unknown>["status"], "ready">, t: CustomerText): string {
  switch (status) {
    case "loading": return t("Loading", "ရယူနေသည်");
    case "offline": return t("You are offline", "အင်တာနက်ချိတ်ဆက်မှု မရှိပါ");
    case "denied": return t("Please sign in again", "အကောင့်သို့ ပြန်ဝင်ပါ");
    case "error": return t("Unable to load", "အချက်အလက် ရယူ၍မရပါ");
  }
}
