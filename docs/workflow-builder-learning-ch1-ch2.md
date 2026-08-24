# Workflow Builder 完整学习资料（基于官方最新文档 `@workflowbuilder/sdk`）

> **校正说明（相对原稿）**  
> 本稿已按官方文档（[workflowbuilder.io/docs](https://www.workflowbuilder.io/docs/overview/)）、npm 包 `@workflowbuilder/sdk@2.3.x` 类型定义，以及本仓库 `wf-builder-demo` **已跑通** 的代码校正。  
> 原稿中若干关键错误（如 `builtinNodeTypes`、节点 properties 臆造结构、Graph 字段名、仅两种 integration 策略等）已标注并替换为正确写法。

- **项目官网：** https://www.workflowbuilder.io  
- **SDK 包：** `@workflowbuilder/sdk` — React 可视化工作流画布 SDK，可嵌入自有产品；执行侧可对接 Temporal 等引擎（编辑器本身只产出 JSON，不负责执行）。  
- **文档分多章节；本章：第 1 章 + 第 2 章。**

---

## 第 1 章 概述 & 核心概念 & 环境准备 & Hello World

### 1.1 什么是 Workflow Builder

`@workflowbuilder/sdk` 是一套开源 React 可视化工作流编辑器 SDK，核心能力：

1. **拖拽式画布**，定义有向图工作流（节点 Node + 连线 Edge）
2. **官方 Demo 提供一批开箱即用节点示例**：Trigger、Action、Conditional、Decision、Delay、Notification、AI Agent、Multi-port  
   - ⚠️ **校正：** 这些节点类型 **并不随 npm 包自动注册到画布**。SDK 的 `nodeTypes` 默认为空数组；示例节点在官方仓库 `apps/demo/src/app/data/nodes/`，需拷贝进业务项目后传入 `nodeTypes`。  
   - **不存在** `builtinNodeTypes` / `builtinNodes` 这类可直接 import 的导出。
3. **完整扩展点**：自定义节点、自定义表单（JsonForms）、插件系统、事件监听
4. **输出标准 JSON 工作流定义**，可对接后端执行引擎（官方参考后端可接 Temporal）
5. **三种持久化 / 集成策略**（`IntegrationStrategy`）：
   1. `localStorage`（**默认**）：浏览器本地读写
   2. `props`：前端回调 `onDataSave` + `initialNodes` / `initialEdges` 回显
   3. `api`：自动 `GET` load / `POST` save

集成模式从产品视角也可理解为：

1. **仅前端编辑器**：拿到 Graph JSON，自己对接业务执行引擎  
2. **全栈方案**：编辑器 + 参考后端 + Temporal worker，开箱运行工作流实例

### 1.2 核心术语（官方定义）

| 术语 | 说明 |
|------|------|
| **Node（节点）** | 工作流图上每一个单元。画布上的 ReactFlow 节点类型为 `WorkflowBuilderNode`；业务类型在 `data.type`（如 `"trigger"`），可编辑配置在 `data.properties`，节点定义侧还有 `schema`（JSON Schema）与 `uischema`（属性面板 UI） |
| **Edge（连线）** | 有向边。持久化结构遵循 ReactFlow：`source` / `target`（以及可选 handle）。边上可带 `data.label` 等；决策/条件分支的出口多通过 **节点上的多 handle** 或条件节点表达，而非原稿臆造的 `sourceNodeId` / `condition.operator` 固定形状 |
| **Graph（工作流图）** | 保存 / 加载的核心对象，类型为 `IntegrationDataFormat`：`name` + `globalVariables` + `layoutDirection` + `nodes` + `edges` |
| **Root** | `<WorkflowBuilder.Root>` 根组件，画布入口，管理集成策略、插件、节点类型注册等 |
| **Integration Strategy** | `localStorage` \| `api` \| `props`，控制如何保存 / 加载图数据 |
| **Plugin** | 扩展机制：`registerComponentDecorator` / `registerFunctionDecorator` / `registerPluginTranslation` 等（**不是**「注册节点」的唯一方式；节点主要靠 `nodeTypes`） |
| **Store** | 内部 Zustand 状态；提供 `getStoreNodes` / `setStoreNodes`、各类 `add*Listener` / `use*Listener` 等 |
| **Properties Panel** | 属性侧边栏；选中节点时按该节点 `schema` + `uischema` 用 JsonForms 渲染配置表单 |
| **PaletteItem / nodeTypes** | 左侧节点库条目；必须传给 `<WorkflowBuilder.Root nodeTypes={...} />` 才会出现可拖拽节点 |

### 1.3 前置依赖

- **React** `^18` 或 `^19`
- **TypeScript** 推荐（SDK 自带完整 `.d.ts`）
- **Node.js** `>=18`（SDK `engines`）；新建 Vite 项目建议用较新 LTS
- 包管理器：npm / pnpm / yarn

**Peer 依赖（安装 SDK 时建议一并安装，避免运行时缺模块）：**

```bash
# 安装 SDK 本体 + 官方要求的 peer 依赖
# @xyflow/react：底层画布（React Flow）
# zustand：SDK 内部状态库，需与宿主共用同一份
npm install @workflowbuilder/sdk @xyflow/react zustand
```

若要做中文界面（见 1.8），还需：

```bash
# i18next 系列：与 SDK 共享同一 i18n 单例，才能注入中文壳子文案
# 版本尽量钉在 24 / 15，与 SDK 依赖对齐，避免两套实例互相打架
npm install i18next@24 react-i18next@15 i18next-browser-languagedetector
```

（版本尽量与 SDK 内依赖的 i18next 24 / react-i18next 15 对齐，并用 Vite `resolve.dedupe` 保证单例。）

### 1.4 安装

```bash
# —— 任选一种包管理器 ——

# npm：安装 SDK + peer
npm install @workflowbuilder/sdk @xyflow/react zustand

# pnpm
pnpm add @workflowbuilder/sdk @xyflow/react zustand

# yarn
yarn add @workflowbuilder/sdk @xyflow/react zustand
```

**必须**引入样式，否则画布错乱：

```ts
// 引入 SDK 打包好的全局样式（节点、面板、顶栏、主题变量等）
// 漏掉这一行会出现：画布无网格/面板错位/按钮无样式
import "@workflowbuilder/sdk/style.css";
```

**全屏布局注意（Vite 模板坑）：**  
Vite React 模板的 `src/index.css` 常含 `#root { width: 1126px; margin: 0 auto; }`，会把右侧 **属性栏挤出视口**。工作流全页应用应改为：

```css
/* 让 html/body/#root 占满视口，避免 Vite 默认 1126px 居中布局 */
html,
body,
#root {
  margin: 0;           /* 去掉浏览器默认外边距 */
  width: 100%;         /* 宽度撑满视口（不要写死 1126px） */
  height: 100%;        /* 高度撑满，画布才能 100% 填满 */
  overflow: hidden;    /* 禁止整页滚动，滚动交给画布内部 */
}

/* 若模板还写了 text-align: center，务必清掉，否则浮动面板定位会怪 */
#root {
  text-align: initial;
}
```

### 1.5 最小可运行示例 1：Props 模式（保存回调）

`integration.strategy = "props"`：由宿主控制持久化。点击【保存】触发 `onDataSave`。  
初始图画布用 `initialNodes` / `initialEdges` 传入；**不传则空画布**。刷新是否丢失取决于你是否在回调里落库并在下次挂载时回填。

#### 1.5.0 先准备官方 Demo 节点（校正原稿「不传 nodeTypes 也会有内置节点」）

SDK **不会**自动加载任何业务节点。正确做法：

1. 从官方仓库拷贝节点目录：  
   https://github.com/synergycodes/workflowbuilder/tree/main/apps/demo/src/app/data/nodes  
2. 放到例如 `src/nodes/`  
3. 用 `src/palette.ts` 组装后传给 `nodeTypes`

本仓库已包含该结构，示意：

```ts
// ============================================================
// 文件：src/palette.ts
// 作用：把官方 Demo 节点定义组装成左侧「节点库」列表，
//      再通过 <WorkflowBuilder.Root nodeTypes={...} /> 注册进去。
// ============================================================

// PaletteItemOrGroup：单个节点定义，或「分组 + 多个节点」
import type { PaletteItemOrGroup } from "@workflowbuilder/sdk";

// 以下每个 import 对应一个节点文件夹里的 PaletteItem 导出
// （每个节点通常含：xxx.ts / schema.ts / uischema.ts / default-properties-data.ts）
import { action } from "./nodes/action/action";                 // 动作节点
import { aiAgent } from "./nodes/ai-agent/ai-agent";           // AI 智能体
import { conditional } from "./nodes/conditional/conditional"; // 条件（真/假）节点
import { decision } from "./nodes/decision/decision";         // 多分支决策节点
import { delay } from "./nodes/delay/delay";                   // 延时节点
import { multiPort } from "./nodes/multi-port/multi-port";     // 多端口示例节点
import { notification } from "./nodes/notification/notification"; // 通知节点
import { triggerNode } from "./nodes/trigger/trigger";         // 触发器节点

/**
 * 传给 Root 的 nodeTypes 数组。
 *
 * 重要：必须是「模块级稳定引用」——
 * 不要写在 React 组件函数体内（每次 render 都会新建数组，
 * 会覆盖 SDK 内部 palette 缓存，导致节点库异常刷新）。
 */
export const demoPaletteItems: PaletteItemOrGroup[] = [
  triggerNode,   // 入口
  action,        // 业务动作
  delay,         // 等待
  conditional,   // 二路条件
  decision,      // 多路决策
  notification,  // 通知
  aiAgent,       // AI
  multiPort,     // 多端口教学节点
];
```

#### App.tsx（Props 模式，可直接运行）

```tsx
// ============================================================
// 文件：src/App.tsx
// 作用：Props 集成策略下的最小可运行示例。
// 保存时 SDK 调用 onDataSave，由你决定如何落库。
// ============================================================

// WorkflowBuilder：命名空间组件；实际入口是 WorkflowBuilder.Root
import { WorkflowBuilder } from "@workflowbuilder/sdk";
// 必须引入样式，否则画布/面板样式错乱
import "@workflowbuilder/sdk/style.css";

// 上一节组装好的节点库（稳定引用）
import { demoPaletteItems } from "./palette";

export default function App() {
  return (
    // 外层容器占满 #root；配合 1.4 的全屏 CSS
    <div style={{ width: "100%", height: "100%" }}>
      <WorkflowBuilder.Root
        // 工作流显示名：出现在顶栏，并写入保存 JSON 的 name 字段
        name="demo hello workflow"

        // 自动布局方向：
        //   DOWN  — 节点大致从上往下排
        //   RIGHT — 节点大致从左往右排
        layoutDirection="DOWN"

        // 注册左侧节点库；不传或传 [] 则面板为空
        nodeTypes={demoPaletteItems}

        // ========== 集成策略：props ==========
        // 特点：SDK 不直接碰后端；保存只回调给你
        integration={{
          strategy: "props",

          /**
           * 用户点击顶栏【保存】时触发（也可能有自动保存场景，
           * 此时第二参 savingParams.isAutoSave === true）。
           *
           * @param graphData IntegrationDataFormat
           *   { name, globalVariables, layoutDirection, nodes, edges }
           * @returns Promise<'success' | 'error' | 'alreadyStarted'>
           *   - 需要错误 snackbar 时：在回调里 throw，而不是只 return 'error'
           */
          onDataSave: async (graphData) => {
            // 开发阶段：先把完整图打印到控制台，熟悉数据结构
            console.log("=== 保存工作流 Graph JSON ===");
            console.log(JSON.stringify(graphData, null, 2));

            // —— 真实业务示例（按需取消注释）——
            // await fetch("/api/workflow/save", {
            //   method: "POST",
            //   headers: { "Content-Type": "application/json" },
            //   body: JSON.stringify(graphData), // 整份 Graph 提交后端
            // });

            // 告诉 SDK「保存流程走完了」；成功类 snackbar 会弹出
            return "success";
          },
        }}

        // 可选：回显已有流程
        // initialNodes={...}
        // initialEdges={...}
      />
    </div>
  );
}
```

运行：`npm run dev`，打开控制台给出的链接（一般 `http://localhost:5173`）。

- 左侧 **节点库** 可拖入节点、连线  
- 选中节点 → 右侧 **属性** 面板  
- 点顶部 **保存** → 控制台打印完整 `IntegrationDataFormat` JSON

#### 1.5.1 上面示例是如何运行的

这段是 React + TSX，放到 Vite React 项目的 `src/App.tsx`。

**步骤 1：创建 Vite React 项目（没有项目就新建）**

```bash
# 用 Vite 官方脚手架创建「React + TypeScript」项目
# -- 后面的参数传给 create-vite，而不是传给 npm 本身
npm create vite@latest wf-builder-demo -- --template react-ts
```

| 片段 | 含义 |
|------|------|
| `npm create vite@latest` | 用最新 Vite 脚手架创建项目 |
| `wf-builder-demo` | 项目目录名 |
| `-- --template react-ts` | React + TypeScript 模板 |

```bash
# 进入项目目录
cd wf-builder-demo

# 安装模板自带依赖（react、react-dom、vite、typescript 等）
npm install
```

**步骤 2：安装 SDK 与 peer**

```bash
# 工作流编辑器本体 + 画布 peer + 状态 peer
npm install @workflowbuilder/sdk @xyflow/react zustand
```

**步骤 3：拷贝官方 Demo 节点 + 编写 `palette.ts` + 覆盖 `src/App.tsx`**（见上）

**步骤 4：修正 `src/index.css` 为全屏**（见 1.4）

**步骤 5：启动**

```bash
# 启动 Vite 开发服务器（热更新），默认端口多为 5173
npm run dev
```

`package.json` 中典型 scripts：

```json
{
  "scripts": {
    // 本地开发：启动 vite，带 HMR
    "dev": "vite",
    // 生产构建：先 tsc 类型检查，再打包
    "build": "tsc -b && vite build",
    // 预览 build 产物
    "preview": "vite preview"
  }
}
```

`npm run dev` → 执行 `vite` 本地开发服务器。

#### 1.5.2 验证效果

1. 页面出现可视化工作流画布  
2. 左侧能看到触发器 / 动作 / 延迟等节点并拖到画布  
3. 选中节点，右侧出现属性面板  
4. 点【保存】，F12 → Console 打印 graph JSON  

#### 1.5.3 Props 模式关键点

- 数据是否持久化 **完全由你** 在 `onDataSave` 与下次 `initialNodes` / `initialEdges` 决定  
- SDK **不会**在 props 模式下自动请求后端  
- `onDataSave` 必须 `return "success" | "error" | "alreadyStarted"`；若要错误 snackbar，应在回调里 **throw**  
- 回显已有流程：挂载时传 `initialNodes` / `initialEdges`（或改用 `api` / `localStorage` 策略）

### 1.6 最小可运行示例 2：REST API 持久化模式

`integration.strategy = "api"`：SDK 自动对 `endpoints.load` 发 **GET**、对 `endpoints.save` 发 **POST**。

```tsx
// ============================================================
// 文件：AppApiMode.tsx（示例组件）
// 作用：api 策略 — SDK 自动 GET 加载、POST 保存，适合正式业务。
// 前提：你的后端已实现 load / save 两个接口。
// ============================================================

import { WorkflowBuilder } from "@workflowbuilder/sdk";
import "@workflowbuilder/sdk/style.css";
// 同样必须注册节点，否则左侧节点库为空
import { demoPaletteItems } from "./palette";

export default function AppApiMode() {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <WorkflowBuilder.Root
        // 顶栏显示名；也会进入持久化文档的 name 字段
        name="my persisted workflow"
        layoutDirection="DOWN"
        nodeTypes={demoPaletteItems}

        // ========== 集成策略：api ==========
        integration={{
          strategy: "api",
          endpoints: {
            // 挂载时 SDK 发 GET，期望返回图数据（nodes/edges 等）
            load: "/api/workflow/load?id=1",
            // 用户点保存时 SDK 发 POST，body 为 IntegrationDataFormat
            save: "/api/workflow/save?id=1",
          },
        }}
      />
    </div>
  );
}
```

**后端接口约定（与官方 persistence 文档一致的方向）：**

1. **GET** `endpoints.load`：返回可被 SDK 消化的图数据（至少包含 `nodes` / `edges`；完整形状对齐 `IntegrationDataFormat` 更稳妥）  
2. **POST** `endpoints.save`：body 为保存时的图数据  

具体字段以你对接的后端契约为准；前端类型以 SDK 的 `IntegrationDataFormat` 为准。

#### 1.6.0 第三种策略：localStorage（默认）

省略 `integration` 或 `{ strategy: "localStorage" }` 时，SDK 读写浏览器 `localStorage` 固定键 `workflowBuilderDiagram`（**不**按 `name` 区分多工作流）。适合本地原型。

```tsx
// 最简写法：不写 integration，等价于 localStorage 策略
<WorkflowBuilder.Root
  name="local-demo"
  nodeTypes={demoPaletteItems}
  // integration 省略 ⇒ strategy: 'localStorage'
  // 数据键名固定为 localStorage['workflowBuilderDiagram']
/>

// 或显式写出：
<WorkflowBuilder.Root
  name="local-demo"
  nodeTypes={demoPaletteItems}
  integration={{ strategy: "localStorage" }}
/>
```

#### 1.6.1 三种策略对比

| 策略 | 存储位置 | 保存行为 | 加载行为 | 使用场景 |
|------|----------|----------|----------|----------|
| `localStorage` | 浏览器本地 | 自动写 localStorage | 自动读回 | 本地原型、演示 |
| `props` | 由宿主决定 | 调用 `onDataSave` | 靠 `initialNodes` / `initialEdges` | 嵌入业务系统、完全自控 |
| `api` | 后端 HTTP | 自动 POST save | 自动 GET load | 标准前后端分离 |

**Props 模式一句话：** SDK 负责画布与产出 JSON；「读与写」后端全部交给你的回调 / 初始 props。

### 1.7 Graph JSON 数据结构（保存回调里的标准格式）

类型名：`IntegrationDataFormat`（官方 callback 文档与 `index.d.ts`）。

```ts
/**
 * 保存 / 加载时使用的标准文档形状。
 * props.onDataSave 的第一参数、api POST body、localStorage 内容都基于它。
 */
type IntegrationDataFormat = {
  /** 工作流名称（对应 Root 的 name，可在设置里改） */
  name: string;

  /** 全局变量表（顶栏「设置 → 全局变量」维护） */
  globalVariables: VariablesIndex;

  /** 布局方向：DOWN | RIGHT */
  layoutDirection: "DOWN" | "RIGHT";

  /** 画布节点列表（ReactFlow Node + SDK 的 NodeData） */
  nodes: WorkflowBuilderNode[];

  /** 画布连线列表（ReactFlow Edge） */
  edges: WorkflowBuilderEdge[];
};
```

**示意（字段名以实际控制台输出为准；以下为形状说明，非臆造业务字段）：**

```jsonc
{
  // 工作流显示名
  "name": "demo hello workflow",
  // 自动布局方向
  "layoutDirection": "DOWN",
  // 全局变量（可为空对象）
  "globalVariables": {},

  "nodes": [
    {
      // 节点唯一 id（SDK / ReactFlow 生成）
      "id": "xxxx",
      // ReactFlow 渲染用的「模板类型」，常见 "node" / "decision-node" 等
      // ⚠️ 不是业务类型！业务类型在 data.type
      "type": "node",
      // 画布坐标
      "position": { "x": 100, "y": 100 },
      "data": {
        // ★ 业务节点类型：与 PaletteItem.type 对应，如 trigger / action
        "type": "trigger",
        // 画布与节点库上显示的图标名
        "icon": "Lightning",
        // ★ 属性面板里编辑的全部配置
        "properties": {
          // 常为 i18n key；面板标题也会用到
          "label": "node.trigger.label",
          "description": "node.trigger.description",
          // 触发器子类型（时间 / 事件 / …）
          "type": "timeBasedTrigger",
          // 节点状态：active | draft | disabled
          "status": "active"
        }
      }
    }
  ],

  "edges": [
    {
      "id": "yyyy",
      // ★ 起点 / 终点节点 id（ReactFlow 字段名，不是 sourceNodeId）
      "source": "xxxx",
      "target": "zzzz",
      // 边的渲染类型；SDK 默认常用 labelEdge
      "type": "labelEdge",
      "data": {
        // 连线上显示的文字标签（可选）
        "label": ""
      }
    }
  ]
}
```

⚠️ **相对原稿的校正：**

| 原稿 | 正确 |
|------|------|
| 节点顶层 `"type": "trigger"` | 业务类型在 **`data.type`**；ReactFlow 的 `type` 常为模板类型（如 `"node"` / `"decision-node"`） |
| 配置在顶层 `"properties"` | 配置在 **`data.properties`** |
| Edge 用 `sourceNodeId` / `targetNodeId` | 使用 ReactFlow 的 **`source` / `target`** |
| 固定 `condition: { operator, value }` | 以你实际保存的 edge `data` / handle 为准；决策分支多在节点 `decisionBranches` 与多出口 handle 上 |

这是编辑器与后端之间的**数据契约载体**；执行引擎（如 Temporal worker）需自行解析该 JSON。

### 1.8 中文界面（官方能力边界 + 本仓库做法）

#### 官方现状

- SDK 内置语言包只有 **`en` / `pl`**
- 顶栏语言切换器只列出 EN、PL  
- `registerPluginTranslation` **只能**往 `plugins.*` 命名空间加文案，**不能**翻译「保存 / 节点库 / 属性」等核心键  
- 属性面板里的 `All Day`、`Frequency` 等来自 **节点 `uischema` / `schema` 硬编码英文**，**不走** SDK i18n  

因此：**没有「不改任何配置就一键官方中文」的开关。**

#### 不改 SDK 包、可覆盖的壳子文案（本仓库已做）

利用 SDK 与宿主共享的 `i18next` 单例：

```ts
// ============================================================
// 文件：src/i18n/setup.ts
// 作用：在 SDK 初始化 i18n 之后，注入中文资源包并切换语言。
// 注意：必须在渲染 <WorkflowBuilder.Root> 之前执行（建议在 main.tsx 最先 import）。
// ============================================================

// 1) 先 import SDK：触发其内部 i18next.init（内置 en / pl）
import "@workflowbuilder/sdk";

// 2) 再取同一份 i18next 默认实例（需 Vite dedupe，避免两套实例）
import i18n from "i18next";

// 3) 你维护的中文翻译表（键结构对齐 SDK 的 en 文案树）
import { zhTranslation } from "./zh";

// deep=true, overwrite=true：深度合并并覆盖同名键
i18n.addResourceBundle(
  "zh",            // 语言码（load: languageOnly 时 zh-CN 也会落到 zh）
  "translation",   // 命名空间，与 SDK 一致
  zhTranslation,   // { common, palette, node, tooltips, ... }
  true,            // deep
  true,            // overwrite
);

// 覆盖浏览器语言检测 / localStorage 里可能残留的 en
// void：故意不 await，启动阶段异步切语言即可
void i18n.changeLanguage("zh");
```

在 `main.tsx` **最先**导入：

```tsx
// ============================================================
// 文件：src/main.tsx
// ============================================================
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// ★ 必须在 App 之前：先完成中文资源注册与 changeLanguage
import "./i18n/setup";

import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Vite 建议：

```ts
// vite.config.ts（节选）
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // 强制宿主与 SDK 共用同一份依赖，i18next / React 单例才生效
    dedupe: [
      "i18next",
      "react-i18next",
      "i18next-browser-languagedetector",
      "react",
      "react-dom",
    ],
  },
});
```

效果：顶栏、节点库标题/描述（若节点 label 使用 `node.trigger.label` 这类 i18n key）、属性面板标题「属性」等可为中文。

#### 属性表单字段中文

需改业务侧 `src/nodes/**/uischema.ts`、`schema.ts` 中的 `label` / `text` / options（**改的是 Demo 节点源码拷贝，不是 `node_modules` 里的 SDK**）。

### 1.9 本章完整可运行示例（本仓库）

| 文件 | 说明 |
|------|------|
| `src/examples/Ch1HelloWorldDemo.tsx` | Props 保存 + 全部 Demo `nodeTypes`；空画布 Hello World |
| `src/App.tsx` | `export { default } from './examples/Ch1HelloWorldDemo'` |

```bash
npm run dev
```

**可验证：**

1. 打开页面后左侧节点库有 Trigger / Action / Delay 等 Demo 节点；  
2. 从左侧拖节点到画布、连线；  
3. 点顶栏保存，控制台打印完整 `IntegrationDataFormat` JSON；  
4. 返回值 `'success'` 后出现保存成功提示。  

核心代码：

```tsx
import { WorkflowBuilder } from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';
import { demoPaletteItems } from '../palette';

export default function Ch1HelloWorldDemo() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <WorkflowBuilder.Root
        name="ch1-hello-world"
        layoutDirection="DOWN"
        nodeTypes={demoPaletteItems}
        integration={{
          strategy: 'props',
          onDataSave: async (graph) => {
            console.log(JSON.stringify(graph, null, 2));
            return 'success';
          },
        }}
      />
    </div>
  );
}
```

### 本章小结（第 1 章）

1. 完成环境搭建；掌握 **props / api / localStorage** 三种集成策略  
2. 核心概念：Node / Edge / Graph（`IntegrationDataFormat`）/ Root / `nodeTypes`  
3. **必须**自行提供 `nodeTypes`（拷贝官方 Demo 节点）；不存在 `builtinNodeTypes`  
4. 保存得到标准 Graph JSON，是前后端交互载体  
5. 中文：壳子可用 i18next 扩展；属性表单字段需改节点定义  
6. **可运行示例：** `src/examples/Ch1HelloWorldDemo.tsx`（见 1.9）

---

## 第 2 章 节点集合、节点配置、变量、可运行完整示例

承接上一章。本章覆盖官方 **Demo 内置示例节点**（需拷贝进项目），每个节点：用途、`data.type`、properties 形状、变量说明、可运行示例。

### 2.1 节点总览（校正「SDK 内置自动加载」）

⚠️ **校正：** SDK **没有** `builtinNodeTypes` 导出；也不会自动加载节点。  
正确流程：拷贝 `apps/demo/src/app/data/nodes` → 组装 palette → `nodeTypes={demoPaletteItems}`。

| `data.type` | 中文名（i18n key / 展示） | 作用 |
|-------------|---------------------------|------|
| `trigger` | 触发器 | 工作流入口步骤（编辑器层不强制「只能一个」，业务上通常建议一个） |
| `action` | 动作 | 发邮件、调 API、更新记录、脚本等 |
| `conditional` | 条件 | **是节点**（`type: "conditional"`），真/假分支；⚠️ 原稿写成「不是节点而是 Edge」不准确 |
| `decision` | 决策 | 多命名分支（`decisionBranches` + 多 handle） |
| `delay` | 延迟 | 固定 / 动态等延时类型 |
| `notification` | 通知 | 邮件 / SMS / Push / Webhook / Slack 等 |
| `aiAgent` | AI 智能体 | 模型、记忆、系统提示、工具槽 |
| `multi-port` | 多端口 | Demo 中的四端口路由示例节点 |

导入方式（正确）：

```tsx
// 从 SDK 引入复合组件命名空间
import { WorkflowBuilder } from "@workflowbuilder/sdk";
// 样式必引
import "@workflowbuilder/sdk/style.css";
// 自己组装的节点数组（不是 SDK 导出的 builtinNodeTypes）
import { demoPaletteItems } from "./palette";

// 把节点库挂到 Root；其余 props（integration / name 等）按需补全
<WorkflowBuilder.Root
  nodeTypes={demoPaletteItems}
  // name="..."
  // integration={{ ... }}
/>
```

### 2.2 最小完整示例：启用全部 Demo 节点

```tsx
// ============================================================
// 作用：一次注册全部 Demo 节点，验证节点库 + 保存输出。
// ============================================================

import { WorkflowBuilder } from "@workflowbuilder/sdk";
import "@workflowbuilder/sdk/style.css";
import { demoPaletteItems } from "./palette";

export default function AppBuiltinNodesDemo() {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <WorkflowBuilder.Root
        name="builtin nodes demo"
        layoutDirection="DOWN"
        // 左侧出现：触发器、动作、延迟、条件、决策、通知、AI、多端口
        nodeTypes={demoPaletteItems}
        integration={{
          strategy: "props",
          onDataSave: async (graph) => {
            // graph 即 IntegrationDataFormat
            console.log("graph输出：", JSON.stringify(graph, null, 2));
            // 告知 SDK 保存成功（弹出成功提示）
            return "success";
          },
        }}
      />
    </div>
  );
}
```

运行后预期：

1. 左侧可拖拽：触发器、动作、延迟、条件、决策、通知、AI 智能体、多端口  
2. 选中节点 → 右侧属性面板（字段文案默认为英文，除非你改了 uischema）  
3. 连线后可选中边编辑标签等  
4. 保存 → 控制台输出完整 Graph JSON  

### 2.3 逐个说明示例节点的 properties（以官方 Demo 源码为准）

> 下列结构来自仓库内 `src/nodes/**`（与官方 demo 一致）。  
> **原稿中的** `triggerType: manual|webhook|schedule`、`durationMs`、`channel: email` 等 **不是** 当前 Demo 节点的真实字段，已替换。

#### 2.3.1 trigger（`data.type = "trigger"`）

入口节点。`properties.type` 区分触发方式：

| value | 含义（Demo 英文 label） |
|-------|-------------------------|
| `timeBasedTrigger` | Time-based Trigger |
| `eventBasedTrigger` | Event-based Trigger |
| `conditionalTrigger` | Conditional Trigger |
| `systemTrigger` | System Trigger |

时间触发相关（节选）：

```ts
/**
 * 对应画布节点 data.properties（Trigger Demo）。
 * 属性面板由 schema + uischema 驱动；改文案就改那两个文件。
 */
properties: {
  /** 节点标题（常为 i18n key，如 node.trigger.label） */
  label: string;
  /** 节点描述 */
  description: string;

  /**
   * 触发子类型（注意：字段名也叫 type，
   * 与外层 data.type === "trigger" 不是同一层）
   */
  type: "timeBasedTrigger" | "eventBasedTrigger" | "conditionalTrigger" | "systemTrigger";

  /** 节点启用状态 */
  status: "active" | "draft" | "disabled";

  /** 时间触发：日程与频率 */
  timeSchedule: {
    allDay: boolean;                       // 是否全天
    starts: { date: string; time: string }; // 开始日期/时间
    ends: { date: string; time: string };   // 结束日期/时间
    frequency: string;                     // none | hourly | daily | weekly | ...
    allDayFrequency: string;               // 全天模式下的频率
  };

  /** 重试相关（时间触发面板里的 Retry Settings） */
  retrySettings: {
    interval: string; // every15min | every20min | every30min
    retries: string;  // "5" | "10" | "15"
    timeout: string;  // 30Min | 60Min | 90Min
  };

  /** 事件触发：事件类型 */
  eventType: string;

  /** 条件触发：规则与比较值 */
  condition: { rule: string; value: string };

  /** 系统触发：附加值 */
  systemValue: string;
}
```

`outputSchema`（变量选择器用）示例字段：`eventType`、`timestamp`、`payload`。

#### 2.3.2 action（`data.type = "action"`）

`properties.type` 为动作子类型，例如：

| value | 说明 |
|-------|------|
| `sendEmail` | 发邮件 |
| `updateRecord` | 更新记录 |
| `makeApiCall` | HTTP API |
| `createRecord` | 创建记录 |
| `executeScript` | 执行脚本 |
| `createNewDocument` | 创建文档 |

API 调用示意字段：`makeAPICall.apiUrl`、`httpMethod`、`headers`、`body`、`responseFormat`、`storeResponse` 等。  
默认数据里可见变量占位示例：

```ts
// 来自 action/default-properties-data.ts 的片段示意
updateRecord: {
  // {{...}} 是编辑器侧变量占位；执行期由后端引擎解析
  recordId: "{{order.id}}",
  dataSource: "crmSystem",
  objectType: "order",
  // ...
}
```

#### 2.3.3 decision（`data.type = "decision"`）

多分支：`properties.decisionBranches` 为数组（含 `id`、`sourceHandle`、`label`、`conditions` 等）。  
分支出口通过 **handle** 连到下游；不是原稿那种「节点只写一个 expression、条件全在 Edge.condition」的简化模型。

```ts
// 决策节点 properties 核心字段示意
properties: {
  label: string;
  description: string;
  status: "active" | "draft" | "disabled";
  /**
   * 每个元素对应一条命名分支 + 一个出口 handle
   * sourceHandle 用于连线时匹配出口
   */
  decisionBranches: Array<{
    id: string;
    sourceHandle: string;
    label: string;
    conditions: Array<{
      x: string;
      comparisonOperator: string;
      y: string;
      logicalOperator: string;
    }>;
  }>;
}
```

#### 2.3.4 conditional（`data.type = "conditional"`）

**是节点**，用于条件真/假分流（与 decision 的多命名分支不同）。  
详见 `src/nodes/conditional/`。

#### 2.3.5 delay（`data.type = "delay"`）

`properties.type`：`fixedDelay` | `dynamicDelay` | `conditionalDelay` | `untilSpecificDateTime` 等。  
时长相关在 `properties.duration`：`timeUnits`、`delayAmount`、`expression`、`maxWaitTime` 等。  
⚠️ 不是原稿的 `delayMode` + `durationMs` 二元结构。

```ts
// 延时节点 properties 示意
properties: {
  label: string;
  description: string;
  status: "active" | "draft" | "disabled";
  /** 延时模式 */
  type: "fixedDelay" | "dynamicDelay" | "conditionalDelay" | "untilSpecificDateTime";
  duration: {
    timeUnits: "none" | "minutes" | "hours"; // 固定延时的时间单位
    delayAmount: number;                     // 数量，如 5 分钟
    expression: string;                      // 动态延时表达式
    maxWaitTime: string;                     // 最大等待，如 "24"
  };
}
```

#### 2.3.6 notification（`data.type = "notification"`）

`properties.type`：`email` | `sms` | `pushNotification` | `webhook` | `slackMessage` 等；邮件内容在 `sendEmail` 等子对象中。

#### 2.3.7 aiAgent（`data.type` 以节点定义为准，Demo 为 AI Agent）

字段包括：`chatModel`、`memory`、`systemPrompt`、`tools` 等（见 `src/nodes/ai-agent/`）。

```ts
// AI Agent 默认 properties 示意（ai-agent/default-properties-data.ts）
properties: {
  label: string;
  description: string;
  status: "active" | "draft" | "disabled";
  chatModel: string;    // 如 gpt5.4 / gemini3.1pro / ...
  memory: string;       // 记忆策略
  systemPrompt: string; // 系统提示词
  tools: unknown[];     // 工具槽列表
}
```

#### 2.3.8 multi-port（`data.type = "multi-port"`）

Demo 教学节点：多端口连接示例。

### 2.4 变量插值语法

#### 2.4.1 编辑器侧

- 属性面板支持变量选择器（节点 `outputSchema` + 全局变量等驱动）  
- Demo 默认值中使用双花括号占位，例如 `{{order.id}}`  
- 顶栏 **设置** 中可维护 **全局变量**（落在 Graph 的 `globalVariables`）

```ts
// 文本类配置里嵌入变量的常见写法（编辑器保存原样字符串）
const body = "{\"orderId\":\"{{order.id}}\"}";
//                         ^^^^^^^^^^^ 占位符，执行期由引擎替换
```

#### 2.4.2 执行引擎侧（重要）

SDK **只负责编辑与序列化**；`{{...}}` 在 Temporal Worker / 自研引擎中如何解析，取决于**后端实现**。  

原稿中的：

```text
# 以下是「常见工作流引擎」风格的示意路径，不是 SDK 内置求值 API
{{workflow.input}}              # 整份工作流入参（示意）
{{workflow.input.orderId}}      # 入参字段（示意）
{{$steps.nodeId.output}}        # 某节点输出（示意）
{{$steps.nodeId.output.data}}   # 输出子字段（示意）
```

属于常见工作流引擎风格的示意，**不能**当作 `@workflowbuilder/sdk` 运行时已内置的求值规范。对接官方参考后端时，请以该后端 / Temporal worker 文档为准。

#### 2.4.3 边与条件

- 选中连线可编辑边上展示信息（如 label）  
- 复杂条件优先看 **conditional / decision 节点** 的 properties 与 handles  
- 不要假设所有边都有统一的 `{ left, operator, right }` 字段；以保存出的 JSON 为准  

### 2.5 实战示例：手动拼一条线性流程（编辑器操作）

在画布上拖拽：

`trigger` → `action`（如 Make API Call）→ `delay` → `notification`

保存后，用控制台 JSON 作为后端入参。下面给出 **形状示意**（id / 坐标为示例；`properties` 请以你面板真实配置为准）：

```jsonc
{
  // 工作流名称
  "name": "order-demo",
  // 布局方向：自上而下
  "layoutDirection": "DOWN",
  // 全局变量（本示例未使用）
  "globalVariables": {},

  "nodes": [
    // ---------- 1. 触发器 ----------
    {
      "id": "n1",
      "type": "node",                 // ReactFlow 模板类型
      "position": { "x": 200, "y": 20 },
      "data": {
        "type": "trigger",            // ★ 业务类型
        "icon": "Lightning",
        "properties": {
          "label": "node.trigger.label",
          "type": "timeBasedTrigger", // 时间触发
          "status": "active"
        }
      }
    },

    // ---------- 2. 动作：HTTP 调用 ----------
    {
      "id": "n2",
      "type": "node",
      "position": { "x": 200, "y": 160 },
      "data": {
        "type": "action",
        "icon": "PlayCircle",
        "properties": {
          "label": "node.action.label",
          "type": "makeApiCall",      // 动作子类型：调 API
          "status": "active",
          "makeAPICall": {
            "apiUrl": "https://api.demo.com/order",
            "httpMethod": "post",
            // body 内嵌 {{order.id}}：编辑器原样保存，后端执行时再解析
            "body": "{\"orderId\":\"{{order.id}}\"}"
          }
        }
      }
    },

    // ---------- 3. 延时 5 分钟 ----------
    {
      "id": "n3",
      "type": "node",
      "position": { "x": 200, "y": 320 },
      "data": {
        "type": "delay",
        "icon": "Timer",
        "properties": {
          "label": "node.delay.label",
          "type": "fixedDelay",       // 固定时长
          "status": "active",
          "duration": {
            "timeUnits": "minutes",
            "delayAmount": 5          // 等 5 分钟（业务语义由执行引擎实现）
          }
        }
      }
    },

    // ---------- 4. 通知：Webhook ----------
    {
      "id": "n4",
      "type": "node",
      "position": { "x": 200, "y": 480 },
      "data": {
        "type": "notification",
        "icon": "Bell",
        "properties": {
          "label": "node.notification.label",
          "type": "webhook",          // 通知子类型
          "status": "active"
          // 具体 webhookUrl / message 等以属性面板实际填写为准
        }
      }
    }
  ],

  // 线性连线：n1 → n2 → n3 → n4
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2" }, // 触发器 → 动作
    { "id": "e2", "source": "n2", "target": "n3" }, // 动作 → 延时
    { "id": "e3", "source": "n3", "target": "n4" }  // 延时 → 通知
  ]
}
```

将该 JSON 交给后端执行引擎解析运行；**编辑器不会执行** HTTP / 延时 / 通知。

### 2.6 本章完整可运行示例（本仓库）

| 文件 | 说明 |
|------|------|
| `src/examples/Ch2LinearFlowDemo.tsx` | 预置 `trigger → action → delay → notification` 线性图 + 保存 |
| `src/App.tsx` | `export { default } from './examples/Ch2LinearFlowDemo'` |

```bash
# 将 App.tsx 改为指向 Ch2 后
npm run dev
```

**可验证：**

1. 页面加载即渲染四节点一线流程；  
2. 选中各节点，右侧属性面板可见 Demo `properties`（如 action 的 Make API Call）；  
3. 可继续从左侧拖入 `conditional` / `decision` 等节点；  
4. 点「保存线性流程 Graph」，控制台输出含 `source`/`target` 与 `data.type` 的完整 JSON。  

核心结构：

```tsx
<WorkflowBuilder.Root
  name="ch2-linear-flow"
  nodeTypes={demoPaletteItems}
  initialNodes={/* n1 trigger … n4 notification */}
  initialEdges={[
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4' },
  ]}
  integration={{ strategy: 'props', onDataSave: async (g) => { console.log(g); return 'success'; } }}
>
  <WorkflowBuilder.DefaultLayout />
  <Toolbar />
</WorkflowBuilder.Root>
```

完整源码见 `src/examples/Ch2LinearFlowDemo.tsx`。

### 本章小结（第 2 章）

1. 用官方 Demo 节点目录 + `nodeTypes` 启用节点库；**没有** `builtinNodeTypes`  
2. 每个节点有 `data.type` + `data.properties`；定义侧有 `schema` / `uischema` / `defaultPropertiesData` / 可选 `outputSchema`  
3. `conditional` 是节点；`decision` 用分支数组 + 多 handle  
4. `{{}}` 用于编辑器变量占位；执行期语义由后端引擎定义  
5. 保存得到的 `IntegrationDataFormat` 是编辑器与执行引擎之间的数据契约  
6. **可运行示例：** `src/examples/Ch2LinearFlowDemo.tsx`（见 2.6）

---

## 附录 A：原稿错误对照表（便于复习）

| 原稿说法 | 校正 |
|----------|------|
| `import { builtinNodeTypes }` | **不存在**；拷贝 demo nodes + 自组 `demoPaletteItems` |
| 不传 `nodeTypes` 也有内置节点 | 默认为空；面板无节点 |
| 仅 props / api 两种策略 | 还有默认 **`localStorage`** |
| Graph 用 `sourceNodeId` / 顶层 `properties` | ReactFlow：`source`/`target`；业务数据在 `data` |
| trigger = manual/webhook/schedule | Demo 为 time/event/conditional/system based |
| delay = durationMs / untilTime | Demo 为 `type` + `duration.*` |
| conditional 不是节点 | Demo 中 **是** `conditional` 节点 |
| 官方一键中文 | 仅 en/pl；壳子可自挂 i18n；表单字段改节点源码 |

## 附录 B：本仓库对应文件

| 文件 | 作用 |
|------|------|
| `src/App.tsx` | 各章示例切换入口 |
| `src/examples/Ch1HelloWorldDemo.tsx` | 第 1 章完整可运行示例 |
| `src/examples/Ch2LinearFlowDemo.tsx` | 第 2 章完整可运行示例 |
| `src/palette.ts` | 全部 Demo 节点注册 |
| `src/nodes/**` | 官方 Demo 节点拷贝 |
| `src/i18n/setup.ts` / `zh.ts` | 中文壳子文案 |
| `src/index.css` | 全屏，避免属性栏被挤出 |
| `vite.config.ts` | `dedupe` i18next 等 |

## 附录 C：官方文档入口

- 总览：https://www.workflowbuilder.io/docs/overview/  
- 配置编辑器：https://www.workflowbuilder.io/docs/guides/configuring-the-editor/  
- 持久化 callback：https://www.workflowbuilder.io/docs/get-started/persistence/callback/  
- 添加自定义节点：https://www.workflowbuilder.io/docs/guides/add-a-custom-node/  
- Demo 节点源码：https://github.com/synergycodes/workflowbuilder/tree/main/apps/demo/src/app/data/nodes  
- npm：https://www.npmjs.com/package/@workflowbuilder/sdk  

---

*第 3–4 章（插件、自定义节点、Graph 序列化、事件、画布配置）见：`docs/workflow-builder-learning-ch3-ch4.md`。*
