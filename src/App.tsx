import React from "react";
import { WorkflowBuilder } from "@workflowbuilder/sdk";
// 必须引入SDK样式，否则画布样式错乱
import "@workflowbuilder/sdk/style.css";

export default function App() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <WorkflowBuilder.Root
        name="demo hello workflow"
        layoutDirection="DOWN" // DOWN从上往下排版；RIGHT从左到右
        // ========== 集成策略 props模式 ==========
        integration={{
          strategy: "props",
          // 点击画布【保存】按钮触发此回调
          onDataSave: async (graphData) => {
            console.log("=== 保存工作流Graph JSON ===");
            console.log(JSON.stringify(graphData, null, 2));
            // 👉真实业务：此处写fetch/axios POST graphData传给后端接口
            // await fetch("/api/workflow/save", { method:"POST", body:JSON.stringify(graphData) })
            return "success";
          },
        }}
        // 默认加载全部官方内置节点
        nodeRegistry={{
          nodes: builtinNodes,
        }}
      />
    </div>
  );
}
