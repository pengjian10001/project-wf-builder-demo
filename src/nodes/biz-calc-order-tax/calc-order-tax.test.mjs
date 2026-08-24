/**
 * 纯 JS 单测（避免 TS 扩展名解析问题）
 * npm run test:nodes
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calcOrderTax } from './calc-order-tax.mjs';

describe('biz:calcOrderTax', () => {
  it('正常计算', () => {
    const out = calcOrderTax({ amount: 1000, taxRate: 0.06 });
    assert.equal(out.tax, 60);
    assert.equal(out.totalAfterTax, 1060);
  });

  it('金额非法抛错', () => {
    assert.throws(() => calcOrderTax({ amount: -100, taxRate: 0.06 }), /金额非法/);
  });

  it('税率非法抛错', () => {
    assert.throws(() => calcOrderTax({ amount: 100, taxRate: 1.5 }), /税率非法/);
  });
});
