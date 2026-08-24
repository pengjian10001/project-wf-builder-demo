import type { PaletteItem } from '@workflowbuilder/sdk';

import { defaultPropertiesData } from './default-properties-data';
import { type MultiPortNodeSchema, schema } from './schema';
import { uischema } from './uischema';

export const multiPort: PaletteItem<MultiPortNodeSchema> = {
  type: 'multi-port',
  icon: 'ArrowsOutCardinal',
  label: '多端口节点',
  description: '通过 4 个端口路由连接',
  defaultPropertiesData,
  schema,
  uischema,
};
