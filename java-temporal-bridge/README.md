# Java Temporal 桥接 Demo（第 11 章）

将 Workflow Builder 的 `IntegrationDataFormat` JSON 交给通用 Workflow 解释执行。

## 前置

1. JDK 17+
2. Maven 3.8+
3. 本地 Temporal（默认 `127.0.0.1:7233`）

```bash
# 示例：官方 docker compose（按 Temporal 文档调整）
# temporal server start-dev
```

## 运行

```bash
cd java-temporal-bridge

# 终端 1：Worker
mvn -q compile exec:java -Dexec.mainClass=com.demo.temporal.TemporalWorkerStarter

# 终端 2：提交 DSL + Signal
mvn -q compile exec:java -Dexec.mainClass=com.demo.temporal.WorkflowSubmitClient
```

环境变量：`TEMPORAL_ADDRESS`（默认 `127.0.0.1:7233`）。

前端导出 DSL：运行本仓库 `Ch11ExportDslToJavaDemo`，点「导出 DSL 给 Java」，覆盖 `src/main/resources/sample-dsl.json`（须保留节点 id：`submit_apply` / `wait_audit` / `notify_pass` / `notify_reject`）。
