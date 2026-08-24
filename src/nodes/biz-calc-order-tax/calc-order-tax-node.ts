/**
 * PaletteItem：订单税额计算（第 10 章自定义节点）
 */
import {
  sharedProperties,
  errorPolicyProperty,
  getScope,
  type PaletteItem,
  type NodeSchema,
  type UISchema,
} from '@workflowbuilder/sdk';

export const calcOrderTaxSchema = {
  type: 'object',
  properties: {
    ...sharedProperties,
    ...errorPolicyProperty,
    /** 订单金额：面板可填数字；生产也可用 VariableText 绑 {{nodes…}} */
    amount: { type: 'number', minimum: 0 },
    /** 税率 0–1，如 0.06 = 6% */
    taxRate: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['amount', 'taxRate'],
} satisfies NodeSchema;

export type CalcOrderTaxSchema = typeof calcOrderTaxSchema;
const scope = getScope<CalcOrderTaxSchema>;

export const calcOrderTaxUiSchema: UISchema = {
  type: 'VerticalLayout',
  elements: [
    { type: 'Text', scope: scope('properties.label'), label: '名称' },
    {
      type: 'Select',
      scope: scope('properties.errorPolicy'),
      label: '错误策略',
    },
    { type: 'Text', scope: scope('properties.amount'), label: '订单金额' },
    { type: 'Text', scope: scope('properties.taxRate'), label: '税率 (0–1)' },
  ],
};

export const calcOrderTaxNode: PaletteItem<CalcOrderTaxSchema> = {
  type: 'biz:calcOrderTax',
  label: '订单税额计算',
  description: '根据订单金额与税率计算税额、税后总价',
  icon: 'MathOperations',
  defaultPropertiesData: {
    label: '订单税额计算',
    description: '',
    errorPolicy: 'fail',
    amount: 1000,
    taxRate: 0.06,
  },
  schema: calcOrderTaxSchema,
  uischema: calcOrderTaxUiSchema,
  outputSchema: {
    type: 'default',
    properties: {
      originalAmount: { type: 'number', label: '原金额', description: '' },
      tax: { type: 'number', label: '税额', description: '' },
      totalAfterTax: { type: 'number', label: '税后总价', description: '' },
    },
  },
};
