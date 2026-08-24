/**
 * 第 9 章：售后审批退款流程（编辑器可运行综合案例）
 * App.tsx → export { default } from './examples/Ch9AfterSaleDemo';
 */
import {
  WorkflowBuilder,
  sharedProperties,
  errorPolicyProperty,
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

const signalWaitSchema = {
  type: 'object',
  properties: {
    ...sharedProperties,
    eventKey: { type: 'string' },
    timeout: { type: 'string' },
    timeoutMode: {
      type: 'string',
      options: [
        { label: 'fail', value: 'fail' },
        { label: 'continue', value: 'continue' },
        { label: 'throw', value: 'throw' },
      ],
    },
    timeoutAlias: { type: 'string' },
    eventPayloadAlias: { type: 'string' },
  },
  required: ['eventKey'],
} satisfies NodeSchema;

type SW = typeof signalWaitSchema;
const sw = getScope<SW>;

const signalWaitNode: PaletteItem<SW> = {
  type: 'signalWait',
  label: '等待外部信号',
  description: '售后人工审批等待',
  icon: 'HandPalm',
  defaultPropertiesData: {
    label: '等待审批',
    description: '',
    eventKey: 'after_sale_audit',
    timeout: '24h',
    timeoutMode: 'continue',
    timeoutAlias: 'auditTimeout',
    eventPayloadAlias: 'auditPayload',
  },
  schema: signalWaitSchema,
  uischema: {
    type: 'VerticalLayout',
    elements: [
      { type: 'Text', scope: sw('properties.eventKey'), label: 'eventKey' },
      { type: 'Text', scope: sw('properties.timeout'), label: 'timeout' },
      { type: 'Select', scope: sw('properties.timeoutMode'), label: 'timeoutMode' },
    ],
  } satisfies UISchema,
};

/** 退款 HTTP：带 errorPolicy，供 Worker 映射 Activity 重试 */
const refundSchema = {
  type: 'object',
  properties: {
    ...sharedProperties,
    ...errorPolicyProperty,
    url: { type: 'string' },
    method: {
      type: 'string',
      options: [
        { label: 'POST', value: 'POST' },
        { label: 'GET', value: 'GET' },
      ],
    },
    bodyHint: { type: 'string' },
  },
  required: ['url'],
} satisfies NodeSchema;

type RF = typeof refundSchema;
const rf = getScope<RF>;

const refundHttpNode: PaletteItem<RF> = {
  type: 'biz:refundHttp',
  label: '退款 HTTP',
  description: '调用退款接口；失败用 errorPolicy 吸收',
  icon: 'CurrencyCircleDollar',
  defaultPropertiesData: {
    label: '调用退款',
    description: '',
    errorPolicy: 'continue',
    url: 'https://api.example.com/refund',
    method: 'POST',
    bodyHint: 'afterSaleNo / amount / userId 由 Worker 从上下文组装',
  },
  schema: refundSchema,
  uischema: {
    type: 'VerticalLayout',
    elements: [
      { type: 'Select', scope: rf('properties.errorPolicy'), label: '错误策略' },
      { type: 'Text', scope: rf('properties.url'), label: 'URL' },
      { type: 'Select', scope: rf('properties.method'), label: 'Method' },
    ],
  } satisfies UISchema,
};

const hHigh = getHandleId({ handleType: 'source', innerId: 'amt-high' });
const hLow = getHandleId({ handleType: 'source', innerId: 'amt-low' });
const hPass = getHandleId({ handleType: 'source', innerId: 'audit-pass' });
const hReject = getHandleId({ handleType: 'source', innerId: 'audit-reject' });
const hTimeout = getHandleId({ handleType: 'source', innerId: 'audit-timeout' });
const hRefundOk = getHandleId({ handleType: 'source', innerId: 'refund-ok' });
const hRefundSkip = getHandleId({ handleType: 'source', innerId: 'refund-skip' });

/**
 * 售后流程（扁平 Graph）：
 * trigger → decision(金额>1000?) 
 *   → high: signalWait → decision(超时/通过/驳回) → …
 *   → low: 自动通过标记 notification
 * → decision(是否退款) → refundHttp / skip → final notification
 */
const initialNodes: WorkflowBuilderNode[] = [
  {
    id: 'n-trigger',
    type: 'node',
    position: { x: 300, y: 0 },
    data: {
      type: 'trigger',
      icon: 'Lightning',
      properties: {
        label: '接收售后申请',
        description: 'input: afterSaleNo / orderAmount / userId',
        type: 'eventBasedTrigger',
        status: 'active',
        eventType: 'afterSale.submitted',
      },
    },
  },
  {
    id: 'n-amount',
    type: 'decision-node',
    position: { x: 280, y: 120 },
    data: {
      type: 'decision',
      icon: 'ArrowsSplit',
      properties: {
        label: '金额判断',
        description: '>1000 人工审批，否则自动通过',
        status: 'active',
        decisionBranches: [
          { id: 'br-high', sourceHandle: hHigh, label: '>1000 人工', conditions: [] },
          { id: 'br-low', sourceHandle: hLow, label: '≤1000 自动', conditions: [] },
        ],
      },
    },
  },
  {
    id: 'n-wait',
    type: 'node',
    position: { x: 80, y: 280 },
    data: {
      type: 'signalWait',
      icon: 'HandPalm',
      properties: {
        label: '人工审批等待',
        description: '',
        eventKey: 'after_sale_audit',
        timeout: '24h',
        timeoutMode: 'continue',
        timeoutAlias: 'auditTimeout',
        eventPayloadAlias: 'auditPayload',
      },
    },
  },
  {
    id: 'n-audit',
    type: 'decision-node',
    position: { x: 60, y: 420 },
    data: {
      type: 'decision',
      icon: 'ArrowsSplit',
      properties: {
        label: '审批结果',
        description: '',
        status: 'active',
        decisionBranches: [
          { id: 'br-to', sourceHandle: hTimeout, label: '超时', conditions: [] },
          { id: 'br-ok', sourceHandle: hPass, label: '通过', conditions: [] },
          { id: 'br-no', sourceHandle: hReject, label: '驳回', conditions: [] },
        ],
      },
    },
  },
  {
    id: 'n-auto',
    type: 'node',
    position: { x: 480, y: 280 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '自动通过',
        description: '金额≤1000',
        type: 'webhook',
        status: 'active',
      },
    },
  },
  {
    id: 'n-refund-gate',
    type: 'decision-node',
    position: { x: 280, y: 580 },
    data: {
      type: 'decision',
      icon: 'ArrowsSplit',
      properties: {
        label: '是否退款',
        description: '审批通过才调退款',
        status: 'active',
        decisionBranches: [
          { id: 'br-rf', sourceHandle: hRefundOk, label: '退款', conditions: [] },
          { id: 'br-sk', sourceHandle: hRefundSkip, label: '跳过', conditions: [] },
        ],
      },
    },
  },
  {
    id: 'n-refund',
    type: 'node',
    position: { x: 160, y: 720 },
    data: {
      type: 'biz:refundHttp',
      icon: 'CurrencyCircleDollar',
      properties: {
        label: '调用退款接口',
        description: '',
        errorPolicy: 'continue',
        url: 'https://api.example.com/refund',
        method: 'POST',
        bodyHint: 'afterSaleNo, amount, userId',
      },
    },
  },
  {
    id: 'n-final',
    type: 'node',
    position: { x: 300, y: 860 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '售后结束',
        description: '输出 status / refundResult（由 Worker 写回）',
        type: 'webhook',
        status: 'active',
      },
    },
  },
];

const initialEdges: WorkflowBuilderEdge[] = [
  { id: 'e0', source: 'n-trigger', target: 'n-amount' },
  { id: 'e-high', source: 'n-amount', target: 'n-wait', sourceHandle: hHigh },
  { id: 'e-low', source: 'n-amount', target: 'n-auto', sourceHandle: hLow },
  { id: 'e-w', source: 'n-wait', target: 'n-audit' },
  { id: 'e-to', source: 'n-audit', target: 'n-refund-gate', sourceHandle: hTimeout },
  { id: 'e-ok', source: 'n-audit', target: 'n-refund-gate', sourceHandle: hPass },
  { id: 'e-no', source: 'n-audit', target: 'n-refund-gate', sourceHandle: hReject },
  { id: 'e-auto', source: 'n-auto', target: 'n-refund-gate' },
  { id: 'e-rf', source: 'n-refund-gate', target: 'n-refund', sourceHandle: hRefundOk },
  { id: 'e-sk', source: 'n-refund-gate', target: 'n-final', sourceHandle: hRefundSkip },
  { id: 'e-done', source: 'n-refund', target: 'n-final' },
];

function Toolbar() {
  const { save } = useWorkflowBuilderActions();
  return (
    <div style={{ position: 'absolute', top: 8, left: 120, zIndex: 99, display: 'flex', gap: 8 }}>
      <button type="button" onClick={() => save()}>
        保存售后 Graph
      </button>
    </div>
  );
}

export default function Ch9AfterSaleDemo() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="after_sale_workflow"
        layoutDirection="DOWN"
        nodeTypes={[...demoPaletteItems, signalWaitNode, refundHttpNode]}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        integration={{
          strategy: 'props',
          onDataSave: async (graph) => {
            console.log('=== 售后审批 Graph（可交 Temporal / 参考后端）===');
            console.log(JSON.stringify(graph, null, 2));
            console.log(`
【执行侧】start 输入示例：
{ afterSaleNo: "AS20260820001", orderAmount: 1500, userId: "U10086" }

【审批 Signal】
handle.signal("after_sale_audit", { pass: true, comment: "同意退款" });
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
