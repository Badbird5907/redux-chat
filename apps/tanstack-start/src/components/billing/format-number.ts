const numberFormatter = new Intl.NumberFormat("en-US");

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}
