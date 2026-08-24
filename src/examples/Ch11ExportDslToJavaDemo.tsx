/**
 * 第 11 章：导出给 Java Temporal 桥接层的审批 Graph（IntegrationDataFormat）
 * App.tsx → export { default } from './examples/Ch11ExportDslToJavaDemo';
 */
import {
  WorkflowBuilder,
  getHandleId,
  getStoreDataForIntegration,
  useWorkflowBuilderActions,
  type WorkflowBuilderNode,
  type WorkflowBuilderEdge,
} from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';

import { demoPaletteItems } from '../palette';

const hPass = getHandleId({ handleType: 'source', innerId: 'audit-pass' });
const hReject = getHandleId({ handleType: 'source', innerId: 'audit-reject' });

/** 与 java-temporal-bridge 约定一致的审批拓扑 */
const initialNodes: WorkflowBuilderNode[] = [
  {
    id: 'submit_apply',
    type: 'node',
    position: { x: 240, y: 20 },
    data: {
      type: 'action',
      icon: 'PlayCircle',
      properties: {
        label: '提交申请',
        description: '映射 Java Activity: submitApplication',
        type: 'makeApiCall',
        status: 'active',
        makeAPICall: {
          apiUrl: 'activity://biz:submitApplication',
          httpMethod: 'post',
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
    id: 'wait_audit',
    type: 'node',
    position: { x: 240, y: 160 },
    data: {
      type: 'notification',
      icon: 'HandPalm',
      properties: {
        label: '等待审批信号',
        description: 'Java: Workflow.await + auditSignal；eventKey=auditSignal',
        type: 'webhook',
        status: 'active',
      },
    },
  },
  {
    id: 'audit_branch',
    type: 'decision-node',
    position: { x: 220, y: 300 },
    data: {
      type: 'decision',
      icon: 'ArrowsSplit',
      properties: {
        label: '审批结果',
        description: 'pass / reject',
        status: 'active',
        decisionBranches: [
          { id: 'br-pass', sourceHandle: hPass, label: 'pass', conditions: [] },
          { id: 'br-reject', sourceHandle: hReject, label: 'reject', conditions: [] },
        ],
      },
    },
  },
  {
    id: 'notify_pass',
    type: 'node',
    position: { x: 80, y: 460 },
    data: {
      type: 'action',
      icon: 'PlayCircle',
      properties: {
        label: '通过通知',
        description: 'Activity: notifyPass',
        type: 'makeApiCall',
        status: 'active',
        makeAPICall: {
          apiUrl: 'activity://biz:notifyPass',
          httpMethod: 'post',
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
    id: 'notify_reject',
    type: 'node',
    position: { x: 400, y: 460 },
    data: {
      type: 'action',
      icon: 'PlayCircle',
      properties: {
        label: '驳回通知',
        description: 'Activity: notifyReject',
        type: 'makeApiCall',
        status: 'active',
        makeAPICall: {
          apiUrl: 'activity://biz:notifyReject',
          httpMethod: 'post',
          headers: '',
          body: '',
          responseFormat: 'json',
          storeResponse: 'orderUpdateResponse',
          retryOnFailure: false,
        },
      },
    },
  },
];

const initialEdges: WorkflowBuilderEdge[] = [
  { id: 'e1', source: 'submit_apply', target: 'wait_audit' },
  { id: 'e2', source: 'wait_audit', target: 'audit_branch' },
  { id: 'e3', source: 'audit_branch', target: 'notify_pass', sourceHandle: hPass },
  { id: 'e4', source: 'audit_branch', target: 'notify_reject', sourceHandle: hReject },
];

function Toolbar() {
  const { save } = useWorkflowBuilderActions();

  const exportForJava = () => {
    const graph = getStoreDataForIntegration();
    const text = JSON.stringify(graph, null, 2);
    console.log('=== 提交给 Java Temporal 的 IntegrationDataFormat ===');
    console.log(text);
    void navigator.clipboard?.writeText(text);
    alert('已复制 Graph JSON 到剪贴板，可粘贴到 java-temporal-bridge 的 sample-dsl.json');
  };

  return (
    <div style={{ position: 'absolute', top: 8, left: 120, zIndex: 99, display: 'flex', gap: 8 }}>
      <button type="button" onClick={() => save()}>
        保存
      </button>
      <button type="button" onClick={exportForJava}>
        导出 DSL 给 Java
      </button>
    </div>
  );
}

export default function Ch11ExportDslToJavaDemo() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="approval_demo"
        layoutDirection="DOWN"
        nodeTypes={demoPaletteItems}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        integration={{
          strategy: 'props',
          onDataSave: async (graph) => {
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
