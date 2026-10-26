import type {EffectPreset} from './schema';

export const particleVisualNames = [
  'particleFireflies', 'particleMeteors', 'particleAurora', 'particleSnow',
  'particleVortex', 'particleFountain', 'particleButterflies', 'particleBubbles',
  'particleConstellation', 'particleScanner', 'particleEmbers', 'particleRain',
  'particlePetals', 'particleHelix', 'particleComets', 'particleWaves',
  'particleLightning', 'particleGrid', 'particlePortal', 'particlePrisms',
] as const;
export type ParticleVisual = typeof particleVisualNames[number];
export const isParticleVisual = (name: string): name is ParticleVisual => (particleVisualNames as readonly string[]).includes(name);

type ParticleStyle = {name: string; description: string; colors: [string, string, string]; shape: 'dot' | 'star' | 'streak' | 'crystal' | 'ring' | 'wing' | 'petal' | 'prism'; count: number; camera: [number, number, number, number]};
export const particleStyles: Record<ParticleVisual, ParticleStyle> = {
  particleFireflies: {name:'萤火漫游', description:'绿金萤火在前后景缓慢漂浮，镜头轻轻横移', colors:['#dfff85','#71ffc8','#fff2bd'], shape:'dot', count:90, camera:[1.03,.7,0,0]},
  particleMeteors: {name:'蓝夜流星', description:'蓝白流星斜掠画面，长尾与细星交织', colors:['#c3eaff','#6db6ff','#fff7e0'], shape:'streak', count:64, camera:[1.04,-.9,.35,-.35]},
  particleAurora: {name:'极光纱幕', description:'青紫发光粒子排列成起伏的极光带', colors:['#71ffe1','#a190ff','#f4b6ff'], shape:'dot', count:140, camera:[1.035,0,.65,.25]},
  particleSnow: {name:'冰晶浮雪', description:'六角冰晶缓慢旋转飘落，前景大晶体与远景细雪分层', colors:['#e3ffff','#91dfff','#d8cdff'], shape:'crystal', count:76, camera:[1.025,.25,.25,-.3]},
  particleVortex: {name:'星云旋涡', description:'紫金星点沿多臂螺旋流动，镜头缓缓推近', colors:['#d6b1ff','#ffd995','#9faaff'], shape:'star', count:128, camera:[1.04,.3,-.3,.5]},
  particleFountain: {name:'金砂喷泉', description:'两侧金砂沿抛物线喷起回落，中间主体保持清晰', colors:['#ffe29b','#ffb55b','#fff7df'], shape:'streak', count:100, camera:[1.035,0,-.7,0]},
  particleButterflies: {name:'光蝶穿花', description:'粉蓝光蝶扇动双翼，沿蜿蜒路线穿过画面', colors:['#ffc6ed','#a8eaff','#f5d8ff'], shape:'wing', count:42, camera:[1.03,.75,.4,-.2]},
  particleBubbles: {name:'幻彩光泡', description:'半透明虹彩空心光泡向上浮动并轻轻摇摆', colors:['#c8fcff','#ffd2f0','#d5d2ff'], shape:'ring', count:48, camera:[1.03,-.35,-.55,.2]},
  particleConstellation: {name:'星座织网', description:'星点连成多组星座，连接线随星群一起缓慢漂移', colors:['#bad9ff','#fff1ba','#cbbcff'], shape:'star', count:60, camera:[1.025,.4,-.15,-.15]},
  particleScanner: {name:'光刃扫描', description:'竖直扫描光刃横向往返，带出密集青色离散粒子', colors:['#8affed','#e1ffff','#67b7ff'], shape:'streak', count:100, camera:[1.025,-.65,0,0]},
  particleEmbers: {name:'余烬升腾', description:'橙红火星从下方不规则升腾，局部亮斑轻轻呼吸', colors:['#ffb573','#ff765c','#ffe4ac'], shape:'dot', count:110, camera:[1.04,.2,.7,.1]},
  particleRain: {name:'银线光雨', description:'银蓝细长光丝垂直落下，穿插细小闪烁雨滴', colors:['#d9eeff','#a5bfff','#ffffff'], shape:'streak', count:110, camera:[1.03,0,.55,0]},
  particlePetals: {name:'琉璃花雨', description:'发光花瓣翻转飘落，沿横向气流交错滑行', colors:['#ffd2de','#ffc78d','#ebc9ff'], shape:'petal', count:65, camera:[1.035,-.65,.25,-.4]},
  particleHelix: {name:'双螺旋星链', description:'青金双螺旋星链围绕画面纵轴流动，明暗体现前后层次', colors:['#7dfbff','#ffe5a6','#b0bfff'], shape:'dot', count:120, camera:[1.035,.6,0,.15]},
  particleComets: {name:'彗星环游', description:'三层椭圆轨道中的彗星头部与弧形拖尾交错绕行', colors:['#ffddaf','#beadff','#99e8ff'], shape:'dot', count:108, camera:[1.045,-.25,.45,-.45]},
  particleWaves: {name:'潮汐星浪', description:'多层青蓝粒子波浪横向传播，亮度随浪峰起伏', colors:['#9bfff0','#71c7ff','#d9dcff'], shape:'dot', count:140, camera:[1.03,.85,-.2,0]},
  particleLightning: {name:'电弧星火', description:'折线电弧在画面边缘游走，细碎电火沿弧线跃动', colors:['#bdeaff','#a9a0ff','#ffffff'], shape:'star', count:90, camera:[1.03,-.25,.15,.2]},
  particleGrid: {name:'全息光阵', description:'透视光网纵深流动，菱形光点沿网格节点依次点亮', colors:['#76ffdf','#94c5ff','#d4b9ff'], shape:'prism', count:96, camera:[1.04,.45,.5,-.1]},
  particlePortal: {name:'星门涟漪', description:'同心椭圆光环由中心扩散，星点沿环面缓慢流转', colors:['#d1acff','#8eeaff','#ffdcf1'], shape:'ring', count:75, camera:[1.03,0,0,.3]},
  particlePrisms: {name:'棱镜星尘', description:'彩色棱晶沿之字路线折射漂移，闪烁星尘填充间隙', colors:['#ffa5d8','#b2eaff','#fff3a2'], shape:'prism', count:84, camera:[1.035,-.6,-.4,.35]},
};

// 已下架：仅保留历史任务快照兼容，不注册到特效库。
export const particleEffects: EffectPreset[] = particleVisualNames.map(visual => ({
  id: visual.replace('particle','particle_').replace(/[A-Z]/g, letter => '_' + letter.toLowerCase()).replace('__','_'),
  name: particleStyles[visual].name, description: particleStyles[visual].description,
  category:'light', type:'combo', visual, durationFrames:60, enabled:false,
  atoms:[{type:'visualProgress',from:0,to:1,startFrame:0,endFrame:60,easing:'linear'}],
}));

const fract = (n:number) => n-Math.floor(n);
const tau = Math.PI*2;
export function particlePoint(visual:ParticleVisual, index:number, phase:number) {
  const a=fract((index+1)*.61803398875), b=fract((index+1)*.41421356237), c=fract((index+1)*.73205080757);
  const t=fract(phase), q=fract(t+a), angle=tau*(a+t), band=index%4;
  let x=a,y=b,rotation=angle*180/Math.PI;
  switch(visual) {
    case 'particleFireflies': x=a+.035*Math.sin(tau*t+b*tau);y=b+.05*Math.cos(tau*t+a*tau);break;
    case 'particleMeteors': x=fract(a+t);y=fract(b+t*.8);rotation=38;break;
    case 'particleAurora': x=a;y=.15+band*.17+Math.sin(a*8+t*tau+band)*.09+(b-.5)*.08;break;
    case 'particleSnow': x=fract(a+.06*Math.sin(tau*t+b*8));y=q;break;
    case 'particleVortex': x=.5+(.08+b*.48)*Math.cos(angle+b*6);y=.5+(.07+b*.44)*Math.sin(angle+b*6);break;
    case 'particleFountain': x=index%2 ? 1-q*.5 : q*.5;y=1-3.1*q*(1-q)+b*.09;rotation=index%2?-55:55;break;
    case 'particleButterflies': x=q;y=.5+.34*Math.sin(tau*q+b*6)+.06*Math.sin(tau*t*2);break;
    case 'particleBubbles': x=a+.045*Math.sin(tau*t+b*5);y=1-q;break;
    case 'particleConstellation': x=a+.025*Math.sin(tau*t+band);y=b+.025*Math.cos(tau*t+band);break;
    case 'particleScanner': x=.5+.45*Math.sin(tau*t)+(a-.5)*.12;y=b;rotation=90;break;
    case 'particleEmbers': x=a+.05*Math.sin(tau*q*2+b*7);y=1-q;break;
    case 'particleRain': x=a;y=q;rotation=90;break;
    case 'particlePetals': x=fract(a+t*.5+.09*Math.sin(tau*t));y=q;rotation=360*q+b*180;break;
    case 'particleHelix': x=.5+.32*Math.sin(tau*(b+t)+(index%2)*Math.PI);y=b;break;
    case 'particleComets': x=.5+(.2+band*.08)*Math.cos(angle);y=.5+(.12+band*.07)*Math.sin(angle);break;
    case 'particleWaves': x=a;y=.2+band*.19+.09*Math.sin(a*12-tau*t+band)+(b-.5)*.045;break;
    case 'particleLightning': x=a;y=(index%2?.8:.2)+.08*Math.sin(Math.floor(a*18)*2.7+tau*t);break;
    case 'particleGrid': {const depth=fract(Math.floor(index/12)/8+t);x=.5+((index%12)/11-.5)*(.12+depth*1.1);y=.32+depth*depth*.7;break;}
    case 'particlePortal': {const radius=.1+fract(Math.floor(index/15)/5+t)*.5;x=.5+radius*Math.cos(a*tau);y=.5+radius*.8*Math.sin(a*tau);break;}
    case 'particlePrisms': x=fract(a+t*.5);y=b+.09*(2/Math.PI)*Math.asin(Math.sin(tau*t+a*6));rotation=45+Math.sin(tau*t+b)*35;break;
  }
  const pulse=.5+.5*Math.sin(tau*(t+b));
  return {x,y,rotation,size:2+c*5,opacity:.25+pulse*.65,depth:c};
}
