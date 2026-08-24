# Workflow Builder 完整学习资料（第 7 章 + 第 8 章）

基于官方文档、`@workflowbuilder/sdk@2.3.x`、参考执行栈与 Temporal。前序章节见同目录 `ch1–ch6` 文档。

- **编辑器 SDK：** `@workflowbuilder/sdk`  
- **执行核心：** [`@workflow-builder/execution-core`](https://github.com/synergycodes/workflowbuilder/tree/main/packages/execution-core)  
- **Temporal 集成：** https://www.workflowbuilder.io/integrations/temporal  
- **参考栈：** https://www.workflowbuilder.io/reference-stack  
- **变量插值：** https://www.workflowbuilder.io/docs/guides/use-variable-picker/  

> **分层约定**  
> - **编辑器**：配置 Delay / 信号等待节点、Decision 分支，保存 `IntegrationDataFormat`。  
> - **执行引擎（Temporal）**：`sleep` 定时器、`defineSignal` + `condition` 外部等待、Query / Cancel。  
> 浏览器内的 `@workflowbuilder/sdk` **不会**挂起实例或接收 Signal。

---

## 第 7 章：事件、信号、定时器、延时、外部等待、实例查询 API

本章聚焦异步事件驱动：工作流可暂停等待外部信号，是长业务流程的核心能力。编辑器产出 Graph；Runner / Temporal 负责真正挂起与唤醒。

### 7.1 概念总览

两类等待模型：

1. **内部等待（Delay）**：编辑器 Demo 的 `delay` 节点；执行侧映射为 Temporal **Timer / `sleep`**。到时自动继续，无需外部介入。  
2. **外部事件等待（Signal Wait / Approval Gate）**：官方产品形态为 `signal-wait`、`approval-gate` 等节点类型；执行侧用 Temporal **`defineSignal` + `setHandler` + `condition`**。实例在等待期间不占用 Worker 线程，状态由 Event History 持久化。  
3. **信号 Signal**：外部向**运行中**的 Workflow Execution 投递事件，可携带 payload。  
4. **Timer 定时器**：延时触发；与 Signal 组合时可用 `condition(fn, timeout)` 做**超时兜底**。

| 概念 | 编辑器 | 执行层（Temporal） |
|------|--------|-------------------|
| 内部延时 | `data.type: 'delay'` + `duration.*` | `sleep('5 minutes')` 等 |
| 外部等待 | 自定义 / 参考栈 `signalWait`、`approval-gate` | `defineSignal` + `condition` |
| 持久化挂起 | Graph 无需写 `persistence.enable` | Temporal History 自动持久；内存模拟会丢实例 |
| 实例查询 | — | Temporal Query / 参考后端 REST |

生产环境必须使用 Temporal（或等价持久引擎）；纯内存 Runner 进程重启会丢失所有挂起实例。

---

### 7.2 delay 延时节点（内部休眠）

本仓库 Demo 节点字段（不是 `config.duration: "5s"` 字符串）：

```ts
// data.properties（delay 节点）
{
  label: '缓冲延时',
  description: '',
  type: 'fixedDelay', // fixedDelay | dynamicDelay | conditionalDelay | untilSpecificDateTime
  status: 'active',
  duration: {
    timeUnits: 'minutes', // Demo options: none | minutes | hours
    delayAmount: 5,
    maxWaitTime: '24',
    expression: '',       // dynamic 模式可用
  },
}
```

**编辑器 Graph 片段（可放入 `initialNodes`）：**

```ts
import type { WorkflowBuilderNode, WorkflowBuilderEdge } from '@workflowbuilder/sdk';

const delayDemoNodes: WorkflowBuilderNode[] = [
  {
    id: 'n-before',
    type: 'node',
    position: { x: 200, y: 40 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '开始延时',
        description: '',
        type: 'webhook',
        status: 'active',
      },
    },
  },
  {
    id: 'sleep_5m',
    type: 'node',
    position: { x: 200, y: 180 },
    data: {
      type: 'delay',
      icon: 'Timer',
      properties: {
        label: '休眠 5 分钟',
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
    id: 'n-after',
    type: 'node',
    position: { x: 200, y: 320 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '延时结束，继续执行',
        description: '',
        type: 'webhook',
        status: 'active',
      },
    },
  },
];

const delayDemoEdges: WorkflowBuilderEdge[] = [
  { id: 'e1', source: 'n-before', target: 'sleep_5m' },
  { id: 'e2', source: 'sleep_5m', target: 'n-after' },
];
```

**执行侧（Temporal，可在 Worker 中运行）：**

```ts
import { sleep } from '@temporalio/workflow';

// 由 delay 节点 executor / 适配器调用
await sleep('5 minutes'); // 让出 Worker；History 持久化；时间到自动继续
```

- `duration`：由 `timeUnits` + `delayAmount` 组成；Worker 负责换算成 Temporal Duration。  
- Delay **不会**阻塞 CPU；等待期间实例在 Temporal 侧处于运行中的「定时器等待」，宕机可恢复。

---

### 7.3 外部事件等待（长流程核心）

业务场景：人工审批、第三方回调、用户确认——工作流停下来等待外部输入。

官方说明：编辑器可暴露 **Wait for signal / Approval gate** 节点；适配器映射为 `defineSignal` + `setHandler`。本仓库示例用自定义 PaletteItem `signalWait` 承载配置字段。

#### 7.3.1 编辑器节点配置字段

| 字段 | 释义 |
|------|------|
| `eventKey` | 事件 / Signal 名称；外部 `signal(eventKey, payload)` 必须匹配 |
| `timeout` | 最大等待时长（建议 Worker 解析为 `30s` / `24h` 等） |
| `timeoutMode` | `fail`：整单失败；`continue`：继续并打超时标记；`throw`：抛错（由 `errorPolicy` 再处理） |
| `timeoutAlias` | 超时标记写入上下文的变量名（如 `auditTimeout`） |
| `eventPayloadAlias` | 外部 payload 挂载名（如 `approvePayload`） |

#### 7.3.2 Temporal：等待 Signal + 超时（可运行于 Temporal Workflow）

```ts
import {
  defineSignal,
  setHandler,
  condition,
  ApplicationFailure,
} from '@temporalio/workflow';

/** 与节点 properties.eventKey 对齐 */
export const approveSignal = defineSignal<[ApprovePayload]>('approve_signal');

type ApprovePayload = { pass: boolean; comment?: string };

/**
 * 对应 awaitEvent / signalWait 节点语义
 */
export async function waitApprove(params: {
  timeout: string; // 如 '24 hours' | '30 seconds'
  timeoutMode: 'fail' | 'continue' | 'throw';
}): Promise<{ timedOut: boolean; payload: ApprovePayload | null }> {
  let payload: ApprovePayload | null = null;

  setHandler(approveSignal, (p) => {
    payload = p;
  });

  // 等到有 payload，或超时
  const ok = await condition(() => payload !== null, params.timeout);

  if (!ok) {
    // 超时
    if (params.timeoutMode === 'fail' || params.timeoutMode === 'throw') {
      throw ApplicationFailure.nonRetryable('signal wait timeout', 'SIGNAL_TIMEOUT');
    }
    // continue：带超时标记继续
    return { timedOut: true, payload: null };
  }

  return { timedOut: false, payload };
}
```

#### 7.3.3 外部发送 Signal（Client / 后端 API）

```ts
import { Client } from '@temporalio/client';

const client = new Client();

// 1. 已由后端 submit 启动 Execution，拿到 workflowId（如 execution-<id>）
const handle = client.workflow.getHandle('execution-AP20260820001');

// 2. 外部系统（审批中心）发送信号唤醒
await handle.signal('approve_signal', {
  pass: true,
  comment: '审批通过',
});

// 发送成功后，Workflow 从 condition 返回，继续后续节点
```

**执行状态变化：**

执行到 signalWait → Temporal 等待 Signal / Timer → Worker 释放 → 收到 Signal 或超时后继续。

**`timeoutMode = continue` 时：**

- 不失败整单；  
- 上下文设置超时标记（如 `auditTimeout = true`）；  
- **`eventPayload` 可能为 `null`**，业务必须先判断超时再读 payload。

---

### 7.4 事件 + 条件分支综合示例（审批通过 / 驳回 / 超时）

编辑器用 **signalWait → decision（多出口）→ notification**，扁平 `nodes` + `edges`（不要嵌套 `type: "if"` 内嵌 nodes）。

语义对应：

```text
wait audit_signal (timeout 30s, continue)
  → if auditTimeout → 超时驳回通知
  → else if auditResult.pass → 通过通知
  → else → 驳回通知
```

完整可编辑图见本章 **7.7** / `src/examples/Ch7AsyncWaitDemo.tsx`。

决策节点在执行侧根据 `timedOut` / `payload.pass` 选择 `nextPort`（与第 6 章 Decision 一致）。

---

### 7.5 实例元数据、标签、查询 API

编辑器保存的 Graph 可带业务扩展字段（SDK 核心类型为 `IntegrationDataFormat`；`meta` / `tags` 可作为你后端存储的附加列）：

```ts
// 保存回调里一并写入你们的 DB
onDataSave: async (graph) => {
  await api.save({
    ...graph,
    meta: { businessDomain: 'approval', owner: 'biz-team-a' },
    tags: ['audit', 'apply-v1'],
  });
  return 'success';
};
```

#### Temporal / 参考后端查询能力

```ts
import { Client, WorkflowExecutionStatusName } from '@temporalio/client';

const client = new Client();

/** 按 Workflow Type / 状态列出（具体 API 以你们 Backend 封装为准） */
// 参考后端常见 REST：GET /executions?status=RUNNING&limit=20

/** 单个 Execution */
const handle = client.workflow.getHandle(workflowId);
const desc = await handle.describe();
// desc.status.name → RUNNING | COMPLETED | FAILED | CANCELLED | …

/** 查询（Query）：需在 Workflow 内 defineQuery */
// const state = await handle.query('getStatus');

/** 终止 */
await handle.terminate('ops force stop');

/** 取消（可配合 CancellationScope 做清理） */
await handle.cancel();
```

**实例视图字段（产品层建议模型，后端组装）：**

```ts
/** 业务侧 Instance DTO（非 @workflowbuilder/sdk 导出） */
interface WorkflowInstanceView {
  id: string;
  workflowName: string;       // 对应编辑器 name / 定义 id
  version?: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  input: Record<string, unknown>;
  /** 执行上下文 / 节点输出摘要 */
  context?: Record<string, unknown>;
  output?: Record<string, unknown>;
  startTime: string;
  endTime?: string;
  tags?: string[];
  meta?: Record<string, string>;
  nodeExecutionHistory?: Array<{
    nodeId: string;
    status: string;
    startTime: string;
    endTime?: string;
    error?: unknown;
  }>;
}
```

参考栈通过 `EventEmitterPort` 发出 `node_started` / `node_completed` / `node_failed` / `execution_*`，后端可据此填充 `nodeExecutionHistory`。

「手动 suspend / resume」在 Temporal 中通常表现为：**等待 Signal 即挂起**；额外运维暂停可用自建 Signal（如 `ops_pause`）或 Cancel，而不是虚构的 `workflowRunner.suspend` 全局 API 名——以你们 Backend 封装为准。

---

### 7.6 重点坑点

1. **外部等待必须持久化引擎（Temporal）**；内存模式重启后挂起实例丢失，无法再 Signal。  
2. **Signal 按 Workflow Execution** 投递，不能指望一个 Signal 唤醒所有实例；每个实例独立 `getHandle(workflowId)`。  
3. **Signal 发送早于等待节点**：Temporal 可将 Signal 缓冲到 Workflow 邮箱；仍建议业务保证「实例已进入等待」或使用可查询状态，避免竞态下的产品误解。  
4. **`terminate` 强制结束**，不会自动跑你的业务兜底子图；需要补偿请用 Signal 走错误分支或 `errorPolicy`。  
5. **`timeoutMode=continue`** 时必须先判断超时标记，超时下 payload 常为 `null`。  
6. 编辑器 `delay` 的 `timeUnits` Demo 选项主要是 `minutes` / `hours`；秒级延时由 Worker 解析自定义字段或换算。

---

### 7.7 本章完整可运行示例（本仓库）

| 文件 | 说明 |
|------|------|
| `src/examples/Ch7AsyncWaitDemo.tsx` | Trigger → Delay → signalWait → Decision 三路 → Notification |
| `src/App.tsx` | `export { default } from './examples/Ch7AsyncWaitDemo'` |

```bash
npm run dev
```

**可验证：**

1. 画布预置长流程等待拓扑；  
2. 选中「等待人工审批」，可改 `eventKey` / `timeout` / `timeoutMode`；  
3. 左侧可拖 Demo `delay` 与自定义 `signalWait`；  
4. 保存后控制台打印 Graph，并提示 Temporal `signal` 伪代码。  

> 浏览器不会真正 sleep 30s 或收 Signal；接参考栈后端后，用 Client `handle.signal('approve_signal', payload)` 唤醒。

---

## 第 8 章：TypeScript SDK 完整使用指南、动态节点、表达式、最小可运行 Demo

全部内容对齐官方编辑器 SDK + 参考执行栈。可直接在本仓库 Vite + React 工程运行编辑器示例；Temporal / `runGraph` 片段在 Worker 工程运行。

### 8.1 SDK 核心模块总览

#### A. 编辑器包 `@workflowbuilder/sdk`（本仓库使用）

| 模块 / 导出 | 作用 |
|-------------|------|
| `WorkflowBuilder` | 命名空间：`Root` / `Canvas` / `Palette` / `PropertiesPanel` / `DefaultLayout` / `TopBar` |
| `PaletteItem` / `nodeTypes` | 节点类型定义与左侧面板注册 |
| `getStoreDataForIntegration` / `getStoreNodes` / `setStoreNodes` … | 读写画布、导出保存载荷 |
| `useWorkflowBuilderActions` | save、只读、主题、布局方向 |
| `useStore` | 订阅文档名、nodes 等 |
| `sharedProperties` / `errorPolicyProperty` / `getScope` / `getHandleId` | 建节点 schema / handle 工具 |
| `registerComponentDecorator` / `registerFunctionDecorator` | 插件扩展 |
| 类型 | `IntegrationDataFormat`、`WorkflowBuilderNode`、`WorkflowBuilderEdge`、`NodeSchema`、`UISchema` … |

#### B. 执行包（参考栈，非本仓库依赖）

| 模块 | 作用 |
|------|------|
| `@workflow-builder/execution-core` | `runGraph`、端口、**`resolveTemplate`（`{{…}}`）** |
| Temporal Client / Worker | 启动、Signal、Query、Cancel、Timer |
| 参考 Backend REST | 注册图、提交执行、查实例 |

两种开发模式：

1. **可视化声明**：在画布上拖节点，保存 `IntegrationDataFormat`（前几章主路径）。  
2. **代码动态构建**：用 TS 动态生成 `PaletteItem[]` / `initialNodes`，或后端动态拼执行用 `BaseNode[]`——**不是**虚构的 `new WorkflowBuilder(id).addNode().build()` Runner DSL；编辑器侧的 `WorkflowBuilder` 是 **React 组件命名空间**。

---

### 8.2 环境引入 & 最小初始化

```bash
# 本仓库：编辑器
npm install @workflowbuilder/sdk @xyflow/react zustand

# 参考执行栈（另仓 synergycodes/workflowbuilder）：
# pnpm install && 启动 backend + execution-worker + Temporal
```

```tsx
import { WorkflowBuilder } from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';
import { demoPaletteItems } from './palette';

export default function App() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="minimal-editor"
        layoutDirection="DOWN"
        nodeTypes={demoPaletteItems}
        integration={{
          strategy: 'props', // 另有 localStorage | api
          onDataSave: async (graph) => {
            // 交给你们的 Backend / Temporal submit
            console.log(graph);
            return 'success';
          },
        }}
      />
    </div>
  );
}
```

**集成策略（编辑器持久化，不是 Temporal 实例持久化）：**

| strategy | 行为 |
|----------|------|
| `localStorage` | 默认；浏览器本地读写图 |
| `props` | `initialNodes`/`initialEdges` + `onDataSave` |
| `api` | `GET load` / `POST save` |

**执行侧 Runner 配置（Temporal Worker，示意）：**

```ts
// 参考 apps/execution-worker —— 用 Temporal 连接，而非 new WorkflowRunner({ driver: 'memory' })
// Worker 连接 TEMPORAL_ADDRESS；DB 存 execution 事件
// Activity：startToCloseTimeout + retry.maximumAttempts（见第 5 章）
```

---

### 8.3 动态 Workflow & 动态节点

**动态 Palette（前端低代码）：** 运行时根据权限 / 租户生成 `nodeTypes`。

```tsx
const nodeTypes = useMemo(() => {
  const items = [...basePalette];
  if (featureFlags.approval) items.push(signalWaitNode);
  if (tenant === 'order') items.push(orderPayNode);
  return items;
}, [featureFlags, tenant]);

<WorkflowBuilder.Root nodeTypes={nodeTypes} … />
```

**动态初始图：** 根据表单生成 `initialNodes` / `initialEdges`，或挂载后 `setStoreNodes` / `setStoreEdges`。

**动态节点 config：** 不必改定义；属性里用 **变量插值** `{{ nodes.trigger.output.xxx }}`，执行期 `resolveTemplate` 替换。HTTP URL / body 均可在属性面板用 `VariableText` 绑定。

**后端动态定义：** 组装 `BaseNode[]` + edges 交给 `runGraph` / Temporal `submit`，与编辑器 JSON 同源或由服务端生成。

---

### 8.4 表达式 / 模板语法

#### 8.4.1 编辑器与执行核心：`{{ … }}`（官方 Variable Picker）

执行核心 `resolveTemplate` 支持（见 execution-core README）：

| 形式 | 路径为 `undefined` 时 |
|------|----------------------|
| `{{nodes.x.response}}` | 抛错（严格） |
| `{{nodes.x.response?}}` | 替换为 `''` |
| `{{nodes.x.response \| default:'tbd'}}` | 使用默认字面量 |

编辑器中在 **`VariableText` / `VariableTextArea`** 输入 `{{` 打开变量选择器。

```ts
// uischema 示例
{
  type: 'VariableText',
  scope: '#/properties/greetMsg',
  label: '问候语',
  placeholder: 'Hello {{ 输入双花括号选择变量',
}
```

#### 8.4.2 常见写法（对照业务表达需求）

```text
{{nodes.n-trigger.output.username}}
{{nodes.n-wait.output.approvePayload.pass}}
{{nodes.n-http.output.error.message?}}
{{nodes.n-http.output.result | default:'none'}}
```

复杂三元 / 数组展开等：**优先在节点 executor 或上游 set 变量节点中算完**，再把结果写入 output，供下游 `{{ }}` 引用。不要假设存在独立的 `ExpressionEvaluator` + `${ctx…}` 官方编辑器包导出。

#### 8.4.3 若自研表达式层

可在 Worker 内嵌入安全表达式库；须禁止 `eval`、原生对象逃逸。官方参考路径仍是 **`resolveTemplate` + 节点内逻辑**。

---

### 8.5 版本管理、定义 CRUD

编辑器侧：每次保存得到一份 Graph；版本由**你们的 Backend** 管理（表字段 `workflowId + version`）。

```ts
// 后端示意（非 SDK 内置 WorkflowRunner）
await api.registerDefinition({ id: 'order_flow', version: '1.0.0', graph });
await api.registerDefinition({ id: 'order_flow', version: '2.0.0', graph });

const v1 = await api.getDefinition('order_flow', '1.0.0');
const latest = await api.getLatestDefinition('order_flow');

// 删除定义：不杀已跑实例；仅禁止新 start 使用该版本
await api.removeDefinition('order_flow', '1.0.0');

// 启动时显式带 version（生产强烈建议）
await api.start({ workflowId: 'order_flow', version: '1.0.0', input });
```

规则：

1. 已运行实例继续使用启动时的定义快照 / 版本。  
2. 不传 version 时后端可默认 latest；生产请显式版本。  
3. 画布「校验」：节点 schema 校验 + 可选 Validation 插件；完整拓扑校验可在 `onDataSave` 或后端 `validateGraph(graph)` 完成。

```ts
onDataSave: async (graph) => {
  const result = await api.validateGraph(graph);
  if (!result.valid) {
    console.error(result.errors);
    throw new Error('invalid graph');
  }
  await api.save(graph);
  return 'success';
};
```

---

### 8.6 完整最小可运行工程（本仓库编辑器）

见 **8.8** / `src/examples/Ch8SdkGuideDemo.tsx`：动态 Palette、`VariableText`、`getStoreDataForIntegration`、`useWorkflowBuilderActions`。

**Temporal 最小 Workflow 片段（另仓 Worker）：**

```ts
import { proxyActivities, sleep } from '@temporalio/workflow';
import { runGraph } from '@workflow-builder/execution-core/workflow';

const acts = proxyActivities({
  startToCloseTimeout: '10m',
  retry: { maximumAttempts: 2 },
});

export async function runWorkflow(input: /* WorkflowExecutionInput */) {
  // 可选：图中 delay 由 executor 调 sleep
  // await sleep('1 minute');
  const outcome = await runGraph(input, { executeNode: acts.executeNode }, events);
  // …
}
```

---

### 8.7 重点避坑

1. 模板用 **`{{nodes.…}}` 点路径**；缺省用 `?` 或 `default:`。  
2. 严格模式下缺失路径会失败，可选字段请用 `?`。  
3. 注册 / 保存前做 **图校验**（id 唯一、必填属性、连线合法）。  
4. **localStorage / memory** 只适合编辑器草稿或短测；长等待与 Signal 必须上 Temporal。  
5. 不要在前端用「等待实例完成」死等人工审批；改为 webhook / 轮询状态 / 消息通知。  
6. `WorkflowBuilder` 在 npm 包里是 **UI 命名空间**，不要写成 `new WorkflowBuilder().addNode()` Runner DSL。

---

### 8.8 本章完整可运行示例（本仓库）

| 文件 | 说明 |
|------|------|
| `src/examples/Ch8SdkGuideDemo.tsx` | 动态增减 Palette、问候节点 VariableText、导出 Graph、主题/只读 |
| `src/App.tsx` | `export { default } from './examples/Ch8SdkGuideDemo'` |

```bash
npm run dev
```

**可验证：**

1. 左侧出现 Demo 节点 +「动态问候」；点工具栏可动态移除/加回；  
2. 拖入问候节点，在「问候语」用 `{{` 试变量选择器；  
3. 「导出 Graph」/「保存」在控制台打印 `IntegrationDataFormat`；  
4. 切换深浅色、只读。  

---

### 本章小结

**第 7 章**

1. 内部等待：`delay` 节点 → Temporal `sleep`。  
2. 外部等待：`signalWait` / approval 配置 → `defineSignal` + `condition`（可超时）。  
3. 查询 / 终止：Temporal Describe / Query / Terminate；Backend 组装 Instance 视图。  
4. 可运行编辑器示例：`Ch7AsyncWaitDemo.tsx`。

**第 8 章**

1. 核心包是 `@workflowbuilder/sdk`（编辑器）+ execution-core / Temporal（执行）。  
2. 动态能力：动态 `nodeTypes` / `initialNodes` + 模板变量。  
3. 表达式：官方执行模板为 `{{ }}`，不是独立 `${}` Evaluator 包。  
4. 可运行编辑器示例：`Ch8SdkGuideDemo.tsx`。

---

## 附录：本仓库文件

| 文件 | 作用 |
|------|------|
| `src/App.tsx` | 切换 Ch5–Ch8 示例入口 |
| `src/examples/Ch7AsyncWaitDemo.tsx` | 第 7 章完整示例 |
| `src/examples/Ch8SdkGuideDemo.tsx` | 第 8 章完整示例 |
| `src/nodes/delay/**` | Demo 延时节点 |
| `docs/workflow-builder-learning-ch5-ch6.md` | 错误处理与控制流 |

## 附录：官方入口

- Temporal 集成：https://www.workflowbuilder.io/integrations/temporal  
- Variable Picker：https://www.workflowbuilder.io/docs/guides/use-variable-picker/  
- Delay 节点（Demo）：本仓库 `src/nodes/delay`  
- execution-core 模板：https://github.com/synergycodes/workflowbuilder/blob/main/packages/execution-core/README.md  

---

*第 9–10 章（生产运维、售后综合案例、自定义节点）见：`docs/workflow-builder-learning-ch9-ch10.md`。*
