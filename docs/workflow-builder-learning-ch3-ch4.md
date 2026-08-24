# Workflow Builder 完整学习资料（第 3 章 + 第 4 章）

基于官方文档（[workflowbuilder.io/docs](https://www.workflowbuilder.io/docs/overview/)）、npm 包 `@workflowbuilder/sdk@2.3.x`，以及本仓库 `wf-builder-demo`。第 1–2 章见：`docs/workflow-builder-learning-ch1-ch2.md`。

- **项目官网：** https://www.workflowbuilder.io  
- **SDK 包：** `@workflowbuilder/sdk`  
- **自定义节点：** https://www.workflowbuilder.io/docs/guides/add-a-custom-node/  
- **插件：** https://www.workflowbuilder.io/docs/guides/build-a-plugin/  
- **配置编辑器：** https://www.workflowbuilder.io/docs/guides/configuring-the-editor/

---

## 第 3 章 Plugin 插件系统、自定义节点开发、自定义表单 Schema、校验、图标

官方文档核心扩展点：业务几乎都要做自定义节点，把内部业务步骤封装成画布可拖拽组件。

插件体系两大核心：

1. **`PaletteItem`（节点类型）**：自定义节点类型，出现在左侧拖拽面板，通过 `nodeTypes` 传入 Root。  
2. **`WorkflowBuilderPlugin`（全局插件）**：`type WorkflowBuilderPlugin = () => void`，在函数体内调用 `register*` API，可注册自定义 UI 槽位、函数钩子、插件文案、JsonForms 扩展。

说明：SDK 另有枚举 `NodeType`（`'node' | 'start-node' | 'ai-node' | 'decision-node'`），表示画布**模板类别**，与业务侧的 `PaletteItem` 不是同一概念。

### 3.1 类型定义概览

```ts
import type {
  PaletteItem,
  NodeSchema,
  UISchema,
  WorkflowBuilderPlugin,
  IconType,
} from '@workflowbuilder/sdk';

/**
 * PaletteItem 关键字段：
 * - type: string                 // 业务节点标识，如 "orderPay"（写入 data.type）
 * - label: string                // 左侧面板显示名称（也可为 i18n key）
 * - description?: string
 * - icon: IconType               // WBIcon 名称字符串，如 'CreditCard'
 * - defaultPropertiesData: …     // 拖入画布时的默认 properties
 * - schema: NodeSchema           // 数据形状 + 校验
 * - uischema?: UISchema          // 右侧属性面板 UI（JsonForms）
 * - outputSchema?: …             // 可选：变量选择器看到的输出字段
 * - templateType?: …             // 可选：关联 start-node / decision-node 等模板
 *
 * WorkflowBuilderPlugin = () => void
 * 在函数内调用：
 *   registerComponentDecorator(...)
 *   registerFunctionDecorator(...)
 *   registerPluginTranslation(...)
 */
```

表单由 **`schema`（数据 / 校验）+ `uischema`（控件布局）** 驱动，JsonForms 渲染右侧属性面板，是自定义节点最关键的部分。

---

### 3.2 开发第一个自定义节点：订单支付节点

业务场景：新增节点 `orderPay`，用于订单支付，配置参数：

- `payChannel`：支付渠道（下拉：alipay / wechat）
- `amount`：金额（数字）
- `remark`：备注（文本，支持变量插值）

#### 完整可运行示例

可直接替换本仓库 `src/App.tsx` 验证，或拆成 `src/nodes/order-pay/*`（更贴近官方推荐结构）。

```tsx
import React from 'react';
import {
  WorkflowBuilder,
  sharedProperties,
  getScope,
  type PaletteItem,
  type NodeSchema,
  type UISchema,
} from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';

// ========== 1. schema：形状 + 校验 ==========
const orderPaySchema = {
  type: 'object',
  // 建议始终带上 label / description（sharedProperties）
  properties: {
    ...sharedProperties,
    payChannel: {
      type: 'string',
      // 下拉用 options[{ label, value }]
      options: [
        { label: '支付宝', value: 'alipay' },
        { label: '微信支付', value: 'wechat' },
      ],
    },
    amount: {
      type: 'number',
      minimum: 0.01, // 小于最小值时，节点 / 面板会标错
    },
    remark: {
      type: 'string',
    },
  },
  required: ['payChannel', 'amount'],
} satisfies NodeSchema;

type OrderPaySchema = typeof orderPaySchema;
const scope = getScope<OrderPaySchema>;

// ========== 2. uischema：右侧面板布局 ==========
const orderPayUiSchema: UISchema = {
  type: 'VerticalLayout',
  elements: [
    { type: 'Text', scope: scope('properties.label'), label: '名称' },
    { type: 'TextArea', scope: scope('properties.description'), label: '描述', minRows: 2 },
    {
      type: 'Select',
      scope: scope('properties.payChannel'),
      label: '支付渠道',
    },
    {
      type: 'Text',
      scope: scope('properties.amount'),
      label: '支付金额',
    },
    {
      // 变量插值：使用 VariableText / VariableTextArea
      type: 'VariableText',
      scope: scope('properties.remark'),
      label: '备注',
      placeholder: '例如：订单 {{ 触发变量 }} 支付。输入 {{ 打开变量选择器',
    },
  ],
};

// ========== 3. PaletteItem：注册到左侧面板 ==========
const orderPayNode: PaletteItem<OrderPaySchema> = {
  type: 'orderPay',
  label: '订单支付',
  description: '配置支付渠道与金额',
  icon: 'CreditCard',
  defaultPropertiesData: {
    label: '订单支付',
    description: '',
    payChannel: 'alipay',
    amount: 0,
    remark: '',
  },
  schema: orderPaySchema,
  uischema: orderPayUiSchema,
};

export default function CustomNodeDemo() {
  // 若要同时保留 Demo 节点：
  // import { demoPaletteItems } from './palette';
  // const allNodeTypes = [...demoPaletteItems, orderPayNode];
  const allNodeTypes = [orderPayNode];

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="custom-node-demo"
        layoutDirection="DOWN"
        nodeTypes={allNodeTypes}
        plugins={[]}
        integration={{
          strategy: 'props',
          // onDataSave 需返回 DidSaveStatus；抛错才会走错误 snackbar
          onDataSave: async (graph) => {
            console.log('完整 graph：', JSON.stringify(graph, null, 2));
            return 'success';
          },
        }}
      />
    </div>
  );
}
```

**运行效果：**

1. 左侧拖拽面板出现【订单支付】节点（图标 CreditCard），可拖到画布  
2. 选中节点，右侧按 `uischema` 渲染：支付渠道下拉、金额、备注（VariableText）  
3. 保存 / 校验时：若 `amount` 不满足 `minimum: 0.01`，节点与属性面板会出现校验错误标记  
4. 保存输出中该节点片段示例：

```json
{
  "id": "n-xxx",
  "type": "node",
  "position": { "x": 300, "y": 220 },
  "data": {
    "type": "orderPay",
    "icon": "CreditCard",
    "properties": {
      "label": "订单支付",
      "description": "",
      "payChannel": "alipay",
      "amount": 100.5,
      "remark": "用户下单支付"
    }
  }
}
```

执行引擎根据 `data.type: "orderPay"` 去后端 worker 注册对应处理器执行业务逻辑。

**自定义业务校验补充：**

- 优先用 schema：`minimum: 0.01` 或 `exclusiveMinimum: 0`  
- 跨字段 / 异步规则：可在 `onDataSave` 前用 `getStoreNodes()` 检查，或写入 `data.properties.customErrors`（AJV `ErrorObject[]`，进阶）

---

### 3.3 Schema / UISchema 常用字段说明

属性面板由两层组成：`schema`（数据约束）与 `uischema`（UI 行为）。

#### 3.3.1 `schema` 字段（数据 + 校验）

常用字段（包内为 `FieldSchema` 等联合类型；业务侧写 `satisfies NodeSchema` 即可）：

- `type`：`'string' | 'number' | 'boolean' | 'object' | 'array' | …`
- `options`：`{ label: string; value: string; icon?: string }[]`（下拉选项）
- `placeholder?: string`
- number：`minimum` / `maximum` / `exclusiveMinimum` / `exclusiveMaximum`
- string：`minLength` / `maxLength` / `pattern` / `format`（如 `'uri'`）

节点级还可：`required: string[]`、`allOf` 条件校验（本仓库 Demo 的 delay 节点有示例）。

#### 3.3.2 `uischema` 控件（含变量插值）

内置控件类型（节选）：`Text`、`TextArea`、`Select`、`Switch`、`DatePicker`、`VariableText`、`VariableTextArea`，以及布局 `VerticalLayout` / `HorizontalLayout` / `Accordion` 等。

开启模板插值示例：

```ts
{
  type: 'VariableText', // 或 VariableTextArea
  scope: '#/properties/remark', // 或 getScope(...) 生成
  label: '备注',
  placeholder: '订单 {{...}} 支付',
}
```

用户可填写：`订单{{...}}支付`。可选变量取决于上游节点 `outputSchema` 与连线关系；节点未接入图时变量列表可能为空。

---

### 3.4 Plugin 全局插件实战

Plugin 用于：注册 UI 槽位、拦截 SDK 函数、注入翻译 / JsonForms 扩展。

```ts
import {
  registerComponentDecorator,
  registerFunctionDecorator,
  registerPluginTranslation,
  type WorkflowBuilderPlugin,
} from '@workflowbuilder/sdk';

const myPlugin: WorkflowBuilderPlugin = () => {
  registerComponentDecorator('OptionalAppBarControls', {
    content: MyButton,
    name: 'my-plugin',
  });
  registerFunctionDecorator('trackFutureChange', {
    place: 'after',
    callback: ({ params }) => {
      console.log('diagram change tracked', params);
    },
    name: 'my-plugin-audit',
  });
  registerPluginTranslation({
    en: { translation: { plugins: { myPlugin: { hello: 'Hello' } } } },
  });
};

// <WorkflowBuilder.Root plugins={[myPlugin]} ... />
```

#### 3.4.1 保存前 / 加载后处理

场景：保存工作流之前自动给数据追加版本号；加载完成后做数据兼容。

**保存前：** 在 `integration.onDataSave` 里改 payload 再持久化。

```ts
import type { IntegrationDataFormat } from '@workflowbuilder/sdk';

async function onDataSave(graph: IntegrationDataFormat) {
  const withMeta = {
    ...graph,
    // meta 为业务扩展字段，可一并写入你的数据库
    meta: {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
    },
  } as IntegrationDataFormat & { meta: { version: string; updatedAt: string } };

  console.log(JSON.stringify(withMeta, null, 2));
  // await api.save(withMeta)
  return 'success' as const;
}
```

也可用函数装饰器观察变更：

```ts
registerFunctionDecorator('trackFutureChange', {
  place: 'before',
  name: 'log-changes',
  callback: ({ params }) => {
    console.log('即将发生变更', params);
  },
});
```

**加载后：** 在传入 `initialNodes` / `initialEdges` 之前做迁移；或 Root 挂载后调用 `setStoreNodes` / `setStoreEdges`。

```ts
import type { WorkflowBuilderNode, WorkflowBuilderEdge } from '@workflowbuilder/sdk';

function migrateLoadedGraph(nodes: WorkflowBuilderNode[], edges: WorkflowBuilderEdge[]) {
  // 旧数据兼容迁移…
  return { nodes, edges };
}
```

#### 3.4.2 获取 Store / 编程式能力

常用 API：

| API | 用途 |
|-----|------|
| `getStoreNodes` / `setStoreNodes` | 读写节点 |
| `getStoreEdges` / `setStoreEdges` | 读写连线 |
| `getStoreDataForIntegration()` | 导出完整保存载荷 |
| `useStore(selector)` | React 订阅 store |
| `useWorkflowBuilderActions()` | save / 只读 / 布局方向等（须在 Root 子树内） |

在插件中挂隐形组件探测 store：

```ts
import { getStoreNodes, getStoreDataForIntegration, registerComponentDecorator } from '@workflowbuilder/sdk';
import type { WorkflowBuilderPlugin } from '@workflowbuilder/sdk';
import React from 'react';

const storeProbePlugin: WorkflowBuilderPlugin = () => {
  registerComponentDecorator('OptionalHooks', {
    name: 'store-probe',
    content: function StoreProbe() {
      React.useEffect(() => {
        console.log('当前节点数', getStoreNodes().length);
        console.log('可保存载荷', getStoreDataForIntegration());
      }, []);
      return null;
    },
  });
};
```

---

### 3.5 Store 编程式 API（hooks 方式，组件内部调用）

在 Root 子组件中可使用 SDK hooks / Store API 访问画布，不依赖插件注册。

```tsx
import {
  getStoreNodes,
  setStoreNodes,
  getStoreDataForIntegration,
  useWorkflowBuilderActions,
} from '@workflowbuilder/sdk';

/** 必须放在 <WorkflowBuilder.Root> 子组件内（actions.save 依赖 context） */
function ToolBar() {
  const actions = useWorkflowBuilderActions();

  const addDemoNode = () => {
    const id = `orderPay-${crypto.randomUUID()}`;
    setStoreNodes([
      ...getStoreNodes(),
      {
        id,
        type: 'node', // ReactFlow 模板类型（内置默认节点外观）
        position: { x: 200, y: 200 },
        data: {
          type: 'orderPay', // 业务类型，须已在 nodeTypes 注册
          icon: 'CreditCard',
          properties: {
            label: '订单支付',
            description: '',
            payChannel: 'wechat',
            amount: 199,
            remark: '',
          },
        },
      },
    ]);
  };

  const exportGraph = () => {
    const graph = getStoreDataForIntegration();
    console.log(JSON.stringify(graph, null, 2));
  };

  return (
    <div style={{ position: 'absolute', top: 8, left: 120, zIndex: 99, display: 'flex', gap: 8 }}>
      <button type="button" onClick={addDemoNode}>
        编程新增订单支付节点
      </button>
      <button type="button" onClick={exportGraph}>
        导出 Graph
      </button>
      <button type="button" onClick={() => actions.save()}>
        保存
      </button>
    </div>
  );
}
```

注意：`getStore*` / `setStore*` 为全局单例命令式 API；`useWorkflowBuilderActions` / `useStore` 必须在 Root 子树内使用。

---

### 3.6 自定义侧边 / 顶栏 UI（Plugin 槽位）

通过 `registerComponentDecorator` 注入具名槽位：

| 槽位名 | 位置 |
|--------|------|
| `OptionalAppBarControls` | 顶栏控制按钮区 |
| `OptionalAppBarTools` | 顶栏工具区 |
| `OptionalAppChildren` | App 级 children（portal / provider） |
| `OptionalEdgeProperties` | 边的属性面板扩展 |
| `OptionalFooterContent` | 页脚 |
| `OptionalHooks` | 隐形 hooks 槽 |
| `OptionalNodeContent` | 节点内部（带 `nodeId`） |

```tsx
import { registerComponentDecorator, type WorkflowBuilderPlugin } from '@workflowbuilder/sdk';

const customSideUiPlugin: WorkflowBuilderPlugin = () => {
  registerComponentDecorator('OptionalAppBarControls', {
    name: 'business-meta',
    place: 'after',
    content: function BusinessMetaButton() {
      return (
        <button type="button" onClick={() => alert('打开业务元数据')}>
          业务元数据
        </button>
      );
    },
  });

  // 若要整块常驻 UI，可自定义 children 布局：
  // <WorkflowBuilder.Root>
  //   <WorkflowBuilder.DefaultLayout />
  //   <aside>…你的业务面板…</aside>
  // </WorkflowBuilder.Root>
};
```

注册到 `plugins={[customSideUiPlugin]}` 后，对应槽位会出现你的组件。

---

### 3.7 节点校验补充说明

1. **节点级校验（schema）**：`required`、`minimum`、`minLength`、`pattern`、`format`、`allOf` 等；失败时节点与属性面板展示错误。  
2. **自定义错误**：可维护 `data.properties.customErrors`（AJV `ErrorObject[]`）。  
3. **全局保存校验**：在 `onDataSave` 里检查整图（例如只能有一个 `data.type === 'trigger'`），不合法则 `throw new Error(...)`。  
4. **连线校验**：用 Root 的 `isValidConnection` 拦截非法连线；分支逻辑多在 **decision / conditional 节点** 上表达。

---

### 3.8 完整合并示例（自定义节点 + 插件 + 编程 API）

```tsx
import React from 'react';
import {
  WorkflowBuilder,
  sharedProperties,
  getScope,
  getStoreNodes,
  setStoreNodes,
  getStoreDataForIntegration,
  registerComponentDecorator,
  registerFunctionDecorator,
  useWorkflowBuilderActions,
  type PaletteItem,
  type NodeSchema,
  type UISchema,
  type WorkflowBuilderPlugin,
} from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';

const orderPaySchema = {
  type: 'object',
  properties: {
    ...sharedProperties,
    payChannel: {
      type: 'string',
      options: [
        { label: '支付宝', value: 'alipay' },
        { label: '微信支付', value: 'wechat' },
      ],
    },
    amount: { type: 'number', minimum: 0.01 },
    remark: { type: 'string' },
  },
  required: ['payChannel', 'amount'],
} satisfies NodeSchema;

type OrderPaySchema = typeof orderPaySchema;
const scope = getScope<OrderPaySchema>;

const orderPayUiSchema: UISchema = {
  type: 'VerticalLayout',
  elements: [
    { type: 'Select', scope: scope('properties.payChannel'), label: '支付渠道' },
    { type: 'Text', scope: scope('properties.amount'), label: '支付金额' },
    {
      type: 'VariableText',
      scope: scope('properties.remark'),
      label: '备注',
      placeholder: '支持 {{ 变量插值',
    },
  ],
};

const orderPayNode: PaletteItem<OrderPaySchema> = {
  type: 'orderPay',
  label: '订单支付',
  description: '订单支付步骤',
  icon: 'CreditCard',
  defaultPropertiesData: {
    label: '订单支付',
    description: '',
    payChannel: 'alipay',
    amount: 0,
    remark: '',
  },
  schema: orderPaySchema,
  uischema: orderPayUiSchema,
};

const metaAndUiPlugin: WorkflowBuilderPlugin = () => {
  registerFunctionDecorator('trackFutureChange', {
    place: 'after',
    name: 'meta-audit',
    callback: () => {
      // 观察变更；写 meta 建议放在 onDataSave
    },
  });

  registerComponentDecorator('OptionalAppBarControls', {
    name: 'business-meta-btn',
    place: 'after',
    content: () => <button type="button">业务元数据</button>,
  });
};

function ToolBar() {
  const actions = useWorkflowBuilderActions();

  return (
    <div style={{ position: 'absolute', top: 8, left: 120, zIndex: 99, display: 'flex', gap: 8 }}>
      <button
        type="button"
        onClick={() => {
          setStoreNodes([
            ...getStoreNodes(),
            {
              id: `n-${crypto.randomUUID()}`,
              type: 'node',
              position: { x: 200, y: 200 },
              data: {
                type: 'orderPay',
                icon: 'CreditCard',
                properties: {
                  label: '订单支付',
                  description: '',
                  payChannel: 'wechat',
                  amount: 199,
                  remark: '',
                },
              },
            },
          ]);
        }}
      >
        新增支付节点
      </button>
      <button type="button" onClick={() => console.log(getStoreDataForIntegration())}>
        打印 Graph
      </button>
      <button type="button" onClick={() => actions.save()}>
        保存
      </button>
    </div>
  );
}

export default function FullCustomDemo() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="full-custom-demo"
        layoutDirection="DOWN"
        nodeTypes={[orderPayNode]}
        plugins={[metaAndUiPlugin]}
        integration={{
          strategy: 'props',
          onDataSave: async (g) => {
            const payload = {
              ...g,
              meta: { version: '1.0.0', updatedAt: new Date().toISOString() },
            };
            console.log(payload);
            return 'success';
          },
        }}
      >
        {/* 传入 children 会替换默认布局；叠加浮层需显式挂 DefaultLayout */}
        <WorkflowBuilder.DefaultLayout />
        <ToolBar />
      </WorkflowBuilder.Root>
    </div>
  );
}
```

关键点：

- `<WorkflowBuilder.Root>` 支持 `children`；传入 children 时需自行挂 `<WorkflowBuilder.DefaultLayout />`，或拼装 TopBar / Palette / Canvas / PropertiesPanel。  
- 子组件内可用 `useWorkflowBuilderActions()`；命令式读写用 `getStore*` / `setStore*`。

### 3.9 本章完整可运行示例（本仓库）

| 文件 | 说明 |
|------|------|
| `src/examples/Ch3CustomNodePluginDemo.tsx` | `orderPay` 自定义节点 + 插件顶栏按钮 + `setStoreNodes` / 保存注入 meta |
| `src/App.tsx` | `export { default } from './examples/Ch3CustomNodePluginDemo'` |

```bash
npm run dev
```

**可验证：**

1. 左侧出现 Demo 节点 +「订单支付」；  
2. 顶栏有「业务元数据」插件按钮；  
3. 「新增支付节点」用 Store API 编程加节点；  
4. 「打印 Graph / 保存」输出带 `meta` 的载荷；  
5. 选中订单支付节点，右侧表单含渠道、金额、`VariableText` 备注。  

完整源码见 `src/examples/Ch3CustomNodePluginDemo.tsx`。

### 本章小结（第 3 章）

1. 用 **`PaletteItem`** 实现自定义节点：`schema` + `uischema` 驱动右侧表单；变量插值用 **`VariableText` / `VariableTextArea`**。  
2. 校验优先靠 **schema**；保存期全局规则放在 **`onDataSave`**。  
3. **`WorkflowBuilderPlugin = () => void`**，内部 `registerComponentDecorator` / `registerFunctionDecorator` / `registerPluginTranslation`。  
4. 编程式操作：`setStoreNodes` / `getStoreDataForIntegration` / `useWorkflowBuilderActions`。  
5. Graph JSON 是前后端契约；自定义节点的 **`data.type`** 必须在后端 worker 有对应处理器。  
6. **图标** 是 `WBIcon` 字符串名（如 `'CreditCard'`）。  
7. **可运行示例：** `src/examples/Ch3CustomNodePluginDemo.tsx`（见 3.9）。

---

## 第 4 章 事件系统、Graph 序列化 / 反序列化、加载已有 graph、布局 API、画布配置（缩放、网格、只读模式）

本章讲解画布底层核心能力：Graph 数据契约、序列化与反序列化、加载历史流程图、布局相关 API、画布 UI 行为配置、事件监听，附带完整可运行 TSX 示例，覆盖保存到数据库、页面回显、只读预览、动态切换流程业务场景。

### 4.1 Graph 序列化 / 反序列化核心概念

Workflow Builder 的全部画布数据载体为 **`IntegrationDataFormat`**（业务上可称为 Graph），是前端画布与后端存储之间的主数据契约。

- **序列化**：画布内存状态 → JSON 字符串，用于存入数据库、持久化存储  
- **反序列化**：后端读取 JSON → 还原为 nodes/edges，注入画布渲染流程图  

```ts
import type {
  IntegrationDataFormat,
  WorkflowBuilderNode,
  WorkflowBuilderEdge,
} from '@workflowbuilder/sdk';

/**
 * IntegrationDataFormat：
 * - name: string
 * - globalVariables: …          // VariablesIndex
 * - layoutDirection: 'DOWN' | 'RIGHT'
 * - nodes: WorkflowBuilderNode[]
 * - edges: WorkflowBuilderEdge[]
 *
 * WorkflowBuilderNode：
 * - id / position
 * - type: 模板类型，如 "node" / "start-node"
 * - data.type: 业务类型，如 "trigger" / "orderPay"
 * - data.icon / data.properties
 *
 * WorkflowBuilderEdge：
 * - source / target
 * - 可选 sourceHandle / targetHandle、data.label 等
 */
```

#### 4.1.1 序列化（导出画布数据）

两种获取 Graph 方式：

1. **`integration.onDataSave`**：内置保存按钮 / `actions.save()` 触发  
2. **`getStoreDataForIntegration()`**：任意时刻手动导出  

```tsx
import { getStoreDataForIntegration } from '@workflowbuilder/sdk';

/** 序列化：导出当前画布为 JSON 字符串 */
function serializeCurrentGraph() {
  const graph = getStoreDataForIntegration();
  const jsonStr = JSON.stringify(graph, null, 2);
  console.log('序列化 Graph:\n', jsonStr);
  return jsonStr;
}
```

也可在 Root 子组件中：

```tsx
function ExportButton() {
  return (
    <button type="button" onClick={() => console.log(getStoreDataForIntegration())}>
      导出
    </button>
  );
}
```

#### 4.1.2 反序列化（加载已有 Graph）

- **初始化加载：** `initialNodes` + `initialEdges`（`props` 策略；另有 `name` / `layoutDirection`）  
- **运行时切换：** `setStoreNodes` + `setStoreEdges`（组件已挂载后不要依赖改 `initial*` 热更新）

---

### 4.2 完整示例：页面加载直接渲染预先写好的 graph JSON

场景：后端接口返回 graph JSON，页面打开直接渲染完整工作流，无需手动拖拽节点。

下列预置图使用本仓库 Demo 节点字段形状（见第 2 章）。若 `nodeTypes` 只有自定义节点，请改成对应 `data.type` 与 `properties`。

```tsx
// DemoLoadPredefinedGraph.tsx
import React from 'react';
import {
  WorkflowBuilder,
  type WorkflowBuilderNode,
  type WorkflowBuilderEdge,
} from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';
import { demoPaletteItems } from './palette';

/** 模拟后端返回的 nodes / edges */
const preDefinedNodes: WorkflowBuilderNode[] = [
  {
    id: 'n-01',
    type: 'node',
    position: { x: 220, y: 30 },
    data: {
      type: 'trigger',
      icon: 'Lightning',
      properties: {
        label: '订单触发',
        description: '',
        type: 'eventBasedTrigger',
        status: 'active',
        eventType: 'order.created',
      },
    },
  },
  {
    id: 'n-02',
    type: 'node',
    position: { x: 220, y: 180 },
    data: {
      type: 'action',
      icon: 'PlayCircle',
      properties: {
        label: '创建订单',
        description: '',
        type: 'makeApiCall',
        status: 'active',
        makeAPICall: {
          apiUrl: 'https://api.example.com/order/create',
          httpMethod: 'post',
          body: '{"orderId":"{{order.id}}","amount":1}',
        },
      },
    },
  },
  {
    id: 'n-03',
    type: 'node',
    position: { x: 220, y: 340 },
    data: {
      type: 'notification',
      icon: 'Bell',
      properties: {
        label: '完成通知',
        description: '',
        type: 'webhook',
        status: 'active',
      },
    },
  },
];

const preDefinedEdges: WorkflowBuilderEdge[] = [
  { id: 'e-01', source: 'n-01', target: 'n-02' },
  { id: 'e-02', source: 'n-02', target: 'n-03' },
];

export default function DemoLoadPredefinedGraph() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="demo-pre-load-graph"
        layoutDirection="DOWN"
        nodeTypes={demoPaletteItems}
        initialNodes={preDefinedNodes}
        initialEdges={preDefinedEdges}
        integration={{
          strategy: 'props',
          onDataSave: async (graph) => {
            console.log('用户点击保存，导出 Graph：', JSON.stringify(graph, null, 2));
            return 'success';
          },
        }}
      />
    </div>
  );
}
```

运行效果：页面挂载完成，画布自动渲染节点与连线（需 `nodeTypes` 覆盖图中出现的 `data.type`）。

#### 4.2.1 运行时动态替换 Graph（组件已挂载）

场景：下拉选择不同流程定义，切换画布内容。

```tsx
import {
  setStoreNodes,
  setStoreEdges,
  setStoreLayoutDirection,
  type WorkflowBuilderNode,
  type WorkflowBuilderEdge,
  type LayoutDirection,
} from '@workflowbuilder/sdk';

export function useGraphLoader() {
  /**
   * 运行时覆盖画布 Graph
   * @param nodes / edges 后端获取的图数据
   */
  function setRuntimeGraph(params: {
    nodes: WorkflowBuilderNode[];
    edges: WorkflowBuilderEdge[];
    layoutDirection?: LayoutDirection;
  }) {
    // structuredClone：避免外部引用污染 store
    setStoreNodes(structuredClone(params.nodes));
    setStoreEdges(structuredClone(params.edges));
    if (params.layoutDirection) {
      setStoreLayoutDirection(params.layoutDirection);
    }
  }

  return { setRuntimeGraph };
}
```

在 Root **子组件**中调用（例如流程切换下拉的 `onChange`）。

---

### 4.3 画布配置：网格、缩放、只读模式

画布 UI / 交互配置方式：

| 需求 | 做法 |
|------|------|
| 缩放上下限、双击缩放、`onNodeClick` 等 | Root 的 **`reactFlowProps`**（透传给底层 React Flow；SDK 已占用的 props 不能覆盖） |
| 只读模式 | **`useWorkflowBuilderActions().setReadOnly(true)`** / `toggleReadOnly()`；顶栏也有只读开关 |
| 网格 / snap | `reactFlowProps` 传入 `snapToGrid` / `snapGrid`（以 `@xyflow/react` 为准） |
| 主题 | `actions.setTheme('light' \| 'dark')` |

```tsx
import {
  WorkflowBuilder,
  type WorkflowBuilderReactFlowProps,
} from '@workflowbuilder/sdk';

// 建议模块级常量，避免每次 render 新对象
const reactFlowProps = {
  minZoom: 0.2,
  maxZoom: 1.8,
  snapToGrid: true,
  snapGrid: [20, 20],
  zoomOnDoubleClick: false,
  onNodeClick: (_evt, node) => {
    console.log('点击节点', node.id);
  },
} satisfies WorkflowBuilderReactFlowProps;

<WorkflowBuilder.Root
  name="canvas-config-demo"
  nodeTypes={demoPaletteItems}
  initialNodes={preDefinedNodes}
  initialEdges={preDefinedEdges}
  reactFlowProps={reactFlowProps}
  integration={{ strategy: 'props', onDataSave: async () => 'success' }}
/>
```

SDK 自行管理的 React Flow 键不可通过 `reactFlowProps` 覆盖，例如：`nodes` / `edges` / `onNodesChange` / `onEdgesChange` / `onSelectionChange` / `nodesDraggable` / `nodesConnectable` / `isValidConnection` 等。只读拖拽禁用由 SDK 只读模式统一处理。

#### 4.3.1 只读模式完整示例（工作流预览）

```tsx
import { useEffect } from 'react';
import { WorkflowBuilder, useWorkflowBuilderActions } from '@workflowbuilder/sdk';

/** 挂载后立即进入只读 */
function ReadOnlyOnMount() {
  const { setReadOnly } = useWorkflowBuilderActions();
  useEffect(() => {
    setReadOnly(true);
  }, [setReadOnly]);
  return null;
}

export default function WorkflowPreview() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="workflow-preview"
        nodeTypes={demoPaletteItems}
        initialNodes={preDefinedNodes}
        initialEdges={preDefinedEdges}
        integration={{ strategy: 'props', onDataSave: async () => 'success' }}
      >
        <WorkflowBuilder.DefaultLayout />
        <ReadOnlyOnMount />
      </WorkflowBuilder.Root>
    </div>
  );
}
```

只读模式生效项：

- ❌ 禁止拖拽节点、新增 / 删除节点  
- ❌ 禁止随意改连线 / 编辑属性  
- ✅ 仍可平移、缩放查看画布  

---

### 4.4 布局 API：方向切换与自动布局

#### 4.4.1 布局方向

```tsx
import { useWorkflowBuilderActions, useFitView } from '@workflowbuilder/sdk';

export function useLayoutDirectionHelper() {
  const actions = useWorkflowBuilderActions();
  const fitView = useFitView();

  /** 设置方向（幂等；不会自动重算每个节点的 x/y） */
  function setDirection(direction: 'DOWN' | 'RIGHT') {
    actions.setLayoutDirection(direction);
  }

  /**
   * 切换方向；可选 flipPositions（按轴交换 x/y）+ fitView
   */
  function toggleDirection() {
    actions.toggleLayoutDirection({ flipPositions: true, fitView: true });
  }

  return { setDirection, toggleDirection, fitView };
}
```

UI 示例：

```tsx
const { setDirection, toggleDirection, fitView } = useLayoutDirectionHelper();

return (
  <>
    <button type="button" onClick={() => setDirection('DOWN')}>
      方向：向下
    </button>
    <button type="button" onClick={() => setDirection('RIGHT')}>
      方向：向右
    </button>
    <button type="button" onClick={toggleDirection}>
      切换方向并翻转坐标
    </button>
    <button type="button" onClick={() => fitView()}>
      适应画布
    </button>
  </>
);
```

#### 4.4.2 自动布局（ELK 插件）

一键重排节点坐标可使用官方可选 **Auto Layout（ELK）** 插件：https://www.workflowbuilder.io/docs/plugins/elk-layout/

- 顶栏增加 **Auto Layout**、**Direction Toggle**  
- 适合：导入外部图后节点重叠、批量加节点后一键整理  

加载外部 graph 之后的推荐顺序：

1. `setStoreNodes` / `setStoreEdges`  
2. 若已接入 ELK 插件：触发其 Auto Layout  
3. 调用 `useFitView()` 适配视口  

若未安装 ELK 插件，应保证导入 JSON 里 `position` 合理，或引导用户手动拖拽 + `fitView`。

---

### 4.5 事件系统

观察画布交互可用：

1. **Listener API**  
   - `addNodeChangedListener` / `removeNodeChangedListener`  
   - `useNodeChangedListener`（React，自动清理）  
   - `addNodeDragStartListener` / `useNodeDragStartListener`  
2. **选中态**  
   - `useSingleSelectedElement()`：恰好选中一个 node 或 edge 时返回，否则 `null`  
   - `getStoreSelection()` / `resetStoreSelection()`  
3. **reactFlowProps 回调**  
   - 如 `onNodeClick` / `onMoveEnd`（未被 SDK 占用的回调）  
4. **变更审计**  
   - `registerFunctionDecorator('trackFutureChange', …)`  

```tsx
import React from 'react';
import {
  WorkflowBuilder,
  useNodeChangedListener,
  useSingleSelectedElement,
  useWorkflowBuilderActions,
} from '@workflowbuilder/sdk';

function EventProbe() {
  const selected = useSingleSelectedElement();
  const { setReadOnly } = useWorkflowBuilderActions();

  // 节点变更（拖拽、增删改等）——可能较频繁
  useNodeChangedListener((changes) => {
    console.log('node changes', changes);
  });

  React.useEffect(() => {
    if (selected?.node) {
      console.log('当前单选节点 ID：', selected.node.id, selected.node.data.type);
    } else if (selected?.edge) {
      console.log('当前单选边 ID：', selected.edge.id);
    } else {
      console.log('无单选元素');
    }
  }, [selected]);

  return (
    <button type="button" onClick={() => setReadOnly(true)}>
      切只读
    </button>
  );
}

<WorkflowBuilder.Root
  name="event-listen-demo"
  nodeTypes={demoPaletteItems}
  initialNodes={preDefinedNodes}
  initialEdges={preDefinedEdges}
  reactFlowProps={{
    onMoveEnd: (_evt, viewport) => {
      console.log('视口 / 缩放相关', viewport);
    },
  }}
  integration={{ strategy: 'props', onDataSave: async () => 'success' }}
>
  <WorkflowBuilder.DefaultLayout />
  <EventProbe />
</WorkflowBuilder.Root>
```

#### 4.5.1 事件使用注意事项

1. **`useNodeChangedListener` / `trackFutureChange`**：画布改动会频繁触发，**不要**在回调里直接打保存接口，需要防抖 / 节流。  
2. 业务正式保存优先使用 **`integration.onDataSave`** 或 **`actions.save()`**，由用户或明确业务流程触发。

### 4.6 本章完整可运行示例（本仓库）

| 文件 | 说明 |
|------|------|
| `src/examples/Ch4GraphEventsDemo.tsx` | `initialNodes/Edges` 预加载 + 序列化导出 + 选中/变更监听 + 只读/布局方向/`reactFlowProps` |
| `src/App.tsx` | `export { default } from './examples/Ch4GraphEventsDemo'` |

```bash
# App.tsx 指向 Ch4 后
npm run dev
```

**可验证：**

1. 页面加载即渲染 trigger → action → notification；  
2. 「序列化导出 / 保存」打印 `IntegrationDataFormat`；  
3. 拖拽节点时控制台有 `node changes`；点选节点有单选日志；  
4. 「只读 / 编辑」切换；「方向 DOWN/RIGHT」「切换方向并翻转」「适应画布」；  
5. 缩放/平移结束有 `视口变化`（`reactFlowProps.onMoveEnd`）。  

完整源码见 `src/examples/Ch4GraphEventsDemo.tsx`。

### 4.7 本章小结（第 4 章）

1. Graph 契约是 **`IntegrationDataFormat`**：`getStoreDataForIntegration()` 导出；`props` 策略用 **`initialNodes` / `initialEdges`** 初始化；运行时用 **`setStoreNodes` / `setStoreEdges`**。  
2. 节点业务数据在 **`data.type` + `data.properties`**；边用 **`source` / `target`**。  
3. 画布微调用 **`reactFlowProps`**；只读用 **`setReadOnly` / `toggleReadOnly`**。  
4. 核心 SDK 提供 **布局方向** 与 **`useFitView`**；真正的自动排布可用可选 **ELK Auto Layout 插件**。  
5. 事件用 **Listener + selection hooks + reactFlowProps**；区分高频变更监听与正式 **`onDataSave`**。  
6. **可运行示例：** `src/examples/Ch4GraphEventsDemo.tsx`（见 4.6）。

---

## 附录：本仓库可对照文件

| 文件 | 作用 |
|------|------|
| `src/App.tsx` | 各章示例切换入口 |
| `src/examples/Ch3CustomNodePluginDemo.tsx` | 第 3 章完整可运行示例 |
| `src/examples/Ch4GraphEventsDemo.tsx` | 第 4 章完整可运行示例 |
| `src/palette.ts` | Demo 节点注册 |
| `src/nodes/**` | 官方 Demo 节点（schema / uischema 范本） |
| `docs/workflow-builder-learning-ch1-ch2.md` | 第 1–2 章 |

## 附录：官方文档入口

- 添加自定义节点：https://www.workflowbuilder.io/docs/guides/add-a-custom-node/  
- 构建插件：https://www.workflowbuilder.io/docs/guides/build-a-plugin/  
- 配置编辑器：https://www.workflowbuilder.io/docs/guides/configuring-the-editor/  
- Auto Layout 插件：https://www.workflowbuilder.io/docs/plugins/elk-layout/  
- `useWorkflowBuilderActions`：https://www.workflowbuilder.io/docs/api/hooks/useworkflowbuilderactions/  
- Store：https://www.workflowbuilder.io/docs/api/store/usestore/  

---

*第 5–6 章（错误处理 / 重试 / 持久化、条件分支 / 循环 / 并行 / 子工作流）见：`docs/workflow-builder-learning-ch5-ch6.md`。*
