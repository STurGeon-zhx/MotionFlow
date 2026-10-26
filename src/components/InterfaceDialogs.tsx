'use client';

import {useEffect, useRef, useState} from 'react';
import {X} from 'lucide-react';

type Prompt = {message:string; confirm:boolean; resolve:(accepted:boolean)=>void};
const eventName='motionflow:dialog';
function prompt(message:string, confirm:boolean) {
  return new Promise<boolean>(resolve=>window.dispatchEvent(new CustomEvent<Prompt>(eventName,{detail:{message,confirm,resolve}})));
}
export const confirmAction=(message:string)=>prompt(message,true);
export const showMessage=(message:string)=>prompt(message,false).then(()=>undefined);

export function InterfaceDialogs() {
  const ref=useRef<HTMLDialogElement>(null);
  const [queue,setQueue]=useState<Prompt[]>([]);
  const current=queue[0];
  const [lastPrompt,setLastPrompt]=useState<Prompt>();
  const content=current??lastPrompt;
  useEffect(()=>{
    const handle=(event:Event)=>setQueue(previous=>[...previous,(event as CustomEvent<Prompt>).detail]);
    window.addEventListener(eventName,handle);
    return ()=>window.removeEventListener(eventName,handle);
  },[]);
  useEffect(()=>{
    const modal=ref.current;
    if(current && !modal?.open)modal?.showModal();
    if(!current && modal?.open)modal.close();
  },[current]);
  function finish(accepted:boolean) {
    setLastPrompt(current);
    current?.resolve(accepted);
    setQueue(previous=>previous.slice(1));
  }
  return <dialog ref={ref} className="interface-dialog" aria-labelledby="interface-dialog-title" onCancel={event=>{event.preventDefault();finish(false);}}>
    <div className="interface-dialog-heading"><h2 id="interface-dialog-title">{content?.confirm?'请确认操作':'操作提示'}</h2><button aria-label="关闭提示" onClick={()=>finish(false)}><X size={18}/></button></div>
    <p>{content?.message}</p>
    <div className="interface-dialog-actions">{content?.confirm && <button className="ghost-action" onClick={()=>finish(false)}>取消</button>}<button className="primary-action" onClick={()=>finish(true)}>{content?.confirm?'确认':'知道了'}</button></div>
  </dialog>;
}
