'use client';

import {useEffect} from 'react';

/** 页面与弹窗共用的点击反馈，不更改布局，也不覆盖控件自身的旋转等动画。 */
export function InterfaceMotion() {
  useEffect(()=>{
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const active=new Map<HTMLElement,Animation>();
    function click(event:MouseEvent) {
      if(reduced.matches || !(event.target instanceof Element))return;
      const button=event.target.closest<HTMLElement>('button, a, [role="button"], summary');
      if(!button || button.matches(':disabled, [aria-disabled="true"]'))return;
      active.get(button)?.cancel();
      const shadow=getComputedStyle(button).boxShadow;
      const animation=button.animate([
        {scale:'.92',boxShadow:shadow,offset:0},
        {scale:'1.045',boxShadow:'0 0 0 7px rgba(109,86,255,.22)',offset:.38},
        {scale:'.99',boxShadow:'0 0 0 3px rgba(109,86,255,.09)',offset:.72},
        {scale:'1',boxShadow:shadow,offset:1},
      ],{duration:440,easing:'cubic-bezier(.2,.7,.3,1)'});
      active.set(button,animation);
      void animation.finished.catch(()=>undefined).then(()=>{
        if(active.get(button)===animation)active.delete(button);
      });
    }
    document.addEventListener('click',click,true);
    return ()=>{document.removeEventListener('click',click,true);active.forEach(animation=>animation.cancel());};
  },[]);
  return null;
}
