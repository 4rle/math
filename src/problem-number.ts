export type ProblemNumber = number | string;
export function canonicalNumber(value: unknown): ProblemNumber | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).normalize("NFKC").trim().toUpperCase();
  if (
    /^\d+$/.test(text) &&
    Number.isSafeInteger(Number(text)) &&
    Number(text) > 0
  )
    return Number(text);
  const match = text.match(/^([BC][1-9]\d*)\.(\d+)$/);
  if (match && Number.isSafeInteger(Number(match[2])) && Number(match[2]) > 0)
    return `${match[1]}.${Number(match[2])}`;
  return null;
}
const order = new Intl.Collator("en", { numeric: true });
export const compareNumbers = (a: ProblemNumber, b: ProblemNumber) => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a !== typeof b) return typeof a === "number" ? -1 : 1;
  return order.compare(String(a), String(b));
};
const prefix = (number: ProblemNumber) =>
  typeof number === "number" ? "" : number.split(".")[0];
export function parseRanges(text: string): [ProblemNumber, ProblemNumber][] {
  if (!text.trim()) return [];
  return text
    .normalize("NFKC")
    .trim()
    .split(/[,、\s]+/)
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^([^-–〜~]+)(?:[-–〜~]([^-–〜~]+))?$/);
      const a = match ? canonicalNumber(match[1]) : null;
      const b = match ? canonicalNumber(match[2] || match[1]) : null;
      if (a === null || b === null || prefix(a) !== prefix(b))
        throw new Error(
          `範囲「${part}」を確認してください。例：125-140, B1.1-B1.10, C1.79`,
        );
      if (compareNumbers(a, b) > 0)
        throw new Error("番号範囲は小さい番号から指定してください。");
      return [a, b];
    });
}
export const inNumberRange = (
  number: ProblemNumber,
  [a, b]: [ProblemNumber, ProblemNumber],
) =>
  prefix(number) === prefix(a) &&
  compareNumbers(a, number) <= 0 &&
  compareNumbers(number, b) <= 0;
