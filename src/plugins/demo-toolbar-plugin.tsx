import {
  getStoreDataForIntegration,
  getStoreNodes,
  registerComponentDecorator,
  setStoreNodes,
  useWorkflowBuilderActions,
  type WorkflowBuilderNode,
  type WorkflowBuilderPlugin,
} from '@workflowbuilder/sdk';

/**
 * 插件注入到 AppBar 的工具条：演示编程式新增节点 / 导出 Graph / 只读切换
 * 必须作为 WorkflowBuilder.Root 的 plugins 注册；组件装饰器插在 OptionalAppBarControls
 */
function DemoToolbarButtons() {
  const actions = useWorkflowBuilderActions();

  const addOrderPayNode = () => {
    const next: WorkflowBuilderNode = {
      id: `order-pay-${crypto.randomUUID().slice(0, 8)}`,
      // ReactFlow 画布模板类型（默认单入单出节点）
      type: 'node',
      position: { x: 200, y: 200 },
      data: {
        type: 'orderPay',
        icon: 'CurrencyCircleDollar',
        properties: {
          label: '订单支付',
          description: '编程式新增',
          status: 'active',
          payChannel: 'wechat',
          amount: 199,
          remark: '',
        },
      },
    };
    setStoreNodes([...getStoreNodes(), next]);
  };

  const exportGraph = () => {
    const graph = getStoreDataForIntegration();
    console.log('=== 当前 Graph（IntegrationDataFormat）===');
    console.log(JSON.stringify(graph, null, 2));
    alert('已输出 Graph 到控制台');
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button type="button" onClick={addOrderPayNode}>
        新增支付节点
      </button>
      <button type="button" onClick={exportGraph}>
        导出 Graph
      </button>
      <button type="button" onClick={() => actions.toggleReadOnly()}>
        切换只读
      </button>
      <button type="button" onClick={() => actions.save()}>
        保存
      </button>
    </div>
  );
}

/**
 * 官方 Plugin = () => void，在内部调用 register* API
 * ⚠️ 没有 beforeSave / afterLoad / customPanels 这类原稿 API
 */
export const demoToolbarPlugin: WorkflowBuilderPlugin = () => {
  registerComponentDecorator('OptionalAppBarControls', {
    name: 'demo-toolbar-plugin',
    place: 'after',
    content: DemoToolbarButtons,
  });
};
