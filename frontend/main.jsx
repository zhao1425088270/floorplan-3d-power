import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Workbench} from './workbench.jsx';
import './editor.css';

// Mount stable hosts before attaching the existing SVG / Three.js editor.
flushSync(() => createRoot(document.getElementById('root')).render(<Workbench />));
import('./app.js').catch(error => {
  const status = document.getElementById('status');
  status.textContent = '工作台加载失败，请刷新页面重试。';
  status.className = 'error';
  console.error('Editor initialization failed:', error);
});
