export interface PasswordPolicy { minimumLength: number; requirements: string }

/** Keep the existing eight-character floor; the server remains authoritative. */
export function customerPasswordPolicy(): PasswordPolicy {
  const configured = Number(process.env.EXPO_PUBLIC_CUSTOMER_PASSWORD_MIN_LENGTH ?? 8);
  const requirements = process.env.EXPO_PUBLIC_CUSTOMER_PASSWORD_REQUIREMENTS ?? "";
  if (!Number.isInteger(configured) || configured < 8 || configured > 128 ||
    !["", "letters_digits", "lower_upper_letters_digits", "lower_upper_letters_digits_symbols"].includes(requirements)) {
    throw new Error("Invalid customer password policy configuration");
  }
  return { minimumLength: configured, requirements };
}

export function normalizeEmail(email: string): string {
  // Do not strip aliases, dots or otherwise rewrite the customer's mailbox.
  return email.trim().toLowerCase();
}
export function validEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}
export function validPassword(password: string, policy: PasswordPolicy): boolean {
  // Supabase counts Unicode code points, rather than UTF-16 code units.
  if (Array.from(password).length < policy.minimumLength) return false;
  if (policy.requirements && (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password))) return false;
  if (policy.requirements.startsWith("lower_upper") && (!/[a-z]/.test(password) || !/[A-Z]/.test(password))) return false;
  const symbols = "!@#$%^&*()_+-=[]{};':\"\\|<>?,./`~";
  return policy.requirements !== "lower_upper_letters_digits_symbols" || Array.from(password).some(character => symbols.includes(character));
}
export function passwordRequirement(policy: PasswordPolicy): [string, string] {
  const suffix = policy.requirements === "letters_digits" ? " Include letters and numbers."
    : policy.requirements === "lower_upper_letters_digits" ? " Include uppercase and lowercase letters and numbers."
    : policy.requirements === "lower_upper_letters_digits_symbols" ? " Include uppercase and lowercase letters, numbers and symbols." : "";
  const burmese = policy.requirements === "letters_digits" ? " အက္ခရာနှင့် ဂဏန်းများ ပါဝင်ရမည်။"
    : policy.requirements === "lower_upper_letters_digits" ? " အင်္ဂလိပ်အက္ခရာ အကြီး၊ အသေးနှင့် ဂဏန်းများ ပါဝင်ရမည်။"
    : policy.requirements === "lower_upper_letters_digits_symbols" ? " အင်္ဂလိပ်အက္ခရာ အကြီး၊ အသေး၊ ဂဏန်းနှင့် သင်္ကေတများ ပါဝင်ရမည်။" : "";
  return [`Use at least ${policy.minimumLength} characters.${suffix}`, `အနည်းဆုံး စာလုံး ${policy.minimumLength} လုံး သုံးပါ။${burmese}`];
}
