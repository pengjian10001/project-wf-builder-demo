package com.demo.temporal;

import io.temporal.workflow.QueryMethod;
import io.temporal.workflow.SignalMethod;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;

import java.util.Map;

/**
 * 通用 DSL Workflow：入参为 Workflow Builder 保存的 IntegrationDataFormat JSON 字符串。
 * Signal / Query 声明在接口上（不要混用 DynamicWorkflow 接口形态）。
 */
@WorkflowInterface
public interface DslInterpreterWorkflow {

    String TASK_QUEUE = "DSL_TASK_QUEUE";

    /**
     * @param integrationDataJson IntegrationDataFormat JSON（nodes/edges/name/…）
     * @param bizInput            业务启动入参，写入工作流上下文
     */
    @WorkflowMethod
    String run(String integrationDataJson, Map<String, Object> bizInput);

    /** 对应编辑器 await / 审批等待；payload 如 "pass" / "reject" */
    @SignalMethod
    void auditSignal(String result);

    @QueryMethod
    String getAuditResult();
}
