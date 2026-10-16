import {useEffect, useState} from 'react';

const icons = {
  plan: 'M3 3h18v18H3z M3 11h8V3 M11 11v10 M11 15h10',
  wall: 'M3 5h18v14H3z M3 12h18 M9 5v7 M16 12v7',
  door: 'M5 21V3h14v18 M5 3l10 3v15H5 M12 12h.01',
  sofa: 'M5 10V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4 M4 10h1a2 2 0 0 1 2 2v4h10v-4a2 2 0 0 1 2-2h1a1 1 0 0 1 1 1v8H3v-8a1 1 0 0 1 1-1 M5 19v2 M19 19v2',
  material: 'M12 3l9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5',
  ruler: 'M3 16L16 3l5 5L8 21z M12 7l3 3 M8 11l3 3 M4 15l3 3',
  undo: 'M9 5L4 10l5 5 M4 10h10a6 6 0 0 1 6 6v3',
  redo: 'M15 5l5 5-5 5 M20 10H10a6 6 0 0 0-6 6v3',
  search: 'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  cube: 'M12 2l9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10',
};

function Icon({name, size = 24}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name] || icons.plan} /></svg>;
}

function Header() {
  return <header className="app-header">
    <div className="project-heading"><span className="brand-mark"><Icon name="plan" /></span><div><input id="project-title" aria-label="方案名称" maxLength="80" /><span className="project-caption">平面家装 <span> / </span> 设计工作台</span></div></div>
    <div className="segmented" aria-label="显示模式"><button data-mode="2d" aria-pressed="true">2D</button><button data-mode="3d" aria-pressed="false">3D</button><button data-mode="walk" aria-pressed="false">漫游</button></div>
    <div className="header-actions"><div className="history"><button id="undo" title="撤销 · Ctrl+Z"><Icon name="undo" size={20} /><span>撤销</span></button><button id="redo" title="重做 · Ctrl+Shift+Z"><Icon name="redo" size={20} /><span>重做</span></button></div><button id="render-view" className="render-button"><Icon name="cube" size={19} />渲染预览</button></div>
  </header>;
}

const sections = [['plan','户型'],['wall','墙体'],['door','门窗'],['sofa','家具'],['material','材质'],['ruler','标注']];
function Library() {
  const [section, setSection] = useState('sofa');
  useEffect(() => {
    const selectSection = event => setSection(event.detail);
    document.addEventListener('editor:section-request', selectSection);
    return () => document.removeEventListener('editor:section-request', selectSection);
  }, []);
  function choose(key) {
    setSection(key);
    document.dispatchEvent(new CustomEvent('editor:section', {detail: key}));
  }
  return <>
    <nav className="tool-rail" aria-label="设计工具">{sections.map(([key,label]) => <button key={key} aria-pressed={section === key} onClick={() => choose(key)}><Icon name={key} /><span>{label}</span></button>)}<span className="rail-caption">DESIGN</span></nav>
    <aside className="library panel">
      <section className="catalog" hidden={section !== 'sofa'}>
        <div className="panel-title"><h2>家具库</h2><span id="catalog-count" /></div>
        <div className="search-field"><Icon name="search" size={17} /><input id="catalog-search" type="search" aria-label="搜索家具" placeholder="搜索家具" /></div>
        <select id="category" aria-label="家具分类">{['全部家具','客厅','卧室','餐厨','卫浴','导入模型'].map(label => <option key={label}>{label}</option>)}</select>
        <div id="catalog-items" />
        <p className="tip catalog-tip">点击家具，再点击画布放置<br />也可以直接拖入户型</p>
        <details className="model-actions"><summary>自定义模型</summary><label className="button" htmlFor="model-file">导入 GLB 模型</label><input id="model-file" type="file" accept=".glb" hidden /><button id="prune-models">清理未使用模型</button><p className="tip">需内嵌贴图，单个 ≤ 4 MB、合计 ≤ 8 MB。随方案保存。</p></details>
      </section>
      <section className="tool-panel" hidden={section !== 'plan'}><div className="panel-title"><h2>户型方案</h2></div><div className="tool-panel-body"><p>从一张户型图开始，或自由绘制你的空间。</p><button id="new-project">＋ 新建户型</button><label className="button" htmlFor="image-file">上传户型图</label><input id="image-file" type="file" accept=".png,.jpg,.jpeg,.webp,.bmp" hidden /><button id="demo">载入示例方案</button><hr /><label className="button" htmlFor="project-file">导入方案</label><input id="project-file" type="file" accept=".json" hidden /><button id="export" className="primary">导出方案</button><button id="backup-cache" hidden>备份原缓存</button><p className="tip">方案自动保存在此浏览器。导出 JSON 可备份或在其他设备继续编辑。</p></div></section>
      <section className="tool-panel" hidden={section !== 'wall'}><div className="panel-title"><h2>墙体编辑</h2></div><div className="tool-panel-body"><Tool value="wall">连续画墙</Tool><Tool value="split">分割墙体</Tool><Tool value="connect">连接端点</Tool><button id="recognize-rooms">识别闭合房间</button><Tool value="room">手工划定区域</Tool><label className="check"><input id="auto-rooms" type="checkbox" />房间随墙更新</label><p className="tip">点击墙线可在右侧修改端点、厚度和高度。</p></div></section>
      <section className="tool-panel" hidden={section !== 'door'}><div className="panel-title"><h2>门窗与洞口</h2></div><div className="tool-panel-body"><Tool value="door">＋ 放置门</Tool><Tool value="window">＋ 放置窗</Tool><p className="tip">选择后点击墙线放置。尺寸、开向和窗台高度可在右侧调整。</p></div></section>
      <section className="tool-panel" hidden={section !== 'material'}><div className="panel-title"><h2>空间材质</h2></div><div className="tool-panel-body"><div className="material-samples"><span className="wood-sample" /><span className="tile-sample" /><span className="paint-sample" /></div><h3>让空间有自己的质感</h3><p>点击画布中的房间，更换地面材质、铺贴方向和天花。</p><p>点击墙体，设置两侧墙面颜色、材质和踢脚线。</p><p className="tip">修改后点击「应用修改」，三维预览将同步更新。</p></div></section>
      <section className="tool-panel" hidden={section !== 'ruler'}><div className="panel-title"><h2>尺寸与标注</h2></div><div className="tool-panel-body"><Tool value="measure">两点测量</Tool><Tool value="calibrate">比例标定</Tool><p className="tip">尺寸单位为 mm，面积为 m²。上传户型图后，请先按已知长度标定比例。</p></div></section>
    </aside>
  </>;
}
function Tool({value, children}) { return <button data-tool={value}>{children}</button>; }

function Workspace() {
  return <section className="workspace panel" id="workspace" data-mode="2d">
    <div className="view-toolbar"><div className="canvas-tools"><button data-tool="select" aria-pressed="true">↖ 选择</button><span className="canvas-divider" /><span className="canvas-title">平面布置</span></div><div className="canvas-options"><span id="scale-state" className="pill" /><details className="view-options"><summary>显示与吸附</summary><div className="view-toggles"><label><input id="show-image" type="checkbox" defaultChecked />显示原图</label><label><input id="show-dimensions" type="checkbox" defaultChecked />显示尺寸</label><label><input id="snap-grid" type="checkbox" defaultChecked />网格吸附</label><label><input id="snap-wall" type="checkbox" defaultChecked />贴墙吸附</label><label><input id="snap-endpoints" type="checkbox" defaultChecked />墙端点吸附</label><button data-mode="both">双视图</button></div></details></div></div>
    <div id="wall-options" className="wall-options" hidden><label><input id="continuous-walls" type="checkbox" defaultChecked />连续画墙</label><label>定长 / mm <input id="wall-length" type="number" min="100" max="100000" step="any" placeholder="自由绘制" /></label><span>Shift 斜墙 · Esc 结束</span></div>
    <div id="scale-guide" className="scale-guide" hidden><div><b id="scale-guide-title" /><p id="scale-guide-detail" /></div><button id="review-scale">复核 / 校正比例</button></div>
    <div className="views">
      <div id="plan-pane"><svg id="plan" role="img" aria-label="可编辑的二维户型图" tabIndex="0" /><div className="canvas-hint">拖动对象 <span>·</span> 滚轮缩放 <span>·</span> 右键平移</div><div className="zoom"><button id="zoom-out" aria-label="缩小平面图">−</button><button id="fit-plan">适应画布</button><button id="zoom-in" aria-label="放大平面图">＋</button></div></div>
      <div id="scene-pane"><div className="view-label"><span><Icon name="cube" size={17} />3D 预览</span><button id="expand-preview" title="打开三维场景" aria-label="打开三维场景">↗</button><div className="scene-actions"><button id="iso">轴测</button><button id="top">俯视</button><button id="interior">室内视角</button><button id="low" aria-pressed="false">实际高度</button><button id="export-image">保存效果图</button></div></div><div className="render-settings"><label>光照 <select id="lighting"><option value="day">自然日光</option><option value="warm">暖光氛围</option></select></label><label><input type="checkbox" id="quality" defaultChecked />精细阴影</label></div><div id="viewport" /><div id="scene-note" className="scene-note">实时三维预览 · 与平面同步</div></div>
    </div>
    <div className="workspace-foot"><span id="counts" /><span id="save-state">本地方案</span></div>
  </section>;
}

function Inspector() {
  return <aside className="inspector panel"><div className="panel-title"><h2>对象属性</h2><span>单位 mm</span></div><div id="properties" /><details className="layout-checks"><summary>布局检查 <b id="layout-summary" role="status" /></summary><label className="check"><input id="check-layout" type="checkbox" defaultChecked />检查重叠与穿墙</label><div id="layout-issues" /><p>按家具外接尺寸估算，仅作布置参考。</p></details><details className="help"><summary>操作提示</summary><p>Shift 点击：多选<br />R 旋转 90° · Delete 删除<br />方向键微调 · Esc 取消工具</p><p>布置示意不代表施工图，承重属性为人工标记。</p></details></aside>;
}

function CalibrationDialog() {
  return <dialog id="calibration-dialog"><form id="calibration-form"><h2>核对户型真实尺寸</h2><p id="calibration-current" /><div className="distance-input"><label>原图标注的长度<input id="real-distance" type="number" min="0.001" max="1000000" step="any" placeholder="请输入原图上的标注" required /></label><label>单位<select id="distance-unit"><option value="mm">毫米 mm</option><option value="cm">厘米 cm</option><option value="m">米 m</option></select></label></div><p id="calibration-preview" className="calibration-preview" aria-live="polite" /><p className="tip">选取较长且标注清楚的尺寸线。应用后可撤销，家具实际尺寸保持不变。</p><div className="dialog-actions"><button id="cancel-calibration" type="button">取消</button><button id="apply-calibration" className="primary" type="submit" disabled>应用比例</button></div></form></dialog>;
}

export function Workbench() {
  return <div className="app-shell"><Header /><main id="editor-layout" data-mode="2d"><Library /><Workspace /><Inspector /></main><footer className="statusbar"><span id="snap-state">吸附：开 · 网格 50 mm</span><div id="status" role="status" aria-live="polite">正在加载工作台…</div><span id="selection-state">未选中对象</span><span id="zoom-state">缩放 100%</span></footer><CalibrationDialog /></div>;
}
