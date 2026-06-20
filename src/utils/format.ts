import * as Localization from "expo-localization";

/** Locale-aware money + number formatting. India uses the lakh/crore
 *  grouping (e.g. ₹1,23,456) via the en-IN Intl locale. */

export function getDeviceLocale(): string {
  const locales = Localization.getLocales();
  return locales[0]?.languageTag ?? "en-IN";
}

export function getDeviceCurrency(): string {
  const locales = Localization.getLocales();
  return locales[0]?.currencyCode ?? "INR";
}

export function formatCurrency(
  amount: number | null | undefined,
  currency: string,
  locale?: string
): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  const resolvedLocale = locale ?? localeForCurrency(currency);
  try {
    return new Intl.NumberFormat(resolvedLocale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Fallback if Intl currency data is unavailable on the device runtime.
    return `${currency} ${Math.round(amount).toLocaleString(resolvedLocale)}`;
  }
}

/** Render a low–high band, collapsing to a single value when they match. */
export function formatRange(
  low: number | null,
  high: number | null,
  currency: string,
  locale?: string
): string {
  if (low == null && high == null) return "—";
  if (low != null && high != null && low !== high) {
    return `${formatCurrency(low, currency, locale)} – ${formatCurrency(high, currency, locale)}`;
  }
  return formatCurrency(low ?? high, currency, locale);
}

function localeForCurrency(currency: string): string {
  switch (currency) {
    case "INR":
      return "en-IN";
    case "USD":
      return "en-US";
    case "EUR":
      return "de-DE";
    case "GBP":
      return "en-GB";
    default:
      return "en-US";
  }
}

