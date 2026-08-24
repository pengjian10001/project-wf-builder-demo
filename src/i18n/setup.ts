// 先加载 SDK，触发其 i18next 初始化（内置 en / pl）
import "@workflowbuilder/sdk";
import i18n from "i18next";

import { zhTranslation } from "./zh";

i18n.addResourceBundle("zh", "translation", zhTranslation, true, true);

// 覆盖语言检测结果，默认使用中文
void i18n.changeLanguage("zh");
