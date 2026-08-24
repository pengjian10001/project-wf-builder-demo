/**
 * 第 7 章完整可运行示例：Delay 内部等待 + SignalWait（外部信号）节点配置
 * 用法：App.tsx → export { default } from './examples/Ch7AsyncWaitDemo';
 * npm run dev
 *
 * 说明：浏览器只负责编排与序列化 Graph；真正的 sleep / signal / 超时在 Temporal Worker 执行。
 */
import {
  WorkflowBuilder,
  sharedProperties,
  getScope,
  getHandleId,
  useWorkflowBuilderActions,
  type PaletteItem,
  type NodeSchema,
  type UISchema,
  type WorkflowBuilderNode,
  type WorkflowBuilderEdge,
} from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';

import { demoPaletteItems } from '../palette';

// —— 自定义「等待外部信号」节点（对应官方 signal-wait / approval-gate 产品形态）——
const signalWaitSchema = {
  type: 'object',
  properties: {
    ...sharedProperties,
    eventKey: {
      type: 'string',
      placeholder: 'approve_signal',
    },
    timeout: {
      type: 'string',
      placeholder: '24h / 30s / 10m',
    },
    timeoutMode: {
      type: 'string',
      options: [
        { label: '超时失败 fail', value: 'fail' },
        { label: '超时继续 continue', value: 'continue' },
        { label: '超时抛错 throw', value: 'throw' },
      ],
    },
    timeoutAlias: { type: 'string' },
    eventPayloadAlias: { type: 'string' },
  },
  required: ['eventKey'],
} satisfies NodeSchema;

type SignalWaitSchema = typeof signalWaitSchema;
const swScope = getScope<SignalWaitSchema>;

const signalWaitUiSchema: UISchema = {
  type: 'VerticalLayout',
  elements: [
    { type: 'Text', scope: swScope('properties.label'), label: '名称' },
    { type: 'Text', scope: swScope('properties.eventKey'), label: '事件 Key（Signal 名）' },
    { type: 'Text', scope: swScope('properties.timeout'), label: '超时（如 24h / 30s）' },
    { type: 'Select', scope: swScope('properties.timeoutMode'), label: '超时模式' },
    { type: 'Text', scope: swScope('properties.timeoutAlias'), label: '超时标记变量名' },
    { type: 'Text', scope: swScope('properties.eventPayloadAlias'), label: 'Payload 别名' },
  ],
};

const signalWaitNode: PaletteItem<SignalWaitSchema> = {
  type: 'signalWait',
  label: '等待外部信号',
  description: '挂起等待 Temporal Signal；配置由 Worker 解释',
  icon: 'HandPalm',
  defaultPropertiesData: {
    label: '等待审批',
    description: '',
    eventKey: 'approve_signal',
    timeout: '24h',
    timeoutMode: 'fail',
    timeoutAlias: 'isEventTimeout',
    eventPayloadAlias: 'approvePayload',
  },
  schema: signalWaitSchema,
  uischema: signalWaitUiSchema,
};

const handlePass = getHandleId({ handleType: 'source', innerId: 'audit-pass' });
const handleReject = getHandleId({ handleType: 'source', innerId: 'audit-reject' });
const handleTimeout = getHandleId({ handleType: 'source', innerId: 'audit-timeout' });

/**
 * 流程：
 * trigger → delay(内部休眠配置) → signalWait → decision(通过/驳回/超时) → notifications
 */
const initialNodes: WorkflowBuilderNode[] = [
  {
    id: 'n-trigger',
    type: 'node',
    position: { x: 260, y: 10 },
    data: {
      type: 'trigger',
      icon: 'Lightning',
      properties: {
        label: '提交申请',
        description: '',
        type: 'eventBasedTrigger',
        status: 'active',
        eventType: 'apply.submitted',
      },
    },
  },
  {
    id: 'n-delay',
    type: 'node',
    position: { x: 260, y: 130 },
    data: {
      type: 'delay',
      icon: 'Timer',
      properties: {
        label: '缓冲延时',
        description: '内部等待；Worker 映射为 Temporal sleep',
        type: 'fixedDelay',
        status: 'active',
        duration: {
          timeUnits: 'minutes',
          delayAmount: 1,
          maxWaitTime: '24',
          expression: '',
        },
      },
    },
  },
  {
    id: 'n-wait',
    type: 'node',
    position: { x: 260, y: 260 },
    data: {
      type: 'signalWait',
      icon: 'HandPalm',
      properties: {
        label: '等待人工审批',
        description: '',
        eventKey: 'approve_signal',
        timeout: '30s',
        timeoutMode: 'continue',
        timeoutAlias: 'auditTimeout',
        eventPayloadAlias: 'auditResult',
      },
    },
  },
  {
    id: 'n-branch',
    type: 'decision-node',
    position: { x: 240, y: 400 },
    data: {
      type: 'decision',
      icon: 'ArrowsSplit',
      properties: {
        label: '审批结果分支',
        description: '',
        status: 'active',
        decisionBranches: [
          {
            id: 'br-timeout',
            sourceHandle: handleTimeout,
            label: '超时',
            conditions: [],
          },
          {
            id: 'br-pass',
            sourceHandle: handlePass,
            label: '通过',
            conditions: [],
          },
          {
            id: 'br-reject',
            sourceHandle: handleReject,
            label: '驳回',
            conditions: [],
          },
        ],
      },
    },
  },
  {
    id: 'n-out-timeout',
    type: 'node',
    position: { x: 40, y: 560 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '审批超时',
        description: '',
        type: 'webhook',
        status: 'active',
      },
    },
  },
  {
    id: 'n-out-pass',
    type: 'node',
    position: { x: 260, y: 560 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '审批通过',
        description: '',
        type: 'webhook',
        status: 'active',
      },
    },
  },
  {
    id: 'n-out-reject',
    type: 'node',
    position: { x: 480, y: 560 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '审批驳回',
        description: '',
        type: 'webhook',
        status: 'active',
      },
    },
  },
];

const initialEdges: WorkflowBuilderEdge[] = [
  { id: 'e1', source: 'n-trigger', target: 'n-delay' },
  { id: 'e2', source: 'n-delay', target: 'n-wait' },
  { id: 'e3', source: 'n-wait', target: 'n-branch' },
  { id: 'e-t', source: 'n-branch', target: 'n-out-timeout', sourceHandle: handleTimeout },
  { id: 'e-p', source: 'n-branch', target: 'n-out-pass', sourceHandle: handlePass },
  { id: 'e-r', source: 'n-branch', target: 'n-out-reject', sourceHandle: handleReject },
];

function DemoToolbar() {
  const { save } = useWorkflowBuilderActions();
  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 120,
        zIndex: 99,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <button type="button" onClick={() => save()}>
        保存 Graph（交后端执行）
      </button>
      <span style={{ fontSize: 12, opacity: 0.75 }}>
        Signal 示例 payload 见控制台注释
      </span>
    </div>
  );
}

export default function Ch7AsyncWaitDemo() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="ch7-async-wait-demo"
        layoutDirection="DOWN"
        nodeTypes={[...demoPaletteItems, signalWaitNode]}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        integration={{
          strategy: 'props',
          onDataSave: async (graph) => {
            console.log('=== Ch7 Graph（含 delay + signalWait 配置）===');
            console.log(JSON.stringify(graph, null, 2));
            console.log(`
【后端 Temporal Signal 伪代码 — 在 Worker/API 侧执行，不是浏览器 SDK】
await handle.signal('approve_signal', { pass: true, comment: '审批通过' });
`);
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
