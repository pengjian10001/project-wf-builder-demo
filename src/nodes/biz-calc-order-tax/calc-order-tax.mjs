/** 与 calc-order-tax.ts 保持同步的 ESM 副本，供 node:test 使用 */
export function calcOrderTax(input) {
  const { amount, taxRate } = input;
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
    throw new Error(`金额非法 amount=${amount}`);
  }
  if (typeof taxRate !== 'number' || Number.isNaN(taxRate) || taxRate < 0 || taxRate > 1) {
    throw new Error(`税率非法 taxRate=${taxRate}`);
  }
  const tax = amount * taxRate;
  return {
    originalAmount: amount,
    tax,
    totalAfterTax: amount + tax,
  };
}
