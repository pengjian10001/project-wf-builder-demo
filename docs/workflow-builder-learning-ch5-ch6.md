# Workflow Builder 完整学习资料（第 5 章 + 第 6 章）

基于官方文档、`@workflowbuilder/sdk@2.3.x`、参考执行栈 [`@workflow-builder/execution-core`](https://github.com/synergycodes/workflowbuilder/tree/main/packages/execution-core) 与 Temporal Worker。第 1–4 章见同目录其它文档。

- **编辑器 SDK：** `@workflowbuilder/sdk`（画布产出 `IntegrationDataFormat` JSON）  
- **参考执行核心：** `@workflow-builder/execution-core`（`runGraph` 拓扑调度）  
- **参考持久化引擎：** Temporal（重试、超时、宕机恢复、信号暂停）  
- **参考栈说明：** https://www.workflowbuilder.io/reference-stack  
- **Temporal 集成：** https://www.workflowbuilder.io/integrations/temporal  

> **分层约定（贯穿本章）**  
> 1. **编辑器层**：配置节点属性、连线、`errorPolicy` 等，保存 Graph JSON。  
> 2. **执行层**：Worker / Temporal 消费 Graph，真正执行 HTTP、重试、持久化。  
> `@workflowbuilder/sdk` **不会**在浏览器里跑 `timeout` / `retry` / `resume`；这些能力在执行引擎侧生效。

---

## 第 5 章：错误处理、重试、超时 & 状态持久化

### 5.1 核心概念

Workflow Builder 参考栈提供三层异常 / 恢复能力：

1. **节点级别（图语义）**：单节点失败后如何继续 —— 由节点上的 **`errorPolicy`** 决定（`fail` / `continue` / `errorRoute`），可做到「不中断整图」或「走错误分支」。  
2. **Activity / Worker 级别（基础设施）**：单次节点调用的 **超时、重试、退避** —— 由 Temporal `proxyActivities({ startToCloseTimeout, retry })`（或你自研引擎的等价配置）负责。  
3. **持久化状态（引擎）**：断点续跑、宕机恢复、暂停 / 继续 —— Temporal 用 **Event History** 自动完成；不是在 Graph JSON 顶层写一个 `persistence` 对象就能生效。

关键区分（语义对照官方执行模型）：

| 概念 | 含义 | 落地方式 |
|------|------|----------|
| **retry** | 可重试的临时故障（网络抖动、5xx、限流） | Temporal Activity `retry`（次数、退避）；业务节点内也可自实现短重试 |
| **catch / continue** | 捕获失败，写入错误上下文，工作流仍可继续 | `errorPolicy: 'continue'`；下游读 `nodeOutputs[id].error` |
| **errorRoute（兜底分支）** | 失败后只走错误边 | `errorPolicy: 'errorRoute'` + 连线 `sourceHandle: 'errorRoute'` |
| **fail** | 标记运行失败，终止后续节点 | `errorPolicy: 'fail'`（默认）；`runGraph` 返回 `{ status: 'failed' }` |

官方 `execution-core` 文档摘要：

- 仅 **`fail`** 会使整次运行为 `failed`。  
- **`continue` / `errorRoute`** 会吸收节点失败：仍发 `node_failed` 事件，但 `runGraph` 可返回 `{ status: 'completed' }`。

---

### 5.2 节点级错误配置

#### 5.2.1 编辑器：暴露 `errorPolicy`

SDK 导出可选 schema 片段 `errorPolicyProperty`，可拼进自定义节点的 `schema`，属性面板出现错误策略下拉：

```ts
import { sharedProperties, errorPolicyProperty } from '@workflowbuilder/sdk';
import type { NodeSchema } from '@workflowbuilder/sdk';

/** 示例：带错误策略的 HTTP 业务节点 schema */
const httpCallSchema = {
  type: 'object',
  properties: {
    ...sharedProperties,
    ...errorPolicyProperty, // fail | continue | errorRoute
    url: { type: 'string', format: 'uri' },
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
```

`errorPolicy` 选项（SDK 类型）：

| 值 | 说明 |
|----|------|
| `fail` | 默认；节点抛错则整次执行失败 |
| `continue` | 记录错误输出，沿普通出边继续（不走 `errorRoute` 边） |
| `errorRoute` | 只沿 `sourceHandle === 'errorRoute'` 的边继续 |

#### 5.2.2 执行层：BaseNode 形态

参考执行核心中，每个可执行节点大致为：

```ts
/** @workflow-builder/execution-core 中的 BaseNode 语义（精简） */
type ExecutableNode = {
  id: string;
  type: string;           // 与 Worker 注册表中的 executor key 对应
  config: unknown;        // 业务配置（url、method 等）
  errorPolicy?: 'fail' | 'continue' | 'errorRoute';
};
```

**节点失败后的错误输出结构（`continue` / `errorRoute`）：**

```json
{
  "error": {
    "message": "node execute timeout 10s",
    "code": "TIMEOUT"
  }
}
```

下游模板可通过执行上下文读取（参考栈变量形态为 `{{nodes.<id>.…}}`，见官方 Variable Picker / execution-core templates）。

#### 5.2.3 超时与重试：放在 Temporal Activity（不是 Graph 顶层虚构字段）

编辑器保存的 Graph **没有**官方统一的 `timeout: "10s"` / `retry: { maxAttempts, backoff, … }` JSON 标准字段。参考 Worker 在 Temporal 侧统一配置 Activity：

```ts
// 摘自官方 apps/execution-worker/.../run-workflow.ts（可在参考栈中直接运行）
import { proxyActivities } from '@temporalio/workflow';

/** DB 写事件：短超时、多重点试 */
const databaseActivities = proxyActivities({
  startToCloseTimeout: '30s',
  retry: { maximumAttempts: 5 },
});

/** 节点执行（可能调 HTTP / LLM）：长超时、少重试，避免费用雪崩 */
const nodeActivities = proxyActivities({
  startToCloseTimeout: '10m',
  retry: { maximumAttempts: 2 },
});
```

若业务需要「按节点类型不同的超时 / 重试」，常见做法：

1. 在 Worker 里为不同 Activity 函数配置不同的 `proxyActivities`；或  
2. 把 `timeoutMs` / `retry` 写进节点 `config`，由 **该节点的 executor** 内部实现（需自行保证幂等）。

**字段释义（映射到真实能力）：**

| 能力 | 说明 | 落点 |
|------|------|------|
| timeout | 单次执行超时 | Temporal `startToCloseTimeout` 或节点 executor 内超时 |
| maxAttempts | 最大尝试次数（含首次） | Temporal `retry.maximumAttempts` |
| delay / backoff | 重试间隔与指数退避 | Temporal `retry.initialInterval` / `backoffCoefficient` 等 |
| retryOn / doNotRetryOn | 按错误类型决定是否重试 | Temporal `nonRetryableErrorTypes` + 自定义 `ApplicationFailure` |
| continue | 失败后继续主路径 | `errorPolicy: 'continue'` |
| errorRoute | 失败后走兜底分支 | `errorPolicy: 'errorRoute'` + 错误边 |
| 错误上下文 | 供后续节点读取 | `nodeOutputs[id] = { error: { message, code? } }` |

#### 5.2.4 编辑器 Graph 示例（含 errorPolicy + 错误边）

下面是一份可放进本仓库 `initialNodes` / `initialEdges` 的示意 Graph（业务 type 需你已注册对应 `PaletteItem` 与 Worker executor）：

```ts
import type { WorkflowBuilderNode, WorkflowBuilderEdge } from '@workflowbuilder/sdk';

/**
 * 不稳定 HTTP → 成功路径 after_api
 *                 └─ errorRoute → notify_fail
 */
const nodes: WorkflowBuilderNode[] = [
  {
    id: 'unstable_api',
    type: 'node',
    position: { x: 200, y: 40 },
    data: {
      type: 'httpCall', // 业务类型：你的 PaletteItem.type / Worker registry key
      icon: 'Globe',
      properties: {
        label: '不稳定接口调用',
        description: '',
        url: 'https://httpstat.us/503',
        method: 'GET',
        // 失败走错误边，而不是直接整单失败
        errorPolicy: 'errorRoute',
      },
    },
  },
  {
    id: 'after_api',
    type: 'node',
    position: { x: 80, y: 220 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '成功后续',
        description: '',
        type: 'webhook',
        status: 'active',
      },
    },
  },
  {
    id: 'notify_fail',
    type: 'node',
    position: { x: 320, y: 220 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '失败兜底通知',
        description: '',
        type: 'webhook',
        status: 'active',
      },
    },
  },
];

const edges: WorkflowBuilderEdge[] = [
  // 成功路径（普通边）
  { id: 'e-ok', source: 'unstable_api', target: 'after_api' },
  // 失败路径：sourceHandle 必须为保留名 errorRoute
  {
    id: 'e-err',
    source: 'unstable_api',
    target: 'notify_fail',
    sourceHandle: 'errorRoute',
  },
];
```

**如何在本仓库验证编辑器部分：** 把上述 nodes/edges 交给 `WorkflowBuilder.Root` 的 `initialNodes` / `initialEdges`，`nodeTypes` 需包含对应类型；`npm run dev` 可查看画布与属性。真正发起 HTTP 与重试需接参考后端 / Worker。

---

### 5.3 工作流级失败处理（替代「顶层 onError 节点列表」）

参考 `runGraph` **没有**工作流 JSON 顶层的 `onError: { mode, nodes: [...] }` 块。等价能力用图结构表达：

1. **关键节点**设 `errorPolicy: 'errorRoute'`，连到「通知 / 补偿 / 打日志」节点（全局兜底子图）。  
2. **多个节点**都指向同一兜底节点（共享错误处理）。  
3. 引擎适配器：当 `runGraph` 返回 `status: 'failed'` 时，Temporal 侧抛 `ApplicationFailure.nonRetryable`，实例标为 Failed。

```ts
// 官方 Temporal workflow 收尾逻辑（语义）
if (outcome.status === 'failed') {
  throw ApplicationFailure.nonRetryable(
    outcome.error.message,
    outcome.error.code ?? 'WorkflowExecutionFailed',
  );
}
```

**与「全局 onError.mode」对应的产品语义：**

| 目标行为 | 做法 |
|----------|------|
| 失败后跑补偿再标 FAILED | 错误边上挂补偿节点；关键节点仍用 `fail`，或补偿后再由适配器失败收口 |
| 直接终止 | 默认 `errorPolicy: 'fail'`，不连错误边 |
| 业务上视为 COMPLETED（兜底成功） | 失败节点用 `continue` 或 `errorRoute`，让 `runGraph` 以 `completed` 结束（失败仍有 `node_failed` 事件） |

「模拟抛业务异常」：在 Worker 的节点 executor 中 `throw` / `ApplicationFailure`，不必依赖虚构的 `type: "throw"` JSON 节点——也可自建 `throw` / `log` 类型并在注册表实现。

---

### 5.4 状态持久化 & 断点续跑

仅当后端接入 **具备持久历史的引擎（参考实现为 Temporal + DB）** 时，宕机恢复才有意义。内存演示 Runner 无法真正 `resume`。

#### 5.4.1 Temporal 提供的能力（无需在 Graph 上写 persistence 块）

| 能力 | Temporal 机制 |
|------|----------------|
| 节点完成后宕机恢复 | Workflow Event History 回放；`runGraph` 设计为确定性，可在沙箱重放 |
| 暂停 / 继续 | `defineSignal` + `setHandler`；编辑器可做审批 / 等待类节点，适配器映射为 Signal |
| 查询状态 | Workflow Query；后端 API 查 execution 状态 |
| 取消 | `WorkflowEnginePort.cancel` → Temporal cancel |

参考 Worker README：Workflow Id 形如 `execution-<id>`，便于按执行 ID 取消。

#### 5.4.2 运行时 API（参考栈语义，非 `@workflowbuilder/sdk` 导出）

```ts
/**
 * 伪代码：对接你自己的 Backend / Temporal Client。
 * 本仓库仅含编辑器，不内置 workflowRunner。
 * 完整可跑：克隆 synergycodes/workflowbuilder，启动 backend + execution-worker + Temporal。
 */

// 提交执行（后端 WorkflowEnginePort.submit）
const execution = await api.post('/executions', {
  graph: savedIntegrationDataFormat, // 编辑器保存的 JSON
  input: { inputText: 'test' },
});
const executionId = execution.id;

// 查询状态：PENDING | RUNNING | COMPLETED | FAILED | CANCELLED | …
const status = await api.get(`/executions/${executionId}`);

// 取消
await api.post(`/executions/${executionId}/cancel`);

// 暂停 / 继续：通过 Signal（审批通过、外部事件）唤醒等待中的 Workflow
await temporalClient.workflow.getHandle(workflowId).signal('resume', payload);
```

**快照时机（引擎内部，而非 Graph 字段）：** Temporal 在 Activity 完成、Timer、Signal 等事件写入 History；对应产品上的「NODE_START / NODE_END / ERROR」观测，可订阅参考后端的 SSE / `emitEvent`（`node_started` / `node_completed` / `node_failed` / `execution_failed`）。

---

### 5.5 完整示例：重试 + 错误路由 + 全局兜底

#### A. Temporal Activity 重试（执行层，参考栈可运行）

对「不稳定 HTTP」：Activity 层重试 2 次；仍失败则由图上的 `errorPolicy` 决定。

```ts
// Worker / Workflow 侧：节点 Activity 重试策略示例
const nodeActivities = proxyActivities({
  startToCloseTimeout: '5s', // 单次超时
  retry: {
    maximumAttempts: 2, // 含首次：最多 2 次
    initialInterval: '1s',
    backoffCoefficient: 1, // 近似 fixed；指数退避则 > 1
    // nonRetryableErrorTypes: ['HTTP_400', 'HTTP_401', 'HTTP_403'],
  },
});
```

#### B. 图语义：catch 成功路径 vs 上抛全局失败

**场景 1 — 节点吸收错误（近似 catch.enable + continueWorkflow）**

- `errorPolicy: 'continue'`  
- 不连 `errorRoute` 边  
- 重试耗尽后：`nodeOutputs.unstable_api = { error: {…} }`，下游仍执行  
- 整单状态倾向 **COMPLETED**（失败可见于事件）

**场景 2 — 走兜底分支（近似 catch + 错误分支）**

- `errorPolicy: 'errorRoute'`  
- 连接 `sourceHandle: 'errorRoute'` 到 `global_log` / 通知节点  
- 成功边不会在失败时触发  

**场景 3 — 上抛失败（catch 关闭）**

- `errorPolicy: 'fail'`（或省略，默认 fail）  
- 重试失败后：`runGraph` → `failed` → Temporal Workflow Failed  

#### C. 本仓库编辑器最小可运行骨架

把第 5.2.4 节的 `nodes` / `edges` 写入 `App.tsx`（需自备 `httpCall` 的 `PaletteItem`，或先用 Demo 的 `action` / `notification` 改 `data.type` 做连线演示）：

```tsx
import { WorkflowBuilder } from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';
import { demoPaletteItems } from './palette';
// import { nodes, edges } from './error-demo-graph';

export default function App() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="error-full-demo"
        layoutDirection="DOWN"
        nodeTypes={demoPaletteItems}
        // initialNodes={nodes}
        // initialEdges={edges}
        integration={{
          strategy: 'props',
          onDataSave: async (graph) => {
            // 将 graph 交给后端执行；浏览器内不会自动重试 HTTP
            console.log(JSON.stringify(graph, null, 2));
            return 'success';
          },
        }}
      />
    </div>
  );
}
```

```bash
npm run dev
```

**执行现象说明（接好 Worker 后）：**

1. HTTP 返回 503 → Activity 按 `maximumAttempts` 重试；  
2. 仍失败 → 按 `errorPolicy`：`continue` 写错误输出并继续 / `errorRoute` 走错误边 / `fail` 整单失败；  
3. `continue` / `errorRoute` **不会**把整单标成 Temporal Failed（除非适配器另有逻辑）；  
4. `fail` 时实例状态为 **FAILED**。

---

### 5.6 常见坑点

1. **`maximumAttempts: 1`** 表示只执行一次、不重试；不要把重试次数开太大，避免下游雪崩。  
2. 使用 **`continue` / `errorRoute`** 后，下游必须判断错误输出是否存在，不要假定节点一定有成功结果。  
3. **仅编辑器 / 内存 Runner** 没有真正的 `resume`；生产必须接 Temporal（或等价持久引擎）+ 存储。  
4. 业务主动失败：在 executor 里抛错；`fail` 策略会中止图；不要指望不存在的顶层 `onError.nodes` 数组自动插入日志节点——请把兜底画在图上。  
5. **`errorRoute` 是保留 `sourceHandle`**：决策分支不要占用该名字；成功路径与错误路径必须分开连线。  
6. 编辑器里 Action / Notification 的 `retryOnFailure` 是 **Demo 表单字段**，是否生效取决于你的 Worker 是否读取该配置。

---

### 5.7 本章完整可运行示例（本仓库）

本仓库已提供可直接启动的编辑器示例：

| 文件 | 说明 |
|------|------|
| `src/examples/Ch5ErrorHandlingDemo.tsx` | 自定义 `unstableHttp` 节点（含 `errorPolicy`）+ 成功边 / `errorRoute` 失败边 + 工具栏保存 |
| `src/App.tsx` | `export { default } from './examples/Ch5ErrorHandlingDemo'` |

**运行步骤：**

```bash
# 确认 App.tsx 指向 Ch5 示例后
npm run dev
```

**页面上可验证：**

1. 画布预置「不稳定 HTTP → 成功路径 / 失败兜底」  
2. 选中 HTTP 节点，右侧可改 **错误策略**（`fail` / `continue` / `errorRoute`）  
3. 左侧面板可继续拖拽 Demo 节点与「不稳定 HTTP」  
4. 点「保存 Graph」，控制台打印完整 `IntegrationDataFormat`（含 `errorPolicy`，可交给 Temporal Worker）  
5. 「只读预览 / 恢复编辑」演示第 4 章只读 API  

> 浏览器内**不会**真实请求 `httpstat.us` 或执行 Temporal 重试；那是执行层职责。本示例保证：**图结构 + errorPolicy 配置可编辑、可序列化**。

完整源码见 `src/examples/Ch5ErrorHandlingDemo.tsx`（与文档同仓，勿重复维护两份时以源文件为准）。核心结构如下：

```tsx
// 1) schema 拼入 errorPolicyProperty
const unstableHttpSchema = {
  type: 'object',
  properties: {
    ...sharedProperties,
    ...errorPolicyProperty, // fail | continue | errorRoute
    url: { type: 'string' },
    method: { type: 'string', options: [/* GET/POST */] },
  },
  required: ['url', 'method'],
} satisfies NodeSchema;

// 2) 失败边使用保留 handle
const errorSourceHandle = getHandleId({
  handleType: 'source',
  innerId: 'errorRoute',
});

// 3) Root
<WorkflowBuilder.Root
  nodeTypes={[...demoPaletteItems, unstableHttpNode]}
  initialNodes={/* n-http / n-ok / n-fail */}
  initialEdges={[
    { id: 'e-ok', source: 'n-http', target: 'n-ok' },
    { id: 'e-err', source: 'n-http', target: 'n-fail', sourceHandle: errorSourceHandle },
  ]}
  integration={{ strategy: 'props', onDataSave: async (g) => { console.log(g); return 'success'; } }}
>
  <WorkflowBuilder.DefaultLayout />
  <DemoToolbar />
</WorkflowBuilder.Root>
```

---

## 第 6 章：条件分支、循环、并行、子工作流

参考官方最新规范：编辑器用 **节点 + 多 Handle 连线** 表达控制流；执行侧由 `runGraph` 拓扑调度（含扇出并行波次）。本章覆盖控制流核心能力，并给出可在编辑器保存、可在参考栈执行的数据形态。

### 6.1 总览：控制流如何表达

| 能力 | 编辑器（Demo / 官方节点） | 执行层 |
|------|---------------------------|--------|
| 二分条件 | `conditional` 节点（true / false 两个出口） | 决策类 executor 选择 `nextPort` / 出边 |
| 多路分支 | `decision` 节点（`decisionBranches[]` + 多 handle） | 同上 |
| 延时等待 | `delay` 节点 | Temporal Timer / sleep Activity |
| 并行 | 一个节点连出多条边（扇出）；`runGraph` 用 `Promise.all` 调度波次 | 同波次并行执行 |
| 循环 | Demo **无**内置 `loop` 节点类型 | Temporal 工作流代码循环，或自定义 `loop` 节点 + executor |
| 子工作流 | Demo **无**内置 `subWorkflow` 节点 | Temporal **Child Workflow**，或自定义节点提交子 Graph |

注意：子图若用自定义「容器节点」承载 children，**所有节点 id 在整张可执行图中仍应唯一**（含展开后的子节点）。

---

### 6.2 条件分支：`conditional` / `decision`

#### 6.2.1 Conditional（if / else）

官方文档：https://www.workflowbuilder.io/docs/nodes/conditional/

- 恰好两个分支：条件为真 / 为假。  
- 条件为数组：每项含 `x`、`comparisonOperator`、`y`、`logicalOperator`（AND / OR）。

**编辑器 Graph 示例（可放入 `initialNodes` / `initialEdges`）：**

```ts
import type { WorkflowBuilderNode, WorkflowBuilderEdge } from '@workflowbuilder/sdk';

/** 分数判断：>= 60 走 true，否则 false（字段形状对齐本仓库 Demo） */
const ifDemoNodes: WorkflowBuilderNode[] = [
  {
    id: 'n-trigger',
    type: 'node',
    position: { x: 220, y: 20 },
    data: {
      type: 'trigger',
      icon: 'Lightning',
      properties: {
        label: '输入分数',
        description: '',
        type: 'eventBasedTrigger',
        status: 'active',
        eventType: 'score.submitted',
      },
    },
  },
  {
    id: 'judge_score',
    type: 'node', // conditional 模板若使用专用 template，以你的 PaletteItem 为准
    position: { x: 220, y: 160 },
    data: {
      type: 'conditional',
      icon: 'GitBranch',
      properties: {
        label: '分数判断',
        description: '',
        conditionsArray: [
          {
            x: '{{nodes.n-trigger.output.score}}', // 变量插值形态以执行模板为准
            comparisonOperator: 'greaterOrEqual',
            y: '60',
            logicalOperator: 'and',
          },
        ],
      },
    },
  },
  {
    id: 'log_pass',
    type: 'node',
    position: { x: 80, y: 320 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: { label: '及格', description: '', type: 'webhook', status: 'active' },
    },
  },
  {
    id: 'log_fail',
    type: 'node',
    position: { x: 360, y: 320 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: { label: '不及格', description: '', type: 'webhook', status: 'active' },
    },
  },
];

const ifDemoEdges: WorkflowBuilderEdge[] = [
  { id: 'e1', source: 'n-trigger', target: 'judge_score' },
  // handle id 以条件节点模板的 getHandleId 为准（true/false 出口）
  { id: 'e-true', source: 'judge_score', target: 'log_pass', sourceHandle: 'true' },
  { id: 'e-false', source: 'judge_score', target: 'log_fail', sourceHandle: 'false' },
];
```

规则：条件求值后只走命中的出口；另一侧被跳过（skip-propagation）。

#### 6.2.2 Decision（多分支）

官方文档：https://www.workflowbuilder.io/docs/nodes/decision/

- `decisionBranches[]`：每项含 `id`、`sourceHandle`、`label`、`conditions`。  
- 按分支匹配，适合多路路由；二分场景优先用 Conditional。

```ts
properties: {
  label: '成绩等级',
  description: '',
  status: 'active',
  decisionBranches: [
    {
      id: 'branch-a',
      sourceHandle: 'a',
      label: 'A',
      conditions: [{ x: '{{score}}', comparisonOperator: 'greaterOrEqual', y: '90', logicalOperator: 'and' }],
    },
    {
      id: 'branch-b',
      sourceHandle: 'b',
      label: 'B',
      conditions: [
        { x: '{{score}}', comparisonOperator: 'greaterOrEqual', y: '60', logicalOperator: 'and' },
        { x: '{{score}}', comparisonOperator: 'less', y: '90', logicalOperator: 'and' },
      ],
    },
    {
      id: 'branch-c',
      sourceHandle: 'c',
      label: 'C',
      conditions: [], // 或作为默认分支，取决于你的 decision executor 约定
    },
  ],
}
```

---

### 6.3 循环（loop）

Demo 面板 **没有** `type: 'loop'` 的内置节点。循环在参考架构中通常：

1. **Temporal Workflow 代码**中 `for` / `while`（确定性约束下配合 Activity）；或  
2. **自定义 PaletteItem** `loop`，由你的 Worker executor 解释 `mode` / `items` / `maxIterations`。

下面给出 **可交给自定义 executor 的配置约定**（与业务文档意图一致；需你实现 executor 才真正可跑）：

#### 6.3.1 while 模式（配置约定）

```ts
// 自定义节点 data.properties 示例（执行前由适配器映射为 BaseNode.config）
{
  mode: 'while',
  condition: 'i < 3',       // 由 executor 解析；模板语法与 resolveTemplate 对齐
  maxIterations: 10,        // 强制防死循环，务必配置
  // 循环体：可用子图节点 id 列表，或边指向的下游子图
}
```

- **`maxIterations`**：达到上限必须退出，防止逻辑 bug 打爆 Worker。

#### 6.3.2 forEach 模式（配置约定）

```ts
{
  mode: 'forEach',
  itemsPath: 'uidList',     // 从执行上下文取数组
  itemAlias: 'userItem',
  indexAlias: 'idx',
  maxIterations: 50,
}
```

循环内上下文约定：

- 当前元素 → `userItem`（或你定义的 alias）  
- 当前下标 → `idx`，从 0 开始  

**编辑器侧最小演示：** 用 `delay` + 人工多次触发，或画「展开后的」固定次数节点，不依赖不存在的内置 loop 控件。

---

### 6.4 并行（parallel）

`runGraph` 对同一波次可调度的节点使用 **`Promise.all`**（位置稳定、可重放）。编辑器侧：**一个节点拉出多条边** 即扇出并行。

**等待策略（产品设计映射）：**

| 策略 | 含义 | 参考实现要点 |
|------|------|----------------|
| waitAll | 等全部分支完成再继续 | 默认拓扑：汇合节点入度收齐后再调度（菱形汇合） |
| waitAny | 任一完成即继续 | 需自定义调度；核心 `runGraph` 不用 `Promise.race`（为重放确定性） |
| waitNone | 开火后不管 | 用 Signal / 独立 Child Workflow / 异步投递，勿阻塞主图 |

**编辑器扇出示例：**

```ts
const parallelEdges: WorkflowBuilderEdge[] = [
  { id: 'e-a', source: 'fork', target: 'log_a1' },
  { id: 'e-b', source: 'fork', target: 'log_b1' },
  // 汇合：两分支都连到 after_parallel（waitAll 语义）
  { id: 'e-ja', source: 'log_a1', target: 'after_parallel' },
  { id: 'e-jb', source: 'log_b1', target: 'after_parallel' },
];
```

重要坑：

1. 每条分支节点 **id 全局唯一**；  
2. waitAny 不要假设所有分支输出都已就绪；  
3. 并行度受 Worker / Activity 槽位限制，避免无限扇出。

输出收集：在汇合后的节点用模板读取 `{{nodes.log_a1.…}}` / `{{nodes.log_b1.…}}`（以 execution-core `resolveTemplate` 为准）。

---

### 6.5 子工作流（subWorkflow）

实现流程复用，类似函数调用。官方参考路径是 **Temporal Child Workflow**（或后端再次 `submit` 一张子 Graph）。

#### 6.5.1 子流程：仍是一张完整 Graph

子流程与主流程一样，是 `IntegrationDataFormat`（或执行层 `WorkflowExecutionInput.definition`），在后端注册 / 按 id+version 加载。

```ts
/** 子流程：用户校验（示意）——由 Worker 执行 setOutput 类节点 */
const subWorkflowUserCheck = {
  name: 'sub_workflow_user_check',
  layoutDirection: 'DOWN' as const,
  globalVariables: {},
  nodes: [
    {
      id: 'sub_set_out',
      type: 'node',
      position: { x: 0, y: 0 },
      data: {
        type: 'userCheck', // 自定义节点：返回 { isValid, userLevel }
        icon: 'User',
        properties: {
          label: '用户校验',
          description: '',
        },
      },
    },
  ],
  edges: [],
};
```

#### 6.5.2 主流程调用（自定义节点 + Child Workflow）

```ts
// 主图中的「调用子流程」节点 properties 约定
{
  label: '调用用户校验',
  subWorkflowId: 'sub_workflow_user_check',
  subWorkflowVersion: '1.0.0', // 生产固定版本，勿默认 latest
  inputMapping: {
    userId: '{{nodes.trigger.output.uid}}',
  },
  outputAlias: 'subResult', // 写入主上下文，供后续节点读取
  errorPolicy: 'continue',  // 子流程失败时可吸收
}
```

| 字段 | 说明 |
|------|------|
| subWorkflowId | 已注册子流程 ID |
| subWorkflowVersion | 指定版本；生产建议钉死 |
| inputMapping | key = 子流程入参名，value = 主流程模板表达式 |
| outputAlias | 子流程输出挂到主上下文的变量名 |
| errorPolicy | 与普通节点相同：`fail` / `continue` / `errorRoute` |

异常行为：子流程失败默认上抛；给该节点配 `continue` / `errorRoute` 即可捕获，与第 5 章一致。

Temporal 侧示意：

```ts
import { executeChild } from '@temporalio/workflow';

// 在自定义 subWorkflow Activity / Workflow 代码中
const subResult = await executeChild(runWorkflow, {
  args: [{ definition: childGraph, input: mappedInput, executionId: childExecId }],
  workflowId: `child-${parentId}-${nodeId}`,
});
```

---

### 6.6 综合示例：decision / conditional + 循环约定 + 子流程

业务场景：传入用户 ID 列表，逐个调用子流程校验，过滤有效用户。

**编辑器可落地部分：**

1. Trigger 带入 `uidList`；  
2. 自定义 `forEach` 节点（或 Temporal 侧展开循环）；  
3. 循环体内：`subWorkflow` 自定义节点 + `conditional` 过滤；  
4. 最终 notification / log。

**执行上下文约定（示意）：**

```text
init validUsers = []
for each currentUid in uidList (maxIterations: 100):
  userCheckRes = childWorkflow(user_check, { userId: currentUid })
  if userCheckRes.isValid:
    validUsers = [...validUsers, currentUid]
log validUsers
```

数组追加使用不可变更新 `[...old, item]`，不要在共享可变数组上 `push`（尤其在 Temporal 重放场景下更安全）。

**本仓库验证步骤：**

```bash
npm run dev
```

1. 用 Demo 的 `trigger` → `conditional` / `decision` → `notification` 验证分支连线；  
2. 保存 Graph JSON，交给参考后端执行；  
3. 循环 / 子流程需自定义节点 + Worker / Child Workflow 后才有完整运行时行为。

---

### 6.7 避坑清单

1. **所有节点 ID 全局唯一**，含子流程展开后的节点。  
2. 循环务必配置 **`maxIterations`**（自定义 loop 或 Temporal 循环上限）。  
3. **waitAny** 不要依赖尚未完成的分支输出；参考 `runGraph` 默认是汇合 / waitAll 风格。  
4. 子流程逻辑变更会影响所有调用方；生产 **固定 `subWorkflowVersion`**。  
5. 循环内更新列表用 **展开赋值**，避免直接 `push`。  
6. 条件 / 决策的 **handle id** 必须与节点模板、`getHandleId` 一致，否则边连上也不走分支。  
7. 变量插值在执行层用 `{{nodes.…}}`（及 `?` / `default:` 修饰）；与编辑器 `VariableText` 的 `{{` 体验对应，最终以 execution-core 模板规则为准。  
8. **不要**把仅存在于业务草稿中的嵌套 JSON（`type: "if"` 内嵌 `nodes[]`）直接当作 SDK 的 `IntegrationDataFormat`——编辑器存的是 **扁平 nodes + edges**。

---

### 6.8 本章完整可运行示例（本仓库）

本仓库已提供可直接启动的编辑器示例：

| 文件 | 说明 |
|------|------|
| `src/examples/Ch6ControlFlowDemo.tsx` | Decision 三路分支 + Action 扇出两 Delay 再汇合（并行 waitAll 形态） |
| `src/App.tsx` | 改为 `export { default } from './examples/Ch6ControlFlowDemo'` |

**运行步骤：**

```bash
# 编辑 src/App.tsx，注释掉 Ch5，启用 Ch6：
# export { default } from './examples/Ch6ControlFlowDemo';

npm run dev
```

**页面上可验证：**

1. **左侧区域**：Trigger → Decision（A / B / C 三个出口 handle）→ 三个 Notification  
2. **右侧区域**：Action「并行起点」扇出到两个 Delay，再汇合到「并行汇合」Notification  
3. 选中 Decision，可在属性面板增删改 `decisionBranches`  
4. 点「保存控制流 Graph」，控制台打印完整 JSON（含 `sourceHandle`）  

> 分支条件在**执行引擎**中才会真正求值；编辑器负责把分支、连线、handle 配齐并序列化。循环 / 子工作流仍按 6.3 / 6.5 用自定义节点 + Worker 扩展。

完整源码见 `src/examples/Ch6ControlFlowDemo.tsx`。核心结构：

```tsx
const handleGradeA = getHandleId({ handleType: 'source', innerId: 'grade-a' });
// handleGradeB / handleGradeC 同理

const initialNodes = [
  /* trigger, decision(decisionBranches + sourceHandle), 三个 notification */,
  /* fork action, 两个 delay, join notification */,
];

const initialEdges = [
  { source: 'n-trigger', target: 'n-decision' },
  { source: 'n-decision', target: 'n-grade-a', sourceHandle: handleGradeA },
  // … B / C
  { source: 'n-fork', target: 'n-branch-left' },
  { source: 'n-fork', target: 'n-branch-right' },
  { source: 'n-branch-left', target: 'n-join' },
  { source: 'n-branch-right', target: 'n-join' },
];

<WorkflowBuilder.Root
  nodeTypes={demoPaletteItems}
  initialNodes={initialNodes}
  initialEdges={initialEdges}
  integration={{ strategy: 'props', onDataSave: async (g) => { console.log(g); return 'success'; } }}
>
  <WorkflowBuilder.DefaultLayout />
  <DemoToolbar />
</WorkflowBuilder.Root>
```

---

### 本章小结

**第 5 章**

1. 图语义错误策略：`errorPolicy` = `fail` | `continue` | `errorRoute`。  
2. 超时 / 重试：Temporal `proxyActivities`（或节点 executor 自管）。  
3. 持久化 / 续跑 / 暂停：Temporal History + Signal，而非 Graph 顶层 `persistence` 开关。  
4. 全局兜底：画在图上的错误边 / 共享补偿节点。  
5. **可运行示例：** `src/examples/Ch5ErrorHandlingDemo.tsx`（见 5.7）。

**第 6 章**

1. 分支：编辑器用 `conditional` / `decision` + 多 handle 边。  
2. 并行：扇出边 + 汇合；`runGraph` 波次 `Promise.all`。  
3. 循环 / 子流程：自定义节点 + Worker / Child Workflow 实现。  
4. 编辑器只负责产出 Graph；执行与控制流语义在参考栈落地。  
5. **可运行示例：** `src/examples/Ch6ControlFlowDemo.tsx`（见 6.8）。

---

## 附录：本仓库与参考栈

| 资源 | 作用 |
|------|------|
| `src/App.tsx` | 切换 `Ch5ErrorHandlingDemo` / `Ch6ControlFlowDemo` |
| `src/examples/Ch5ErrorHandlingDemo.tsx` | 第 5 章完整可运行示例 |
| `src/examples/Ch6ControlFlowDemo.tsx` | 第 6 章完整可运行示例 |
| `src/nodes/conditional` / `decision` | 官方 Demo 分支节点 |
| `docs/workflow-builder-learning-ch1-ch2.md` | Graph 字段与 Demo 节点 |
| `docs/workflow-builder-learning-ch3-ch4.md` | 插件、序列化、事件 |
| [execution-core README](https://github.com/synergycodes/workflowbuilder/blob/main/packages/execution-core/README.md) | `runGraph`、`errorPolicy`、模板 |
| [execution-worker README](https://github.com/synergycodes/workflowbuilder/blob/main/apps/execution-worker/README.md) | Temporal 超时与重试 |
| [Reference Stack](https://www.workflowbuilder.io/reference-stack) | 本地拉起编辑器 + 后端 + Worker |

## 附录：官方文档入口

- Conditional：https://www.workflowbuilder.io/docs/nodes/conditional/  
- Decision：https://www.workflowbuilder.io/docs/nodes/decision/  
- Variable Picker：https://www.workflowbuilder.io/docs/guides/use-variable-picker/  
- Temporal：https://www.workflowbuilder.io/integrations/temporal  
- Flow Runner 插件（浏览器内演示执行，非生产引擎）：https://www.workflowbuilder.io/docs/plugins/flow-runner/  

---

*第 7–8 章（信号 / 延时 / 外部等待、编辑器 SDK 与动态节点）见：`docs/workflow-builder-learning-ch7-ch8.md`。*
