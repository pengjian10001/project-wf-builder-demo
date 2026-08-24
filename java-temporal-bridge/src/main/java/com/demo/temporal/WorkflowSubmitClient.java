package com.demo.temporal;

import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowOptions;
import io.temporal.client.WorkflowStub;
import io.temporal.serviceclient.WorkflowServiceStubs;
import io.temporal.serviceclient.WorkflowServiceStubsOptions;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/**
 * 提交编辑器导出的 DSL，并发送审批 Signal。
 *
 * <pre>
 *   mvn -q exec:java -Dexec.mainClass=com.demo.temporal.WorkflowSubmitClient
 * </pre>
 */
public class WorkflowSubmitClient {

    public static void main(String[] args) throws Exception {
        String target = System.getenv().getOrDefault("TEMPORAL_ADDRESS", "127.0.0.1:7233");
        Path dslPath =
                Path.of(
                        args.length > 0
                                ? args[0]
                                : "src/main/resources/sample-dsl.json");

        String dslJson = Files.readString(dslPath, StandardCharsets.UTF_8);
        Map<String, Object> bizInput = Map.of("orderId", "ORD-2026001");

        WorkflowServiceStubs service =
                WorkflowServiceStubs.newServiceStubs(
                        WorkflowServiceStubsOptions.newBuilder().setTarget(target).build());
        WorkflowClient client = WorkflowClient.newInstance(service);

        String workflowId = "approval-ORD-2026001";
        WorkflowOptions options =
                WorkflowOptions.newBuilder()
                        .setTaskQueue(DslInterpreterWorkflow.TASK_QUEUE)
                        .setWorkflowId(workflowId)
                        .build();

        DslInterpreterWorkflow workflow = client.newWorkflowStub(DslInterpreterWorkflow.class, options);

        // 异步启动
        WorkflowClient.start(workflow::run, dslJson, bizInput);
        System.out.println("Workflow started id=" + workflowId);

        // 模拟外部审批系统发 Signal（须在 await 之后；稍等 Worker 调度）
        Thread.sleep(1500);
        DslInterpreterWorkflow signalStub =
                client.newWorkflowStub(DslInterpreterWorkflow.class, workflowId);
        signalStub.auditSignal("pass");
        System.out.println("Signal auditSignal(pass) sent");

        // 等待结果
        String result = WorkflowStub.fromTyped(signalStub).getResult(String.class);
        System.out.println("Workflow result=" + result);
    }
}
