# Workflow Builder 完整学习资料（第 9 章 + 第 10 章）

基于官方生产运维实践、`@workflowbuilder/sdk`、参考栈（Temporal + Postgres + execution-core）。前序章节见同目录其它文档。

- **参考栈：** https://www.workflowbuilder.io/reference-stack  
- **Temporal：** https://www.workflowbuilder.io/integrations/temporal  
- **自定义节点（编辑器）：** https://www.workflowbuilder.io/docs/guides/add-a-custom-node/  
- **execution-core：** https://github.com/synergycodes/workflowbuilder/blob/main/packages/execution-core/README.md  

> **分层**  
> - **编辑器 / 本仓库：** 画布、PaletteItem、保存 Graph。  
> - **生产执行：** Temporal Worker + 参考 Backend（Postgres 存执行事件）；**不要**用内存驱动承载 await / Signal。

---

## 第 9 章：生产部署、存储、监控、权限、排错、调试 & 业务综合案例

本章面向上线落地：配置原则、排错、真实售后业务 Graph。

### 9.1 生产环境部署总原则

1. **禁止用内存态执行引擎上线**：本地可用 Temporal 开发集群或 in-memory 仅作短测；生产必须持久 History。  
2. **必须持久化**：参考栈用 **Temporal + Postgres**（执行事件 / 状态）；编辑器图定义另存业务 DB。不是在 Graph JSON 里写 `persistence.enable=true`。  
3. **水平扩展**：多 Worker 轮询同一 Task Queue；Temporal 负责任务分配与去重，无需自研中心调度。  
4. **定时器 / Signal**：由 Temporal 集群处理；多 Worker 不会重复 fire 同一 Timer。  
5. **业务幂等**：用 **Workflow Id / Execution Id**（或售后单号）作幂等键，Activity 内防重复退款。

#### 9.1.1 生产配置示例（Temporal Worker + Backend，TS）

```ts
/**
 * 参考 apps/execution-worker —— 连接 Temporal，而非虚构的 WorkflowRunner({ driver: 'mysql' })
 * 首次部署：docker compose 起 Temporal + Postgres；Backend 跑 migration（Drizzle 等）
 */
import { NativeConnection, Worker } from '@temporalio/worker';
import { createConsoleLogger } from '@workflow-builder/execution-core'; // 参考栈包名

const logger = createConsoleLogger(
  { component: 'execution-worker' },
  { pretty: process.env.NODE_ENV !== 'production' },
);

async function bootstrap() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
    taskQueue: 'workflow-execution', // 与 Backend TemporalEngine 一致
    workflowsPath: require.resolve('./engines/temporal/workflows'),
    activities: {
      /* executeNode / emitEvent / updateStatus */
    },
    // Activity 超时与重试见 run-workflow.ts：DB 30s/5 次；节点 10m/2 次
  });

  logger.info('worker started', { taskQueue: 'workflow-execution' });
  await worker.run();
}

bootstrap().catch((err) => {
  logger.error('worker failed', { error: { message: String(err) } });
  process.exit(1);
});
```

**Backend / DB（示意）：**

```ts
// 环境变量示例
// DATABASE_URL=postgres://wf_user:***@127.0.0.1:5432/workflow_builder
// TEMPORAL_ADDRESS=127.0.0.1:7233
// MAX_CONCURRENT_ACTIVITIES=200  // Worker 侧并发，按机器调

// 首次部署执行官方 / 参考栈 migration，典型表（名称以仓库为准）：
// executions、execution_events、（可选）workflow_definitions 业务表
await db.migrate();
```

编辑器侧生产保存建议：

```ts
integration={{
  strategy: 'api', // 或 props + 自建 API
  endpoints: { load: '/api/workflows/load', save: '/api/workflows/save' },
}}
```

---

### 9.2 日志、埋点与 Metrics

#### 9.2.1 日志适配器（LoggerPort）

参考 `execution-core` 的 `LoggerPort`：对接 pino / winston；**不要**在 `runGraph` 沙箱内打日志，应在 Activity / HTTP 路由侧打。

```ts
import type { LoggerPort, LogBindings } from '@workflow-builder/execution-core';
import pino from 'pino';

function fromPino(pinoLogger: ReturnType<typeof pino>): LoggerPort {
  return {
    debug: (message, bindings) => pinoLogger.debug(bindings ?? {}, message),
    info: (message, bindings) => pinoLogger.info(bindings ?? {}, message),
    warn: (message, bindings) => pinoLogger.warn(bindings ?? {}, message),
    error: (message, bindings) => pinoLogger.error(bindings ?? {}, message),
    child: (bindings: LogBindings) => fromPino(pinoLogger.child(bindings)),
  };
}

const logger = fromPino(pino({ level: 'info' }));

// Activity 失败时告警
logger.error('node activity failed', {
  executionId,
  nodeId,
  error: { message: '…', code: 'HTTP_5XX' },
  // type: 'workflow_instance_failed' // 业务自定义字段，便于告警路由
});
```

生命周期可观测事件（经 `EventEmitterPort`）：`execution_started/completed/failed`、`node_started/completed/failed`。

#### 9.2.2 Metrics（对接 Prometheus）

参考栈 / Temporal / 自建 Backend 暴露指标；建议核心指标：

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `workflow_instance_started_total` | Counter | 启动次数；label: workflowName、version |
| `workflow_instance_completed_total` | Counter | 成功完成 |
| `workflow_instance_failed_total` | Counter | 失败 |
| `workflow_instance_running` | Gauge | 当前运行中（含等待 Signal/Timer） |
| `workflow_node_exec_duration_seconds` | Histogram | 节点 Activity 耗时 |
| `workflow_node_retry_total` | Counter | Activity 重试次数 |
| `workflow_persistence_ops_total` | Counter | DB 读写 |
| `temporal_schedule_to_start_lag` 等 | — | 可用 Temporal 自带 metrics |

```ts
// 自建 Backend 暴露 /metrics（prom-client 示意）
import client from 'prom-client';
client.collectDefaultMetrics();
const started = new client.Counter({
  name: 'workflow_instance_started_total',
  help: 'started executions',
  labelNames: ['workflowName', 'version'],
});
// app.get('/metrics', async (req, res) => {
//   res.set('Content-Type', client.register.contentType);
//   res.end(await client.register.metrics());
// });
```

Temporal 集群本身也可开启 Prometheus 端点，监控 Worker 轮询延迟、Task 积压。

---

### 9.3 权限模型

编辑器 SDK / 参考执行核心 **不内置业务 RBAC**；在 **API 网关 / Backend** 做鉴权。

```ts
/** 启动执行前 */
app.post('/api/executions', authMiddleware, async (req, res) => {
  const { userId, roles, permits } = req.auth;
  const { workflowName, input, graph } = req.body;

  // 元数据可存 ownerUserId
  if (!permits.includes(workflowName) && !roles.includes('admin')) {
    throw new HttpError(403, 'no permission to start workflow');
  }

  const executionId = await engine.submit({ graph, input, meta: { ownerUserId: userId } });
  res.json({ executionId });
});

/** Signal 前 */
app.post('/api/executions/:id/signal', authMiddleware, async (req, res) => {
  // 校验审批人是否有权对该售后单发 after_sale_audit
  await assertCanAudit(req.auth, req.params.id);
  await handle.signal(req.body.eventKey, req.body.payload);
  res.json({ ok: true });
});

/** 查询前 */
app.get('/api/executions/:id', authMiddleware, async (req, res) => {
  await assertCanRead(req.auth, req.params.id);
  // …
});
```

最佳实践：接口层带 `userId/role`；定义或实例 `meta.ownerUserId`；钩子等价逻辑放在 HTTP 中间件，而不是虚构的 `runner.setHooks`。

---

### 9.4 调试模式 Debug Mode

| 层级 | 做法 |
|------|------|
| 编辑器 | 浏览器控制台看 `onDataSave` Graph；Validation 插件；选中节点看属性 |
| Worker / Activity | `LOG_LEVEL=debug`；LoggerPort debug；打印 nodeId、executionId（**脱敏**） |
| Temporal | Temporal UI 看 Event History、Pending Activities、Signals |
| 模板 | 缺变量时 `resolveTemplate` 抛错；用 `?` / `default:` 调试可选字段 |

```ts
// 开发
const logger = createConsoleLogger({ component: 'worker' }, { pretty: true });

// 生产务必：pretty:false、关闭逐字段上下文 dump，避免 PII 泄露
```

**执行追踪（产品 API 示意）：**

```ts
/** GET /api/executions/:id/trace —— 由 execution_events 表组装 */
type ExecutionTrace = {
  executionId: string;
  steps: Array<{
    nodeId: string;
    status: string;
    inputSummary?: unknown;
    outputSummary?: unknown;
    error?: unknown;
    startTime: string;
    endTime?: string;
  }>;
};
```

---

### 9.5 故障排查清单

#### 9.5.1 工作流挂起不继续

1. **Signal 等待**：是否已 `signal` 正确名；Workflow Id 是否匹配；用 Temporal UI 看是否 Received Signal。  
2. **Delay / Timer**：History 是否有 Timer Fired；Worker 是否在线。  
3. **DB / 事件写入失败**：Activity 重试耗尽 → 整单失败或卡住；查 Postgres / 日志。  
4. **多 Worker**：确认同一 `taskQueue`；不要自研冲突的「定时器轮询锁」覆盖 Temporal。

#### 9.5.2 模板 / 变量异常

1. `{{nodes.x.y}}` 路径不存在 → 严格模式抛错；改用 `{{nodes.x.y?}}` 或 `default:`。  
2. 数组空：上游保证 `[]`，或在 executor 内判空。  
3. 开启 debug 日志看 Activity 入参。

#### 9.5.3 重试不生效

1. Temporal `nonRetryableErrorTypes` 包含了该错误。  
2. 节点 `errorPolicy: 'continue'|'errorRoute'` 会**吸收**失败，表现为「不重试整单」——Activity 级重试仍可能发生在抛出前。  
3. `maximumAttempts: 1` 等于不重试。

#### 9.5.4 子工作流失败

1. Child Workflow Id / Task Queue 是否注册。  
2. `inputMapping` 是否映射错字段。  
3. 父节点是否配置 `errorPolicy` 捕获子失败。

#### 9.5.5 FAILED 但看不到报错

1. 查 `node_failed` / `execution_failed` 事件与 Temporal Failure message。  
2. 查 Activity 日志 `error.message` / `code`。  
3. 图上错误边 / `errorPolicy` 是否把失败「吃掉」却未打日志节点。

---

### 9.6 生产级综合案例：订单售后审批流程

**业务：**

1. 接收售后申请；  
2. 金额 **> 1000** → 人工审批 Signal（最长 24h，超时按驳回）；**≤ 1000** → 自动通过；  
3. 通过则调退款 HTTP（Activity 重试 + `errorPolicy: continue` 兜底）；  
4. 全流程由 Temporal 持久化；异常靠事件与日志；输出售后结果。

编辑器用**扁平** `nodes` + `edges` + `decision` / `signalWait` / `biz:refundHttp`（见 **9.8** 可运行示例）。

**执行侧输入：**

```ts
await api.start({
  workflowName: 'after_sale_workflow',
  version: '1.0.0',
  input: {
    afterSaleNo: 'AS20260820001',
    orderAmount: 1500,
    userId: 'U10086',
  },
});

// 人工审批
await handle.signal('after_sale_audit', {
  pass: true,
  comment: '同意退款',
});
```

**退款 Activity 重试（Worker）：**

```ts
const nodeActivities = proxyActivities({
  startToCloseTimeout: '8s',
  retry: {
    maximumAttempts: 2,
    initialInterval: '1s',
    backoffCoefficient: 1,
  },
});
```

**全局兜底：** 图上 `errorPolicy` + 失败通知节点，或 Backend 订阅 `execution_failed` 告警——不必使用虚构的顶层 `onError.nodes` JSON 块。

---

### 9.7 官方限制与边界（落地建议）

1. 实例上下文 / History 载荷避免超大对象（建议 **≪ 1MB** 业务大字段）；大对象外置 DB，上下文只存 ID。  
2. 循环必须 **maxIterations**（自定义 loop 或 Temporal 循环上限）。  
3. 并行扇出不宜过大（如数十上百），注意 Activity 槽位与 DB 事件量。  
4. 模板 **`{{ }}` 不做任意 JS**；复杂逻辑放自定义节点 / Activity。  
5. 编辑器与执行引擎版本、节点 `type` 字符串必须与 Worker registry **同时发布**。

---

### 9.8 本章完整可运行示例（本仓库）

| 文件 | 说明 |
|------|------|
| `src/examples/Ch9AfterSaleDemo.tsx` | 售后审批完整画布：金额 Decision → SignalWait → 审批 Decision → 退款 / 跳过 → 结束 |
| `src/App.tsx` | `export { default } from './examples/Ch9AfterSaleDemo'` |

```bash
npm run dev
```

保存 Graph 后控制台有 start / signal 提示。真正退款与 24h 等待在 Temporal Worker。

---

## 第 10 章：自定义节点完整开发教程

依据官方 [Add a custom node](https://www.workflowbuilder.io/docs/guides/add-a-custom-node/)：编辑器 **PaletteItem（schema + uischema）** + Worker **NodeExecutor**。

### 10.1 自定义节点总览

当 Demo / 内置形态不够时扩展节点。

**两种运行形态：**

1. **同步：** Activity / executor 算完立即返回（税额、转换）。  
2. **异步挂起：** 提交外部任务后 Workflow `condition` 等 Signal（导出回调）；**不要**在 Activity 里 `while` 长阻塞。

**约束：**

- 编辑器节点跑在浏览器，只负责配置；**业务执行在 Worker**。  
- 模板不做任意脚本；逻辑进 Node / Activity。  
- 错误：`errorPolicy` + Temporal Activity `retry`（见第 5 章）。

**双端契约：**

```ts
/** 编辑器：PaletteItem.type === 执行层 BaseNode.type */
type: 'biz:calcOrderTax'

/** 编辑器 properties ↔ 执行层 config（由适配器映射） */
properties: { amount, taxRate, errorPolicy, label, … }
```

```ts
/** Worker 注册（execution-core） */
const registry: NodeExecutorRegistry<MyNode> = {
  'biz:calcOrderTax': (node, ctx) => {
    // return calcOrderTax({ amount: node.config.amount, taxRate: node.config.taxRate })
  },
  // …
};
```

---

### 10.2 实战：同步节点 `biz:calcOrderTax`

#### 10.2.1 纯业务逻辑（可单测）

```ts
// src/nodes/biz-calc-order-tax/calc-order-tax.ts
export function calcOrderTax(input: { amount: number; taxRate: number }) {
  const { amount, taxRate } = input;
  if (typeof amount !== 'number' || amount < 0) {
    throw new Error(`金额非法 amount=${amount}`);
  }
  if (typeof taxRate !== 'number' || taxRate < 0 || taxRate > 1) {
    throw new Error(`税率非法 taxRate=${taxRate}`);
  }
  const tax = amount * taxRate;
  return { originalAmount: amount, tax, totalAfterTax: amount + tax };
}
```

#### 10.2.2 编辑器 PaletteItem

见 `src/nodes/biz-calc-order-tax/calc-order-tax-node.ts`：`schema` + `uischema` + `errorPolicyProperty` + `outputSchema`。

```ts
import { calcOrderTaxNode } from './nodes/biz-calc-order-tax/calc-order-tax-node';

<WorkflowBuilder.Root
  nodeTypes={[...demoPaletteItems, calcOrderTaxNode]}
  …
/>
```

#### 10.2.3 Worker 注册

```ts
import { calcOrderTax } from './calc-order-tax';

registry['biz:calcOrderTax'] = (node) => {
  const { amount, taxRate } = node.config as { amount: number; taxRate: number };
  return calcOrderTax({ amount, taxRate });
};
```

节点输出供下游：`{{nodes.calc_tax_node.output.tax}}`。

---

### 10.3 在 Graph 中使用

预置图见 **10.8**。保存后 `data.type === 'biz:calcOrderTax'`。

启动（Backend）：

```ts
await api.start({
  workflowName: 'use_custom_node_demo',
  input: { /* 若 amount 来自 trigger，由 executor 读上游 output */ },
});
```

---

### 10.4 异步自定义节点（Signal 唤醒）

**适用：** 提交异步导出后等回调。

**编辑器：** PaletteItem 配置 `fileTemplate`、`eventKeyPrefix` 等。

**Worker / Workflow：**

```ts
import { defineSignal, setHandler, condition } from '@temporalio/workflow';

// 1) Activity：只负责提交任务，快速返回 taskId
async function submitExport(template: string, executionId: string) {
  return await fileExportService.submit({ template, executionId });
}

// 2) Workflow 片段（或图节点适配器）
const exportDone = defineSignal<[ExportPayload]>('export_finish');
let payload: ExportPayload | null = null;
setHandler(exportDone, (p) => {
  payload = p;
});

const taskId = await activities.submitExport(template, executionId);
// 动态 signal 名也可用约定：export_finish_${taskId} —— 需 Client 侧一致
await condition(() => payload !== null, '24 hours');
// payload 作为该步骤 output 写入 nodeOutputs
```

**外部回调：**

```ts
await handle.signal('export_finish', {
  success: true,
  downloadUrl: 'https://cdn.example.com/file/xxx',
});
```

不要用返回值 `{ isAwait: true }` 的虚构 Runner 协议——以 **Temporal Signal** 为准。

---

### 10.5 单元测试

对本仓库纯函数（Node 内置 test runner）：

```bash
npm run test:nodes
# 测试文件：src/nodes/biz-calc-order-tax/calc-order-tax.test.mjs
# 逻辑源文件以 calc-order-tax.ts 为准；.mjs 为 node:test 可加载副本
```

```js
// calc-order-tax.test.mjs 摘要
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calcOrderTax } from './calc-order-tax.mjs';

describe('biz:calcOrderTax', () => {
  it('正常计算', () => {
    const out = calcOrderTax({ amount: 1000, taxRate: 0.06 });
    assert.equal(out.tax, 60);
    assert.equal(out.totalAfterTax, 1060);
  });
});
```

Executor 集成测试可在参考栈用 mock `ActivityRunnerPort` 跑 `runGraph`（见 execution-core 测试）。

---

### 10.6 UI 表单（schema + uischema）

官方用 **JsonForms**：`schema` 管校验，`uischema` 管控件（`Text` / `Select` / `VariableText` / `Switch` …）。

自定义控件：

```ts
// jsonForm={{ renderers: [colorPickerRenderer] }}
// rankWith + uiTypeIs('ColorPicker') —— 见官方 Custom JsonForms control
```

「表达式输入」在编辑器中对应 **`VariableText` / `VariableTextArea`**，而不是非标 `x-ui:widget` 字段名（若自研低代码可另约定）。

---

### 10.7 自定义节点避坑清单

1. **`type` 全局唯一**，建议 `biz:` 前缀。  
2. **Activity 禁止长 sleep**；长等用 Signal / Workflow `sleep`。  
3. 业务错误 **`throw`**，由 Activity retry / `errorPolicy` 处理。  
4. 优先 **返回 output**，少改共享可变上下文。  
5. **输出勿塞大对象**，存 ID。  
6. 金额等表达式：面板用数字或 `VariableText`；在 executor 内解析上游 output。  
7. Signal **名与 payload** 与等待方一致。  
8. **先注册 Palette / Worker registry，再加载含该 type 的图**。  
9. `nodeTemplates` 映射若自定义外观，key 必须等于 `type`。

---

### 10.8 完整工程目录（本仓库落地）

```text
src/
├── App.tsx
├── palette.ts
├── examples/
│   ├── Ch9AfterSaleDemo.tsx      # 第 9 章综合案例
│   └── Ch10CustomNodeDemo.tsx    # 第 10 章自定义节点
├── nodes/
│   ├── biz-calc-order-tax/
│   │   ├── calc-order-tax.ts           # 纯函数（源）
│   │   ├── calc-order-tax.mjs          # ESM 副本（单测加载）
│   │   ├── calc-order-tax-node.ts      # PaletteItem
│   │   └── calc-order-tax.test.mjs     # 单测
│   ├── delay/ …                        # Demo 节点
│   └── …
└── …
```

参考栈另仓：

```text
apps/execution-worker/src/
  domain/*-nodes.ts      # BaseNode 联合类型
  executors/*.ts
  activities/*.ts
```

---

### 10.9 本章完整可运行示例（本仓库）

| 文件 | 说明 |
|------|------|
| `src/examples/Ch10CustomNodeDemo.tsx` | 注册 `biz:calcOrderTax`，预置 trigger → 计税 → notification；「本地试算」按钮 |
| `src/nodes/biz-calc-order-tax/*` | 节点定义 + 单测 |

```bash
npm run dev
# 另开终端：
npm run test:nodes
```

---

### 本章小结

**第 9 章**

1. 生产：Temporal + DB，禁内存长跑；幂等用 Execution / 业务单号。  
2. 日志用 LoggerPort；Metrics 自建或 Temporal；权限在 API 层。  
3. 排错看 Temporal UI + execution 事件。  
4. 售后案例：`Ch9AfterSaleDemo.tsx`。

**第 10 章**

1. 自定义节点 = **PaletteItem + Worker executor**（共享纯函数）。  
2. 异步 = Temporal Signal，而非阻塞 Activity。  
3. 单测测纯函数；UI 用 schema/uischema。  
4. 示例：`Ch10CustomNodeDemo.tsx` + `calc-order-tax.test.mjs`。

---

## 附录

| 资源 | 说明 |
|------|------|
| `docs/workflow-builder-learning-ch7-ch8.md` | Signal / Delay / SDK |
| `docs/workflow-builder-learning-ch5-ch6.md` | errorPolicy / 控制流 |
| Reference Stack | 生产拓扑参考 |

---

*第 11 章（对接 Java Temporal）见：`docs/workflow-builder-learning-ch11.md`。*
