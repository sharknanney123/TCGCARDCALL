export const usd = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
};

export const pct = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
};

export const qty = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 });

export const gainClass = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return v > 0 ? "text-jade" : v < 0 ? "text-ember" : "text-faded";
};
