import { sharedProperties, statusOptions } from '@workflowbuilder/sdk';
import type { NodeSchema } from '@workflowbuilder/sdk';

/** 支付渠道下拉选项（schema.options → 属性面板 Select） */
export const payChannelOptions = {
  alipay: { label: '支付宝', value: 'alipay' },
  wechat: { label: '微信支付', value: 'wechat' },
} as const;

/**
 * 订单支付节点 —— 属性 JSON Schema
 * 校验由 SDK/JsonForms 根据本 schema 自动执行（无原稿那种 validate 函数）
 */
export const schema = {
  type: 'object',
  required: ['label', 'payChannel', 'amount'],
  properties: {
    ...sharedProperties,
    status: {
      type: 'string',
      options: Object.values(statusOptions),
    },
    payChannel: {
      type: 'string',
      options: Object.values(payChannelOptions),
    },
    amount: {
      type: 'number',
      minimum: 0.01,
    },
    remark: {
      type: 'string',
    },
  },
} satisfies NodeSchema;

export type OrderPayNodeSchema = typeof schema;
