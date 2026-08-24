/**
 * 第 8 章完整可运行示例：编辑器 SDK 模块用法 + 动态 Palette + 变量插值 + 导出 Graph
 * 用法：App.tsx → export { default } from './examples/Ch8SdkGuideDemo';
 * npm run dev
 */
import { useMemo, useState } from 'react';
import {
  WorkflowBuilder,
  sharedProperties,
  getScope,
  getStoreDataForIntegration,
  useWorkflowBuilderActions,
  useStore,
  type PaletteItem,
  type NodeSchema,
  type UISchema,
  type PaletteItemOrGroup,
} from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';

import { demoPaletteItems } from '../palette';

/** 动态构建的业务节点（代码侧生成 PaletteItem，等价「动态 Workflow 节点定义」） */
function buildGreetingNode(label: string): PaletteItem {
  const schema = {
    type: 'object',
    properties: {
      ...sharedProperties,
      username: { type: 'string' },
      greetMsg: { type: 'string' },
    },
    required: ['username'],
  } satisfies NodeSchema;

  type S = typeof schema;
  const scope = getScope<S>;

  const uischema: UISchema = {
    type: 'VerticalLayout',
    elements: [
      { type: 'Text', scope: scope('properties.label'), label: '名称' },
      { type: 'Text', scope: scope('properties.username'), label: '用户名' },
      {
        type: 'VariableText',
        scope: scope('properties.greetMsg'),
        label: '问候语（支持 {{ 变量）',
        placeholder: 'Hello {{…}} — 输入 {{ 打开变量选择器',
      },
    ],
  };

  return {
    type: 'greeting',
    label,
    description: '第 8 章动态 PaletteItem 示例',
    icon: 'HandWaving',
    defaultPropertiesData: {
      label,
      description: '',
      username: 'developer',
      greetMsg: '',
    },
    schema,
    uischema,
  };
}

function DemoToolbar({ onToggleExtra }: { onToggleExtra: () => void }) {
  const { save, setTheme, toggleReadOnly } = useWorkflowBuilderActions();
  const documentName = useStore((s) => s.documentName);

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 120,
        zIndex: 99,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        maxWidth: '70%',
      }}
    >
      <button type="button" onClick={() => save()}>
        保存
      </button>
      <button
        type="button"
        onClick={() => {
          const graph = getStoreDataForIntegration();
          console.log('=== getStoreDataForIntegration ===');
          console.log(JSON.stringify(graph, null, 2));
        }}
      >
        导出 Graph
      </button>
      <button type="button" onClick={() => setTheme('dark')}>
        深色
      </button>
      <button type="button" onClick={() => setTheme('light')}>
        浅色
      </button>
      <button type="button" onClick={() => toggleReadOnly()}>
        切换只读
      </button>
      <button type="button" onClick={onToggleExtra}>
        动态增删 Palette 节点
      </button>
      <span style={{ fontSize: 12, alignSelf: 'center' }}>文档名: {documentName}</span>
    </div>
  );
}

export default function Ch8SdkGuideDemo() {
  const [withExtra, setWithExtra] = useState(true);

  // 动态 nodeTypes：运行时增删 Palette（低代码 / 表单驱动场景的前端侧）
  const nodeTypes: PaletteItemOrGroup[] = useMemo(() => {
    const greeting = buildGreetingNode(withExtra ? '动态问候（已启用）' : '动态问候');
    return withExtra ? [...demoPaletteItems, greeting] : [...demoPaletteItems];
  }, [withExtra]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="ch8-sdk-guide-demo"
        layoutDirection="DOWN"
        nodeTypes={nodeTypes}
        integration={{
          strategy: 'props',
          onDataSave: async (graph) => {
            console.log('=== Ch8 保存 ===');
            console.log(JSON.stringify(graph, null, 2));
            return 'success';
          },
        }}
      >
        <WorkflowBuilder.DefaultLayout />
        <DemoToolbar onToggleExtra={() => setWithExtra((v) => !v)} />
      </WorkflowBuilder.Root>
    </div>
  );
}
