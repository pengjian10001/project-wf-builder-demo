/**
 * 第 3 章完整可运行示例：自定义 orderPay 节点 + 插件 + Store 编程 API
 * App.tsx → export { default } from './examples/Ch3CustomNodePluginDemo';
 * npm run dev
 */
import {
  WorkflowBuilder,
  sharedProperties,
  getScope,
  getStoreNodes,
  setStoreNodes,
  getStoreDataForIntegration,
  registerComponentDecorator,
  registerFunctionDecorator,
  useWorkflowBuilderActions,
  type PaletteItem,
  type NodeSchema,
  type UISchema,
  type WorkflowBuilderPlugin,
} from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';

import { demoPaletteItems } from '../palette';

const orderPaySchema = {
  type: 'object',
  properties: {
    ...sharedProperties,
    payChannel: {
      type: 'string',
      options: [
        { label: '支付宝', value: 'alipay' },
        { label: '微信支付', value: 'wechat' },
      ],
    },
    amount: { type: 'number', minimum: 0.01 },
    remark: { type: 'string' },
  },
  required: ['payChannel', 'amount'],
} satisfies NodeSchema;

type OrderPaySchema = typeof orderPaySchema;
const scope = getScope<OrderPaySchema>;

const orderPayUiSchema: UISchema = {
  type: 'VerticalLayout',
  elements: [
    { type: 'Text', scope: scope('properties.label'), label: '名称' },
    {
      type: 'Select',
      scope: scope('properties.payChannel'),
      label: '支付渠道',
    },
    { type: 'Text', scope: scope('properties.amount'), label: '支付金额' },
    {
      type: 'VariableText',
      scope: scope('properties.remark'),
      label: '备注',
      placeholder: '支持 {{ 变量插值',
    },
  ],
};

const orderPayNode: PaletteItem<OrderPaySchema> = {
  type: 'orderPay',
  label: '订单支付',
  description: '自定义节点：渠道 / 金额 / 备注',
  icon: 'CreditCard',
  defaultPropertiesData: {
    label: '订单支付',
    description: '',
    payChannel: 'alipay',
    amount: 0.01,
    remark: '',
  },
  schema: orderPaySchema,
  uischema: orderPayUiSchema,
};

const metaAndUiPlugin: WorkflowBuilderPlugin = () => {
  registerFunctionDecorator('trackFutureChange', {
    place: 'after',
    name: 'ch3-meta-audit',
    callback: () => {
      // 观察画布变更；写 meta 放在 onDataSave
    },
  });

  registerComponentDecorator('OptionalAppBarControls', {
    name: 'ch3-business-meta-btn',
    place: 'after',
    content: () => (
      <button type="button" onClick={() => alert('自定义业务元数据面板入口')}>
        业务元数据
      </button>
    ),
  });
};

function ToolBar() {
  const actions = useWorkflowBuilderActions();

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 120,
        zIndex: 99,
        display: 'flex',
        gap: 8,
      }}
    >
      <button
        type="button"
        onClick={() => {
          setStoreNodes([
            ...getStoreNodes(),
            {
              id: `n-${crypto.randomUUID()}`,
              type: 'node',
              position: { x: 200, y: 200 },
              data: {
                type: 'orderPay',
                icon: 'CreditCard',
                properties: {
                  label: '订单支付',
                  description: '',
                  payChannel: 'wechat',
                  amount: 199,
                  remark: '',
                },
              },
            },
          ]);
        }}
      >
        新增支付节点
      </button>
      <button type="button" onClick={() => console.log(getStoreDataForIntegration())}>
        打印 Graph
      </button>
      <button type="button" onClick={() => actions.save()}>
        保存
      </button>
    </div>
  );
}

export default function Ch3CustomNodePluginDemo() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="ch3-custom-node-plugin"
        layoutDirection="DOWN"
        nodeTypes={[...demoPaletteItems, orderPayNode]}
        plugins={[metaAndUiPlugin]}
        integration={{
          strategy: 'props',
          onDataSave: async (g) => {
            const payload = {
              ...g,
              meta: { version: '1.0.0', updatedAt: new Date().toISOString() },
            };
            console.log('=== Ch3 保存（含业务 meta）===');
            console.log(payload);
            return 'success';
          },
        }}
      >
        <WorkflowBuilder.DefaultLayout />
        <ToolBar />
      </WorkflowBuilder.Root>
    </div>
  );
}
