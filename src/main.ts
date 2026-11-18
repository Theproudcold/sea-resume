import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { installElementPlus } from './plugins/element';
import { installGlobalErrorReporting, reportRuntimeError } from './utils/globalErrorReporting';
// Load product styles after Element Plus so its defaults cannot override our themes.
import './styles/main.scss';

const app = createApp(App);

app.use(createPinia());
app.use(router);
installElementPlus(app);

installGlobalErrorReporting(app);
// 路由懒加载失败（构建更新导致旧 chunk 失效、网络中断等）此前只改 URL 不换页面：
// chunk 失效会自动刷新恢复，其他情况给出提示。
router.onError((error) => reportRuntimeError('页面加载失败', error));

app.mount('#app');
