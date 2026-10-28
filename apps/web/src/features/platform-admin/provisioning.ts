import type { PlatformRestaurantProvisionRequest } from "@/features/platform-admin/api";

export type ProvisionForm = {
  ownerEmail: string;
  ownerFullName: string;
  name: string;
  slug: string;
  phone: string;
  description: string;
  address: string;
  houseNo: string;
  street: string;
  ward: string;
  township: string;
  city: string;
  currency: string;
  timezone: string;
};

export type ProvisionField = keyof ProvisionForm;
export type ProvisionErrors = Partial<Record<ProvisionField, string>>;

export const emptyProvisionForm: ProvisionForm = {
  ownerEmail: "",
  ownerFullName: "",
  name: "",
  slug: "",
  phone: "",
  description: "",
  address: "",
  houseNo: "",
  street: "",
  ward: "",
  township: "",
  city: "",
  currency: "MMK",
  timezone: "Asia/Yangon",
};

export function slugify(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/[\s-]+/g, "-").slice(0, 100);
}

export function validateProvisionForm(form: ProvisionForm): ProvisionErrors {
  const errors: ProvisionErrors = {};
  const email = form.ownerEmail.trim();
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.ownerEmail = "Enter a valid owner email address.";
  }
  if (!form.name.trim()) errors.name = "Enter a restaurant name.";
  if (!form.slug.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) {
    errors.slug = "Use lowercase letters, numbers and single hyphens.";
  }
  if (!form.city.trim()) errors.city = "Enter a city.";
  if (!form.township.trim()) errors.township = "Enter a township.";
  if (!/^[A-Za-z]{3}$/.test(form.currency)) errors.currency = "Use a three-letter currency code.";
  return errors;
}

export function toProvisionRequest(form: ProvisionForm): PlatformRestaurantProvisionRequest {
  return {
    ownerEmail: form.ownerEmail.trim(),
    ownerFullName: form.ownerFullName.trim() || null,
    restaurant: {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      houseNo: form.houseNo.trim() || null,
      street: form.street.trim() || null,
      ward: form.ward.trim() || null,
      township: form.township.trim(),
      city: form.city.trim(),
      latitude: null,
      longitude: null,
      logoUrl: null,
      currency: form.currency,
      timezone: form.timezone,
    },
  };
}
