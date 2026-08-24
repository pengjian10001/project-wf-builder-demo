package com.demo.temporal;

import io.temporal.client.WorkflowClient;
import io.temporal.serviceclient.WorkflowServiceStubs;
import io.temporal.serviceclient.WorkflowServiceStubsOptions;
import io.temporal.worker.Worker;
import io.temporal.worker.WorkerFactory;

/**
 * 启动 Worker。本地需先起 Temporal（默认 127.0.0.1:7233）。
 *
 * <pre>
 *   cd java-temporal-bridge
 *   mvn -q exec:java -Dexec.mainClass=com.demo.temporal.TemporalWorkerStarter
 * </pre>
 */
public class TemporalWorkerStarter {

    public static void main(String[] args) {
        String target = System.getenv().getOrDefault("TEMPORAL_ADDRESS", "127.0.0.1:7233");

        WorkflowServiceStubs service =
                WorkflowServiceStubs.newServiceStubs(
                        WorkflowServiceStubsOptions.newBuilder().setTarget(target).build());
        WorkflowClient client = WorkflowClient.newInstance(service);
        WorkerFactory factory = WorkerFactory.newInstance(client);

        Worker worker = factory.newWorker(DslInterpreterWorkflow.TASK_QUEUE);
        worker.registerWorkflowImplementationTypes(DslInterpreterWorkflowImpl.class);
        worker.registerActivitiesImplementations(new BizActivityImpl());

        factory.start();
        System.out.println("Temporal worker started, queue=" + DslInterpreterWorkflow.TASK_QUEUE + ", target=" + target);
    }
}
