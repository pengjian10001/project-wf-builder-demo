/**
 * 第 1 章完整可运行示例：Hello World（props 保存）
 * App.tsx → export { default } from './examples/Ch1HelloWorldDemo';
 * npm run dev
 */
import { WorkflowBuilder } from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';

import { demoPaletteItems } from '../palette';

export default function Ch1HelloWorldDemo() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="ch1-hello-world"
        layoutDirection="DOWN"
        // SDK 无内置节点；必须传入本仓库拷贝的 Demo palette
        nodeTypes={demoPaletteItems}
        integration={{
          strategy: 'props',
          onDataSave: async (graph) => {
            console.log('=== Ch1 Hello World：保存 IntegrationDataFormat ===');
            console.log(JSON.stringify(graph, null, 2));
            return 'success';
          },
        }}
      />
    </div>
  );
}
