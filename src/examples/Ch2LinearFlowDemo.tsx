/**
 * 第 2 章完整可运行示例：预置线性流程 trigger → action → delay → notification
 * App.tsx → export { default } from './examples/Ch2LinearFlowDemo';
 * npm run dev
 */
import {
  WorkflowBuilder,
  useWorkflowBuilderActions,
  type WorkflowBuilderNode,
  type WorkflowBuilderEdge,
} from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';

import { demoPaletteItems } from '../palette';

/** 与文档 2.5 节 Graph 形状一致的可加载初始图 */
const initialNodes: WorkflowBuilderNode[] = [
  {
    id: 'n1',
    type: 'node',
    position: { x: 200, y: 20 },
    data: {
      type: 'trigger',
      icon: 'Lightning',
      properties: {
        label: '订单触发',
        description: '',
        type: 'eventBasedTrigger',
        status: 'active',
        eventType: 'order.created',
      },
    },
  },
  {
    id: 'n2',
    type: 'node',
    position: { x: 200, y: 160 },
    data: {
      type: 'action',
      icon: 'PlayCircle',
      properties: {
        label: '创建订单 API',
        description: '',
        type: 'makeApiCall',
        status: 'active',
        makeAPICall: {
          apiUrl: 'https://api.demo.com/order',
          httpMethod: 'post',
          headers: '',
          body: '{"orderId":"{{order.id}}"}',
          responseFormat: 'json',
          storeResponse: 'orderUpdateResponse',
          retryOnFailure: false,
        },
      },
    },
  },
  {
    id: 'n3',
    type: 'node',
    position: { x: 200, y: 320 },
    data: {
      type: 'delay',
      icon: 'Timer',
      properties: {
        label: '等待 5 分钟',
        description: '',
        type: 'fixedDelay',
        status: 'active',
        duration: {
          timeUnits: 'minutes',
          delayAmount: 5,
          maxWaitTime: '24',
          expression: '',
        },
      },
    },
  },
  {
    id: 'n4',
    type: 'node',
    position: { x: 200, y: 480 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '完成通知',
        description: '',
        type: 'webhook',
        status: 'active',
      },
    },
  },
];

const initialEdges: WorkflowBuilderEdge[] = [
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n2', target: 'n3' },
  { id: 'e3', source: 'n3', target: 'n4' },
];

function Toolbar() {
  const { save } = useWorkflowBuilderActions();
  return (
    <div style={{ position: 'absolute', top: 8, left: 120, zIndex: 99 }}>
      <button type="button" onClick={() => save()}>
        保存线性流程 Graph
      </button>
    </div>
  );
}

export default function Ch2LinearFlowDemo() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="ch2-linear-flow"
        layoutDirection="DOWN"
        nodeTypes={demoPaletteItems}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        integration={{
          strategy: 'props',
          onDataSave: async (graph) => {
            console.log('=== Ch2 线性流程 Graph ===');
            console.log(JSON.stringify(graph, null, 2));
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
