/**
 * 第 4 章完整可运行示例：预加载 Graph + 序列化 + 事件监听 + 只读 / 布局方向
 * App.tsx → export { default } from './examples/Ch4GraphEventsDemo';
 * npm run dev
 */
import { useEffect } from 'react';
import {
  WorkflowBuilder,
  getStoreDataForIntegration,
  useNodeChangedListener,
  useSingleSelectedElement,
  useWorkflowBuilderActions,
  useFitView,
  type WorkflowBuilderNode,
  type WorkflowBuilderEdge,
  type WorkflowBuilderReactFlowProps,
} from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';

import { demoPaletteItems } from '../palette';

const preDefinedNodes: WorkflowBuilderNode[] = [
  {
    id: 'n-01',
    type: 'node',
    position: { x: 220, y: 30 },
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
    id: 'n-02',
    type: 'node',
    position: { x: 220, y: 180 },
    data: {
      type: 'action',
      icon: 'PlayCircle',
      properties: {
        label: '创建订单',
        description: '',
        type: 'makeApiCall',
        status: 'active',
        makeAPICall: {
          apiUrl: 'https://api.example.com/order/create',
          httpMethod: 'post',
          headers: '',
          body: '{"orderId":"{{order.id}}","amount":1}',
          responseFormat: 'json',
          storeResponse: 'orderUpdateResponse',
          retryOnFailure: false,
        },
      },
    },
  },
  {
    id: 'n-03',
    type: 'node',
    position: { x: 220, y: 340 },
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

const preDefinedEdges: WorkflowBuilderEdge[] = [
  { id: 'e-01', source: 'n-01', target: 'n-02' },
  { id: 'e-02', source: 'n-02', target: 'n-03' },
];

const reactFlowProps = {
  minZoom: 0.2,
  maxZoom: 1.8,
  snapToGrid: true,
  snapGrid: [20, 20],
  zoomOnDoubleClick: false,
  onMoveEnd: (_evt, viewport) => {
    console.log('[Ch4] 视口变化', viewport);
  },
} satisfies WorkflowBuilderReactFlowProps;

function EventProbeAndToolbar() {
  const selected = useSingleSelectedElement();
  const { save, setReadOnly, setLayoutDirection, toggleLayoutDirection } =
    useWorkflowBuilderActions();
  const fitView = useFitView();

  useNodeChangedListener((changes) => {
    // 高频：仅打日志演示；生产需防抖后再持久化
    if (changes.length > 0) {
      console.log('[Ch4] node changes', changes.length, changes[0]?.type);
    }
  });

  useEffect(() => {
    if (selected?.node) {
      console.log('[Ch4] 单选节点', selected.node.id, selected.node.data.type);
    } else if (selected?.edge) {
      console.log('[Ch4] 单选边', selected.edge.id);
    }
  }, [selected]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 120,
        zIndex: 99,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        maxWidth: '70%',
      }}
    >
      <button type="button" onClick={() => save()}>
        保存
      </button>
      <button
        type="button"
        onClick={() => console.log(JSON.stringify(getStoreDataForIntegration(), null, 2))}
      >
        序列化导出
      </button>
      <button type="button" onClick={() => setReadOnly(true)}>
        只读
      </button>
      <button type="button" onClick={() => setReadOnly(false)}>
        编辑
      </button>
      <button type="button" onClick={() => setLayoutDirection('DOWN')}>
        方向 DOWN
      </button>
      <button type="button" onClick={() => setLayoutDirection('RIGHT')}>
        方向 RIGHT
      </button>
      <button
        type="button"
        onClick={() => toggleLayoutDirection({ flipPositions: true, fitView: true })}
      >
        切换方向并翻转
      </button>
      <button type="button" onClick={() => fitView()}>
        适应画布
      </button>
    </div>
  );
}

export default function Ch4GraphEventsDemo() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="ch4-graph-events"
        layoutDirection="DOWN"
        nodeTypes={demoPaletteItems}
        initialNodes={preDefinedNodes}
        initialEdges={preDefinedEdges}
        reactFlowProps={reactFlowProps}
        integration={{
          strategy: 'props',
          onDataSave: async (graph) => {
            console.log('=== Ch4 onDataSave ===');
            console.log(JSON.stringify(graph, null, 2));
            return 'success';
          },
        }}
      >
        <WorkflowBuilder.DefaultLayout />
        <EventProbeAndToolbar />
      </WorkflowBuilder.Root>
    </div>
  );
}
