import {effectPresetSchema, type Atom, type EffectPreset} from './schema';

const atom = (
  type: Atom['type'],
  from: number,
  to: number,
  startFrame: number,
  endFrame: number,
  easing: Atom['easing'] = 'easeOutCubic',
): Atom => ({type, from, to, startFrame, endFrame, easing});

const rawEffects: EffectPreset[] = [
  {id: 'basic_zoom_in', name: '中心放大进入', type: 'basic', category: 'basic', description: '从远处柔和放大并显现', durationFrames: 24, atoms: [atom('scale', .72, 1, 0, 24), atom('opacity', 0, 1, 0, 12, 'linear')], enabled: true},
  {id: 'basic_zoom_out', name: '中心缩小进入', type: 'basic', category: 'basic', description: '从近景缩回标准画面', durationFrames: 24, atoms: [atom('scale', 1.3, 1, 0, 24), atom('opacity', 0, 1, 0, 10, 'linear')], enabled: true},
  {id: 'basic_slide_left', name: '左滑入', type: 'basic', category: 'basic', description: '从左侧快速滑入', durationFrames: 24, atoms: [atom('translateX', -260, 0, 0, 24), atom('opacity', 0, 1, 0, 9, 'linear')], enabled: true},
  {id: 'basic_slide_right', name: '右滑入', type: 'basic', category: 'basic', description: '从右侧快速滑入', durationFrames: 24, atoms: [atom('translateX', 260, 0, 0, 24), atom('opacity', 0, 1, 0, 9, 'linear')], enabled: true},
  {id: 'basic_slide_up', name: '上滑入', type: 'basic', category: 'basic', description: '画面从下向上进入', durationFrames: 24, atoms: [atom('translateY', 240, 0, 0, 24), atom('opacity', 0, 1, 0, 10, 'linear')], enabled: true},
  {id: 'basic_slide_down', name: '下滑入', type: 'basic', category: 'basic', description: '画面从上向下进入', durationFrames: 24, atoms: [atom('translateY', -240, 0, 0, 24), atom('opacity', 0, 1, 0, 10, 'linear')], enabled: true},
  {id: 'basic_fade', name: '淡入', type: 'basic', category: 'basic', description: '安静平滑地显现', durationFrames: 24, atoms: [atom('opacity', 0, 1, 0, 24, 'easeInOut')], enabled: true},
  {id: 'basic_blur', name: '模糊清晰', type: 'basic', category: 'basic', description: '从虚焦恢复清晰', durationFrames: 26, atoms: [atom('blur', 24, 0, 0, 26), atom('opacity', .45, 1, 0, 18, 'linear')], enabled: true},
  {id: 'basic_rotate', name: '轻旋转进入', type: 'basic', category: 'basic', description: '轻微旋转并归正', durationFrames: 26, atoms: [atom('rotate', -8, 0, 0, 26, 'easeOutBack'), atom('scale', .85, 1, 0, 26), atom('opacity', 0, 1, 0, 12, 'linear')], enabled: true},
  {id: 'basic_flash', name: '闪白进入', type: 'basic', category: 'light', description: '明亮闪白后定格', durationFrames: 22, atoms: [atom('opacity', .25, 1, 0, 12, 'linear'), atom('flash', 1, 0, 3, 18, 'easeOut')], enabled: true},

  {id: 'combo_zoom_blur', name: '模糊放大入场', type: 'combo', category: 'combo', description: '缩放、虚焦与显现叠加', durationFrames: 28, atoms: [atom('scale', .7, 1, 0, 28), atom('blur', 28, 0, 0, 24), atom('opacity', 0, 1, 0, 12, 'linear')], enabled: true},
  {id: 'combo_slide_rotate_bounce', name: '左滑旋转回弹', type: 'combo', category: 'dynamic', description: '动感滑入后轻微回弹', durationFrames: 30, atoms: [atom('translateX', -260, 0, 0, 18), atom('translateX', 0, 15, 18, 24, 'easeOut'), atom('translateX', 15, 0, 24, 30, 'easeOutBack'), atom('rotate', -9, 0, 0, 20), atom('opacity', 0, 1, 0, 10, 'linear')], enabled: true},
  {id: 'combo_zoom_flash', name: '缩放闪白', type: 'combo', category: 'light', description: '强缩放配合闪光冲击', durationFrames: 26, atoms: [atom('scale', .55, 1, 0, 26, 'easeOutBack'), atom('flash', 1, 0, 4, 18), atom('opacity', 0, 1, 0, 9, 'linear')], enabled: true},
  {id: 'combo_mask_focus', name: '遮罩展开清晰化', type: 'combo', category: 'combo', description: '遮罩打开同时恢复焦点', durationFrames: 28, atoms: [atom('maskReveal', 48, 0, 0, 28), atom('blur', 18, 0, 0, 25), atom('scale', 1.08, 1, 0, 28)], enabled: true},
  {id: 'combo_push_shake', name: '推镜头轻抖动', type: 'combo', category: 'camera', description: '镜头推进并带轻微冲击', durationFrames: 27, atoms: [atom('scale', 1.32, 1, 0, 27), atom('shake', 12, 0, 0, 24), atom('motionBlur', 9, 0, 0, 20), atom('opacity', .25, 1, 0, 10, 'linear')], enabled: true},
  {id: 'combo_rgb_shake', name: 'RGB 故障抖动', type: 'combo', category: 'glitch', description: 'RGB 错位配合高频震动', durationFrames: 25, atoms: [atom('rgbShift', 18, 0, 0, 25), atom('shake', 15, 0, 0, 22), atom('opacity', .2, 1, 0, 8, 'linear')], enabled: true},
  {id: 'combo_flip_bounce', name: '翻转回弹', type: 'combo', category: '3d', description: '卡片翻转后弹性归位', durationFrames: 30, atoms: [atom('perspective', -82, 0, 0, 26, 'easeOutBack'), atom('scale', .82, 1, 0, 30), atom('opacity', 0, 1, 0, 12, 'linear')], enabled: true},
  {id: 'combo_perspective_fly', name: '透视飞入', type: 'combo', category: '3d', description: '从纵深空间飞入画面', durationFrames: 30, atoms: [atom('perspective', 72, 0, 0, 30), atom('translateX', -280, 0, 0, 30), atom('scale', .55, 1, 0, 30), atom('opacity', 0, 1, 0, 13, 'linear')], enabled: true},
  {id: 'combo_vertical_bounce_blur', name: '上下弹入模糊恢复', type: 'combo', category: 'dynamic', description: '纵向落入并弹性稳定', durationFrames: 30, atoms: [atom('translateY', -260, 16, 0, 22, 'easeOutBack'), atom('translateY', 16, 0, 22, 30), atom('blur', 20, 0, 0, 24), atom('opacity', 0, 1, 0, 10, 'linear')], enabled: true},
  {id: 'combo_split_assemble', name: '分屏拼合', type: 'combo', category: 'combo', description: '左右分片汇合成完整画面', durationFrames: 28, atoms: [atom('maskReveal', 50, 0, 0, 28), atom('scale', 1.12, 1, 0, 28), atom('opacity', .5, 1, 0, 14, 'linear')], enabled: true},
  {id: 'combo_light_sweep_zoom', name: '光效扫过放大', type: 'combo', category: 'light', description: '发光扫过并完成推进', durationFrames: 30, atoms: [atom('glow', 34, 0, 0, 30), atom('scale', .82, 1, 0, 30), atom('flash', .7, 0, 8, 24), atom('opacity', 0, 1, 0, 11, 'linear')], enabled: true},
  {id: 'combo_glitch_snap', name: 'Glitch 闪现归位', type: 'combo', category: 'glitch', description: '数字故障闪现后迅速归位', durationFrames: 24, atoms: [atom('rgbShift', 24, 0, 0, 24), atom('translateX', -28, 0, 0, 22, 'easeOutBack'), atom('shake', 20, 0, 0, 18), atom('flash', .65, 0, 3, 14)], enabled: true},
  {id: 'combo_card_3d', name: '3D 卡片翻转', type: 'combo', category: '3d', description: '立体卡片从背面翻转出现', durationFrames: 32, atoms: [atom('perspective', 108, 0, 0, 32, 'easeOutBack'), atom('scale', .78, 1, 0, 32), atom('opacity', 0, 1, 0, 12, 'linear'), atom('glow', 24, 0, 10, 32)], enabled: true},
  {id: 'combo_rotate_zoom_blur', name: '旋转缩放模糊恢复', type: 'combo', category: 'dynamic', description: '旋转、缩放和焦点同步稳定', durationFrames: 30, atoms: [atom('rotate', -16, 0, 0, 30, 'easeOutBack'), atom('scale', .62, 1, 0, 30), atom('blur', 26, 0, 0, 25), atom('opacity', 0, 1, 0, 11, 'linear')], enabled: true},
  {id: 'combo_camera_exposure', name: '镜头拉近曝光回落', type: 'combo', category: 'camera', description: '高曝光近景柔和回落', durationFrames: 30, atoms: [atom('scale', 1.38, 1, 0, 30), atom('glow', 42, 0, 0, 30), atom('flash', .85, 0, 0, 23), atom('blur', 8, 0, 0, 24)], enabled: true},
];

export const effects = rawEffects.map((effect) => effectPresetSchema.parse(effect));
export const effectMap = new Map(effects.map((effect) => [effect.id, effect]));

