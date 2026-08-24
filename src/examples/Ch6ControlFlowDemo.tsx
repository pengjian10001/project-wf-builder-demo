/**
 * 第 6 章完整可运行示例：Decision 多路分支 + 扇出并行汇合
 * 用法：在 src/App.tsx 中 `export { default } from './examples/Ch6ControlFlowDemo';`
 * 然后 npm run dev
 */
import {
  WorkflowBuilder,
  getHandleId,
  useWorkflowBuilderActions,
  type WorkflowBuilderNode,
  type WorkflowBuilderEdge,
} from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';

import { demoPaletteItems } from '../palette';

const handleGradeA = getHandleId({ handleType: 'source', innerId: 'grade-a' });
const handleGradeB = getHandleId({ handleType: 'source', innerId: 'grade-b' });
const handleGradeC = getHandleId({ handleType: 'source', innerId: 'grade-c' });

/**
 * 流程：
 * 1) trigger → decision（A/B/C 三路）→ 三路 notification
 * 2) 另：fork action 扇出两条 delay，再汇合到 join notification（并行 waitAll 形态）
 */
const initialNodes: WorkflowBuilderNode[] = [
  {
    id: 'n-trigger',
    type: 'node',
    position: { x: 280, y: 10 },
    data: {
      type: 'trigger',
      icon: 'Lightning',
      properties: {
        label: '成绩事件',
        description: '',
        type: 'eventBasedTrigger',
        status: 'active',
        eventType: 'score.submitted',
      },
    },
  },
  {
    id: 'n-decision',
    type: 'decision-node',
    position: { x: 260, y: 140 },
    data: {
      type: 'decision',
      icon: 'ArrowsSplit',
      properties: {
        label: '分数等级',
        description: '多路分支（Decision）',
        status: 'active',
        decisionBranches: [
          {
            id: 'br-a',
            sourceHandle: handleGradeA,
            label: 'A (≥90)',
            conditions: [
              {
                x: '90',
                comparisonOperator: 'greaterOrEqual',
                y: '90',
                logicalOperator: 'and',
              },
            ],
          },
          {
            id: 'br-b',
            sourceHandle: handleGradeB,
            label: 'B (60–89)',
            conditions: [
              {
                x: '60',
                comparisonOperator: 'greaterOrEqual',
                y: '60',
                logicalOperator: 'and',
              },
            ],
          },
          {
            id: 'br-c',
            sourceHandle: handleGradeC,
            label: 'C (<60)',
            conditions: [],
          },
        ],
      },
    },
  },
  {
    id: 'n-grade-a',
    type: 'node',
    position: { x: 40, y: 320 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '等级 A',
        description: '',
        type: 'webhook',
        status: 'active',
      },
    },
  },
  {
    id: 'n-grade-b',
    type: 'node',
    position: { x: 260, y: 320 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '等级 B',
        description: '',
        type: 'webhook',
        status: 'active',
      },
    },
  },
  {
    id: 'n-grade-c',
    type: 'node',
    position: { x: 480, y: 320 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '等级 C',
        description: '',
        type: 'webhook',
        status: 'active',
      },
    },
  },

  // —— 并行扇出 / 汇合（画布右侧）——
  {
    id: 'n-fork',
    type: 'node',
    position: { x: 720, y: 140 },
    data: {
      type: 'action',
      icon: 'PlayCircle',
      properties: {
        label: '并行起点',
        description: '一条出边扇出到两个 delay',
        type: 'makeApiCall',
        status: 'active',
        makeAPICall: {
          apiUrl: 'https://api.example.com/fork',
          httpMethod: 'get',
          headers: '',
          body: '',
          responseFormat: 'json',
          storeResponse: 'orderUpdateResponse',
          retryOnFailure: false,
        },
      },
    },
  },
  {
    id: 'n-branch-left',
    type: 'node',
    position: { x: 620, y: 300 },
    data: {
      type: 'delay',
      icon: 'Timer',
      properties: {
        label: '分支 L',
        description: '',
        type: 'fixedDelay',
        status: 'active',
        duration: {
          timeUnits: 'seconds',
          delayAmount: 1,
          maxWaitTime: '24',
          expression: '',
        },
      },
    },
  },
  {
    id: 'n-branch-right',
    type: 'node',
    position: { x: 820, y: 300 },
    data: {
      type: 'delay',
      icon: 'Timer',
      properties: {
        label: '分支 R',
        description: '',
        type: 'fixedDelay',
        status: 'active',
        duration: {
          timeUnits: 'seconds',
          delayAmount: 1,
          maxWaitTime: '24',
          expression: '',
        },
      },
    },
  },
  {
    id: 'n-join',
    type: 'node',
    position: { x: 720, y: 460 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '并行汇合',
        description: 'waitAll：两条入边都连到此节点',
        type: 'webhook',
        status: 'active',
      },
    },
  },
];

const initialEdges: WorkflowBuilderEdge[] = [
  { id: 'e-t-d', source: 'n-trigger', target: 'n-decision' },
  {
    id: 'e-a',
    source: 'n-decision',
    target: 'n-grade-a',
    sourceHandle: handleGradeA,
  },
  {
    id: 'e-b',
    source: 'n-decision',
    target: 'n-grade-b',
    sourceHandle: handleGradeB,
  },
  {
    id: 'e-c',
    source: 'n-decision',
    target: 'n-grade-c',
    sourceHandle: handleGradeC,
  },

  // 并行：fork → L/R → join
  { id: 'e-fork-l', source: 'n-fork', target: 'n-branch-left' },
  { id: 'e-fork-r', source: 'n-fork', target: 'n-branch-right' },
  { id: 'e-l-join', source: 'n-branch-left', target: 'n-join' },
  { id: 'e-r-join', source: 'n-branch-right', target: 'n-join' },
];

function DemoToolbar() {
  const { save } = useWorkflowBuilderActions();
  return (
    <div style={{ position: 'absolute', top: 8, left: 120, zIndex: 99 }}>
      <button type="button" onClick={() => save()}>
        保存控制流 Graph
      </button>
    </div>
  );
}

export default function Ch6ControlFlowDemo() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="ch6-control-flow-demo"
        layoutDirection="DOWN"
        nodeTypes={demoPaletteItems}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        integration={{
          strategy: 'props',
          onDataSave: async (graph) => {
            console.log('=== Ch6 控制流 Graph ===');
            console.log(JSON.stringify(graph, null, 2));
            return 'success';
          },
        }}
      >
        <WorkflowBuilder.DefaultLayout />
        <DemoToolbar />
      </WorkflowBuilder.Root>
    </div>
  );
}
