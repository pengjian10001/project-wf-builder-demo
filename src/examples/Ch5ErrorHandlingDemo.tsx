/**
 * 第 5 章完整可运行示例：自定义节点 + errorPolicy + 预置成功/失败边
 * 用法：在 src/App.tsx 中 `export { default } from './examples/Ch5ErrorHandlingDemo';`
 * 然后 npm run dev
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

// —— 自定义「不稳定 HTTP」节点：属性面板可配置 errorPolicy ——
const unstableHttpSchema = {
  type: 'object',
  properties: {
    ...sharedProperties,
    ...errorPolicyProperty,
    url: { type: 'string' },
    method: {
      type: 'string',
      options: [
        { label: 'GET', value: 'GET' },
        { label: 'POST', value: 'POST' },
      ],
    },
  },
  required: ['url', 'method'],
} satisfies NodeSchema;

type UnstableHttpSchema = typeof unstableHttpSchema;
const scope = getScope<UnstableHttpSchema>;

const unstableHttpUiSchema: UISchema = {
  type: 'VerticalLayout',
  elements: [
    { type: 'Text', scope: scope('properties.label'), label: '名称' },
    {
      type: 'Select',
      scope: scope('properties.errorPolicy'),
      label: '错误策略',
    },
    { type: 'Text', scope: scope('properties.url'), label: 'URL' },
    { type: 'Select', scope: scope('properties.method'), label: 'Method' },
  ],
};

const unstableHttpNode: PaletteItem<UnstableHttpSchema> = {
  type: 'unstableHttp',
  label: '不稳定 HTTP',
  description: '演示 errorPolicy（fail / continue / errorRoute）',
  icon: 'Globe',
  defaultPropertiesData: {
    label: '不稳定 HTTP',
    description: '',
    errorPolicy: 'errorRoute',
    url: 'https://httpstat.us/503',
    method: 'GET',
  },
  schema: unstableHttpSchema,
  uischema: unstableHttpUiSchema,
};

const errorSourceHandle = getHandleId({
  handleType: 'source',
  innerId: 'errorRoute',
});

/** 预置图：HTTP → 成功通知；HTTP --errorRoute→ 失败兜底 */
const initialNodes: WorkflowBuilderNode[] = [
  {
    id: 'n-http',
    type: 'node',
    position: { x: 240, y: 40 },
    data: {
      type: 'unstableHttp',
      icon: 'Globe',
      properties: {
        label: '调用不稳定接口',
        description: '保存 Graph 后交给 Worker；此处可改 errorPolicy',
        errorPolicy: 'errorRoute',
        url: 'https://httpstat.us/503',
        method: 'GET',
      },
    },
  },
  {
    id: 'n-ok',
    type: 'node',
    position: { x: 80, y: 220 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '成功路径',
        description: '',
        type: 'webhook',
        status: 'active',
      },
    },
  },
  {
    id: 'n-fail',
    type: 'node',
    position: { x: 400, y: 220 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '失败兜底',
        description: 'errorPolicy=errorRoute 时由执行引擎走此边',
        type: 'webhook',
        status: 'active',
      },
    },
  },
];

const initialEdges: WorkflowBuilderEdge[] = [
  { id: 'e-ok', source: 'n-http', target: 'n-ok' },
  {
    id: 'e-err',
    source: 'n-http',
    target: 'n-fail',
    sourceHandle: errorSourceHandle,
    data: { label: 'errorRoute' },
  },
];

function DemoToolbar() {
  const { save, setReadOnly } = useWorkflowBuilderActions();
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
      <button type="button" onClick={() => save()}>
        保存 Graph
      </button>
      <button type="button" onClick={() => setReadOnly(true)}>
        只读预览
      </button>
      <button type="button" onClick={() => setReadOnly(false)}>
        恢复编辑
      </button>
    </div>
  );
}

export default function Ch5ErrorHandlingDemo() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="ch5-error-handling-demo"
        layoutDirection="DOWN"
        nodeTypes={[...demoPaletteItems, unstableHttpNode]}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        integration={{
          strategy: 'props',
          onDataSave: async (graph) => {
            console.log('=== Ch5 保存（含 errorPolicy，可交后端 / Temporal）===');
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
