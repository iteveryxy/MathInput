import { describe, expect, it } from 'vitest';
import { placeFloating } from '../completion/FloatingPosition';
import { appearance, parseSettings } from '../platform/Settings';

describe('独立浮层几何', () => {
  const viewport = { left: 0, top: 0, right: 420, bottom: 224 };
  it('下方充足优先展开，底部空间不足翻到上方', () => {
    expect(placeFloating({ left: 20, right: 21, top: 20, bottom: 40 }, viewport, 300, 100).side).toBe('bottom');
    expect(placeFloating({ left: 20, right: 21, top: 180, bottom: 200 }, viewport, 300, 100).side).toBe('top');
  });
  it.each([0, 4, 210, 419, 900])('横向锚点 %s 不会让菜单溢出视口', x => {
    const result = placeFloating({ left: x, right: x + 1, top: 90, bottom: 120 }, viewport, 500, 330);
    expect(result.left).toBeGreaterThanOrEqual(8); expect(result.left + result.width).toBeLessThanOrEqual(412);
    expect(result.top).toBeGreaterThanOrEqual(8); expect(result.top + result.maxHeight).toBeLessThanOrEqual(216);
  });
  it('带视口偏移时仍在同一坐标系内裁定', () => {
    const result = placeFloating({ left: 35, right: 36, top: 150, bottom: 170 }, { left: 20, top: 80, right: 340, bottom: 500 }, 300, 180);
    expect(result.left).toBeGreaterThanOrEqual(28); expect(result.top).toBe(175); expect(result.left + result.width).toBeLessThanOrEqual(332);
  });
  it.each([-500, 1000])('滚动后的纵向锚点 %s 仍可见', y => {
    const result = placeFloating({left:20,right:21,top:y,bottom:y+30},viewport,300,150);
    expect(result.top).toBeGreaterThanOrEqual(8); expect(result.top+result.maxHeight).toBeLessThanOrEqual(216);
  });
});

describe('缩放设置验证与旧版本迁移', () => {
  it.each([65, 85, 100, 125])('支持 %s%%', scale => {
    expect(parseSettings('Ctrl+Alt+M', 'inline', true, '', [], scale, false)).toMatchObject({uiScale: scale, compact: false});
  });
  it.each([0, 64, 126, Infinity, NaN])('拒绝非法缩放 %s', scale => {
    expect(() => parseSettings('Ctrl+Alt+M', 'inline', true, '', [], scale)).toThrow();
    expect(appearance({uiScale: scale})).toEqual({uiScale:85, compact:true});
  });
  it('v0.1 设置缺少新字段时只补默认值', () => { expect(appearance({shortcut:'Ctrl+Alt+N'})).toEqual({uiScale:85, compact:true}); });
});
