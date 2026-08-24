/**
 * 订单税额计算：纯函数（便于单元测试；Worker executor 也应调用同一逻辑）
 */
export type CalcOrderTaxInput = {
  amount: number;
  taxRate: number;
};

export type CalcOrderTaxOutput = {
  originalAmount: number;
  tax: number;
  totalAfterTax: number;
};

export function calcOrderTax(input: CalcOrderTaxInput): CalcOrderTaxOutput {
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
