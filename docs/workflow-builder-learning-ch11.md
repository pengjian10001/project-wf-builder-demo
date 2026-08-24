# Workflow Builder 完整学习资料（第 11 章）

对接 **Java Temporal** 持久化工作流引擎：概念、适配模型、原语映射、可运行桥接工程、生产落地。

前序章节见同目录 `ch1–ch10`。官方说明：编辑器与 Temporal **无强制绑定**，需自建桥接层——https://www.workflowbuilder.io/integrations/temporal

- **编辑器输出：** `IntegrationDataFormat`（`@workflowbuilder/sdk`）  
- **执行引擎：** Temporal Java SDK  
- **本仓库桥接 Demo：** `java-temporal-bridge/`  
- **前端导出 Demo：** `src/examples/Ch11ExportDslToJavaDemo.tsx`

---

## 第 11 章：对接 Java 版 Temporal 持久化工作流引擎

### 11.1 整体架构概念

- **Workflow Builder 职责：** 可视化编排、节点 schema / uischema、插件；输出标准化 **Graph JSON**（`IntegrationDataFormat`：`name` / `nodes` / `edges` / `layoutDirection` / `globalVariables`）。  
- **Temporal Java：** 服务端持久化调度、宕机恢复、Signal / Timer、Activity 重试与超时、Event History。  
- **桥接层核心任务：**
  - 将 Builder JSON → Temporal Workflow 可执行模型；  
  - 把 `delay`、Signal 等待、Decision/Conditional、循环、`errorPolicy` 映射到 Temporal 原语；  
  - 模板变量：执行侧用 `{{nodes…}}`（execution-core）或 Java 侧等价解析；  
  - 把 Temporal 实例状态 / History 回写，供上层查询展示。

**重要：** Temporal Java SDK **不直接**执行第三方 DSL。两种主流落地模式：

1. **翻译生成模式：** DSL → 生成 Java Workflow 源码 → 编译注册 Worker（流程稳定时适用）。  
2. **通用解释 Workflow（推荐，本章采用）：** 固定一个 `DslInterpreterWorkflow`，把 Builder JSON 当入参，在 Java 内解释执行，**无需每次改流程都重新编译业务 Workflow 类**。

---

### 11.2 环境依赖（Java Temporal SDK Maven）

见 `java-temporal-bridge/pom.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.demo.workflow</groupId>
    <artifactId>temporal-bridge-demo</artifactId>
    <version>1.0-SNAPSHOT</version>

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <temporal.version>1.24.1</temporal.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>io.temporal</groupId>
            <artifactId>temporal-sdk</artifactId>
            <version>${temporal.version}</version>
        </dependency>
        <dependency>
            <groupId>io.temporal</groupId>
            <artifactId>temporal-testing</artifactId>
            <version>${temporal.version}</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-databind</artifactId>
            <version>2.15.2</version>
        </dependency>
        <dependency>
            <groupId>org.slf4j</groupId>
            <artifactId>slf4j-simple</artifactId>
            <version>2.0.13</version>
        </dependency>
    </dependencies>
</project>
```

---

### 11.3 关键原语映射（Workflow Builder → Temporal Java）

| Workflow Builder / 图语义 | Temporal Java |
|---------------------------|---------------|
| `delay` 节点 | `Workflow.sleep(Duration)` |
| Signal 等待（signalWait / approval） | `Workflow.await(Duration, () -> flag)` + `@SignalMethod` |
| `conditional` / `decision` | Workflow 内 `if/else` + 选边 / `nextPort` |
| 循环（自定义 loop） | `while` + `maxIterations`；等待用 `await`/`sleep` |
| HTTP / 业务任务节点 | `@ActivityInterface` + `ActivityOptions`（超时、重试） |
| `errorPolicy: continue/errorRoute/fail` | try/catch + 是否继续调度 / 失败结束 |
| 节点 `properties` / 上下文 | Workflow 本地 `Map` + Activity 入参 |
| 业务标签过滤 | Temporal **Search Attributes** |
| 子工作流 | `ChildWorkflowStub` |

**限制：** 自定义 `data.type` 必须在 Java 侧有 Activity / SPI 处理器，否则无法执行。

---

### 11.4 TypeScript：导出 Builder DSL JSON

不要使用虚构的 `new WorkflowBuilder().activity().awaitEvent()` 链式 Runner API。正确做法：画布保存 **`IntegrationDataFormat`**，或代码组装同等 JSON。

```tsx
import { getStoreDataForIntegration } from '@workflowbuilder/sdk';

// 在 Root 子组件内
const graph = getStoreDataForIntegration();
const dslJson = JSON.stringify(graph);
// HTTP / MQ 发给 Java：POST /api/temporal/start { dslJson, input }
```

本仓库一键导出：`src/examples/Ch11ExportDslToJavaDemo.tsx`（见 **11.10**）。

约定节点 id（与 Java Demo 对齐）：

| node id | 含义 |
|---------|------|
| `submit_apply` | Activity `submitApplication` |
| `wait_audit` | 等待 `auditSignal` |
| `audit_branch` | 分支点 |
| `notify_pass` / `notify_reject` | 通知 Activity |

---

### 11.5 Java：通用解释 Workflow（可运行）

完整源码在 `java-temporal-bridge/src/main/java/com/demo/temporal/`。

#### 11.5.1 Activity 接口

```java
@ActivityInterface
public interface BizActivity {
    @ActivityMethod
    void submitApplication(Map<String, Object> input);

    @ActivityMethod
    void notifyPass(Map<String, Object> input);

    @ActivityMethod
    void notifyReject(Map<String, Object> input);
}
```

#### 11.5.2 Activity 实现

```java
public class BizActivityImpl implements BizActivity {
    @Override
    public void submitApplication(Map<String, Object> input) {
        System.out.println("[Activity] submitApplication input=" + input);
    }
    // notifyPass / notifyReject 同理
}
```

#### 11.5.3 Workflow 接口（Signal / Query 声明在此）

```java
@WorkflowInterface
public interface DslInterpreterWorkflow {
    String TASK_QUEUE = "DSL_TASK_QUEUE";

    @WorkflowMethod
    String run(String integrationDataJson, Map<String, Object> bizInput);

    @SignalMethod
    void auditSignal(String result);

    @QueryMethod
    String getAuditResult();
}
```

#### 11.5.4 Workflow 实现要点

```java
public class DslInterpreterWorkflowImpl implements DslInterpreterWorkflow {
    private final BizActivity activities = Workflow.newActivityStub(
            BizActivity.class,
            ActivityOptions.newBuilder()
                    .setStartToCloseTimeout(Duration.ofSeconds(30))
                    .setRetryOptions(RetryOptions.newBuilder().setMaximumAttempts(3).build())
                    .build());

    private String auditResult;

    @Override
    public String run(String integrationDataJson, Map<String, Object> bizInput) {
        // 1) Activity
        activities.submitApplication(ctx);

        // 2) 等待 Signal，超时 30 分钟（timeoutMode=continue → 写入 timeout）
        boolean ok = Workflow.await(Duration.ofMinutes(30), () -> auditResult != null);
        if (!ok) {
            auditResult = "timeout";
        }

        // 3) 分支
        if ("pass".equals(auditResult)) {
            activities.notifyPass(ctx);
        } else {
            activities.notifyReject(ctx);
        }
        return "COMPLETED:" + auditResult;
    }

    @Override
    public void auditSignal(String result) {
        this.auditResult = result; // 仅改状态
    }
}
```

说明：

- 使用 **`@WorkflowInterface` 实现类**，不要把 `DynamicWorkflow` 与带 `@WorkflowMethod` 的接口混用。  
- **`Workflow.await(Duration, Supplier)`** 返回 `false` 表示超时。  
- 日志用 **`Workflow.getLogger(...)`**，不要用非确定性 `System.out` 做关键分支（Demo 打印可保留在 Activity）。  
- 异常用 **`Workflow.wrap(e)`** 抛出，让 Execution 失败可见。  
- 生产应完整遍历 `nodes`/`edges`/`data.type`；Demo 用约定 id + 校验 JSON 含这些 id。

#### 11.5.5 Worker 启动

```java
WorkflowServiceStubs service = WorkflowServiceStubs.newServiceStubs(
        WorkflowServiceStubsOptions.newBuilder().setTarget("127.0.0.1:7233").build());
WorkflowClient client = WorkflowClient.newInstance(service);
WorkerFactory factory = WorkerFactory.newInstance(client);
Worker worker = factory.newWorker(DslInterpreterWorkflow.TASK_QUEUE);
worker.registerWorkflowImplementationTypes(DslInterpreterWorkflowImpl.class);
worker.registerActivitiesImplementations(new BizActivityImpl());
factory.start();
```

（`newLocalServiceStubs()` 仅适合测试环境内嵌服务，生产连独立 Temporal。）

#### 11.5.6 Client：提交 DSL + Signal

```java
DslInterpreterWorkflow wf = client.newWorkflowStub(DslInterpreterWorkflow.class, options);
WorkflowClient.start(wf::run, dslJson, Map.of("orderId", "ORD-2026001"));

DslInterpreterWorkflow stub = client.newWorkflowStub(DslInterpreterWorkflow.class, workflowId);
stub.auditSignal("pass");

String result = WorkflowStub.fromTyped(stub).getResult(String.class);
```

---

### 11.6 本地运行前置条件

1. 启动 Temporal（端口 **7233**）。  
2. `cd java-temporal-bridge && mvn compile exec:java -Dexec.mainClass=com.demo.temporal.TemporalWorkerStarter`  
3. 另开终端：`… WorkflowSubmitClient`（读取 `sample-dsl.json`）。  
4. 控制台应看到 Activity 日志与 `COMPLETED:pass`。

前端可先跑 **11.10** 导出 JSON 覆盖 `sample-dsl.json`。

---

### 11.7 生产级桥接层需补齐

1. **完整 DSL 解释器：** 拓扑遍历 `edges`，按 `data.type` 路由；支持 decision / delay / signalWait / errorPolicy / 子流程。  
2. **模板引擎：** Java 实现 `{{nodes…}}` 或调用共享求值服务；与编辑器 Variable Picker 对齐。  
3. **状态回写：** History / Describe → 上层 Instance DTO + SSE。  
4. **Search Attributes：** 业务标签映射，便于列表过滤。  
5. **自定义节点 SPI：** `data.type` → Activity 实现注册表。  
6. **重试映射：** 节点超时 / 重试 → `ActivityOptions` / `RetryOptions`。  
7. **大 DSL：** 存 DB，Workflow 只传 `dslId`，避免入参过大。

---

### 11.8 两种方案选型

| 方案 | 优点 | 缺点 |
|------|------|------|
| **动态解释（本章）** | 改图即生效，适合业务频繁变更 | 需自维护解释器，跟进 DSL 版本 |
| **代码生成** | 原生 Temporal 性能与类型安全 | 变更需生成 + 编译发布 |

---

### 11.9 边界与避坑

1. Builder **无官方 Java Temporal 绑定**；桥接属用户扩展。  
2. Workflow 代码须 **确定性**：禁止随意 `new Random()` / 本地时钟分支；副作用进 Activity。  
3. Signal payload 需可序列化；名称与 `@SignalMethod` 一致。  
4. **大 JSON 入参**不推荐；用 `dslId` 拉取。  
5. Builder / 桥接 **版本同步**，否则解析失败。  
6. Signal 过早一般会进入邮箱，仍建议确认实例已进入等待后再发，并做好幂等。  
7. 多语言 Worker（TS / Java）可共用 Task Queue 策略需统一，避免抢错队列。

---

### 11.10 完整可运行示例 A：TypeScript 导出 DSL

| 文件 | 说明 |
|------|------|
| `src/examples/Ch11ExportDslToJavaDemo.tsx` | 预置审批拓扑；「导出 DSL 给 Java」复制 `IntegrationDataFormat` |

```bash
# App.tsx 指向 Ch11 后
npm run dev
```

点击 **导出 DSL 给 Java**，粘贴覆盖 `java-temporal-bridge/src/main/resources/sample-dsl.json`。

---

### 11.11 完整可运行示例 B：Java Temporal 桥接

| 路径 | 说明 |
|------|------|
| `java-temporal-bridge/` | Maven 工程 |
| `…/TemporalWorkerStarter.java` | Worker |
| `…/WorkflowSubmitClient.java` | 提交 + Signal |
| `…/sample-dsl.json` | 默认 DSL |

```bash
cd java-temporal-bridge
mvn -q compile exec:java -Dexec.mainClass=com.demo.temporal.TemporalWorkerStarter
# 另一终端
mvn -q compile exec:java -Dexec.mainClass=com.demo.temporal.WorkflowSubmitClient
```

详见 `java-temporal-bridge/README.md`。

---

### 本章小结（第 11 章）

1. Builder 产出 **IntegrationDataFormat**；Java 用 **解释型 Workflow** 执行。  
2. Delay → `sleep`；等待 → `await` + Signal；任务 → Activity。  
3. 本仓库提供 **TS 导出** + **Java Demo** 两条可运行路径。  
4. 生产补齐：通用解释器、模板、SPI、Search Attributes、dslId 外置。

---

## 附录

| 资源 | 链接 / 路径 |
|------|-------------|
| Temporal 集成说明 | https://www.workflowbuilder.io/integrations/temporal |
| 参考栈 | https://www.workflowbuilder.io/reference-stack |
| Java Demo | `java-temporal-bridge/` |
| TS 导出 | `src/examples/Ch11ExportDslToJavaDemo.tsx` |

---

*第 1–11 章学习文档已覆盖编辑器 → 执行 → Java Temporal 桥接。*
