/**
 * 第 10 章：自定义节点 biz:calcOrderTax 完整可运行示例
 * App.tsx → export { default } from './examples/Ch10CustomNodeDemo';
 */
import {
  WorkflowBuilder,
  useWorkflowBuilderActions,
  type WorkflowBuilderNode,
  type WorkflowBuilderEdge,
} from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';

import { demoPaletteItems } from '../palette';
import { calcOrderTaxNode } from '../nodes/biz-calc-order-tax/calc-order-tax-node';
import { calcOrderTax } from '../nodes/biz-calc-order-tax/calc-order-tax';

const initialNodes: WorkflowBuilderNode[] = [
  {
    id: 'n-trigger',
    type: 'node',
    position: { x: 220, y: 20 },
    data: {
      type: 'trigger',
      icon: 'Lightning',
      properties: {
        label: '订单入参',
        description: '',
        type: 'eventBasedTrigger',
        status: 'active',
        eventType: 'order.created',
      },
    },
  },
  {
    id: 'calc_tax_node',
    type: 'node',
    position: { x: 220, y: 160 },
    data: {
      type: 'biz:calcOrderTax',
      icon: 'MathOperations',
      properties: {
        label: '计算税额',
        description: '',
        errorPolicy: 'continue',
        amount: 2000,
        taxRate: 0.06,
      },
    },
  },
  {
    id: 'n-log',
    type: 'node',
    position: { x: 220, y: 320 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '结果通知',
        description: 'Worker 执行后可读 nodes.calc_tax_node.output',
        type: 'webhook',
        status: 'active',
      },
    },
  },
];

const initialEdges: WorkflowBuilderEdge[] = [
  { id: 'e1', source: 'n-trigger', target: 'calc_tax_node' },
  { id: 'e2', source: 'calc_tax_node', target: 'n-log' },
];

function Toolbar() {
  const { save } = useWorkflowBuilderActions();
  return (
    <div style={{ position: 'absolute', top: 8, left: 120, zIndex: 99, display: 'flex', gap: 8 }}>
      <button type="button" onClick={() => save()}>
        保存 Graph
      </button>
      <button
        type="button"
        onClick={() => {
          // 浏览器侧预览纯函数（与 Worker executor 同源逻辑）
          try {
            const out = calcOrderTax({ amount: 2000, taxRate: 0.06 });
            console.log('本地预览 calcOrderTax(2000, 0.06) =>', out);
            alert(`税=${out.tax}, 税后=${out.totalAfterTax}`);
          } catch (e) {
            console.error(e);
          }
        }}
      >
        本地试算税额
      </button>
    </div>
  );
}

export default function Ch10CustomNodeDemo() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="use_custom_node_demo"
        layoutDirection="DOWN"
        nodeTypes={[...demoPaletteItems, calcOrderTaxNode]}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        integration={{
          strategy: 'props',
          onDataSave: async (graph) => {
            console.log('=== 自定义节点 Graph ===');
            console.log(JSON.stringify(graph, null, 2));
            console.log(`
【Worker 注册示意】
registry["biz:calcOrderTax"] = (node, ctx) =>
  calcOrderTax({ amount: node.config.amount, taxRate: node.config.taxRate });
`);
            return 'success';
          },
        }}
      >
        <WorkflowBuilder.DefaultLayout />
        <Toolbar />
      </WorkflowBuilder.Root>
    </div>
  );
}
