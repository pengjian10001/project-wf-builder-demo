package com.demo.temporal;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.temporal.activity.ActivityOptions;
import io.temporal.common.RetryOptions;
import io.temporal.workflow.Workflow;
import org.slf4j.Logger;

import java.time.Duration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * 最小可运行解释器：按 edges 拓扑推进；识别约定节点 id：
 * submit_apply → wait_audit(await signal) → audit_branch → notify_pass / notify_reject
 *
 * 生产应改为完整遍历 data.type + SPI；此处刻意保持短小可跑通。
 */
public class DslInterpreterWorkflowImpl implements DslInterpreterWorkflow {

    private static final Logger log = Workflow.getLogger(DslInterpreterWorkflowImpl.class);

    /** Workflow 内复用同一 ObjectMapper 实例；仅解析入参字符串（确定性） */
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final BizActivity activities =
            Workflow.newActivityStub(
                    BizActivity.class,
                    ActivityOptions.newBuilder()
                            .setStartToCloseTimeout(Duration.ofSeconds(30))
                            .setRetryOptions(
                                    RetryOptions.newBuilder()
                                            .setMaximumAttempts(3)
                                            .build())
                            .build());

    private final Map<String, Object> ctx = new HashMap<>();
    private String auditResult;

    @Override
    public String run(String integrationDataJson, Map<String, Object> bizInput) {
        if (bizInput != null) {
            ctx.putAll(bizInput);
        }

        try {
            JsonNode root = MAPPER.readTree(integrationDataJson);
            String name = root.path("name").asText("unnamed");
            log.info("Start DSL workflow name={}", name);

            // —— 1. 提交申请 Activity（节点 id: submit_apply）——
            activities.submitApplication(ctx);

            // —— 2. 等待 Signal（对应 awaitEvent / signalWait）——
            // Workflow.await 返回 false 表示超时
            boolean gotSignal =
                    Workflow.await(Duration.ofMinutes(30), () -> auditResult != null);
            if (gotSignal) {
                ctx.put("auditResult", auditResult);
            } else {
                // timeoutMode=continue
                auditResult = "timeout";
                ctx.put("auditResult", "timeout");
                log.info("audit signal timed out");
            }

            // —— 3. 条件分支（对应 decision / if）——
            if ("pass".equals(auditResult)) {
                activities.notifyPass(ctx);
            } else {
                activities.notifyReject(ctx);
            }

            // 校验 JSON 里至少包含约定节点 id（演示「读 DSL」而非完全忽略）
            assertGraphContains(root, "submit_apply", "wait_audit", "notify_pass", "notify_reject");

            return "COMPLETED:" + auditResult;
        } catch (Exception e) {
            // 不要吞掉失败：让 Temporal 将本次 Execution 标为 Failed
            throw Workflow.wrap(e);
        }
    }

    @Override
    public void auditSignal(String result) {
        // Signal 方法只改状态，不做阻塞 IO
        this.auditResult = result;
    }

    @Override
    public String getAuditResult() {
        return auditResult;
    }

    private static void assertGraphContains(JsonNode root, String... nodeIds) {
        Set<String> ids = new HashSet<>();
        JsonNode nodes = root.path("nodes");
        if (nodes.isArray()) {
            for (JsonNode n : nodes) {
                ids.add(n.path("id").asText());
            }
        }
        for (String id : nodeIds) {
            if (!ids.contains(id)) {
                throw new IllegalArgumentException("DSL missing node id: " + id);
            }
        }
    }
}
