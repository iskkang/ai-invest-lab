"use client";
import {useEffect,useRef,useState} from "react";
import {Monitor,Sun,Moon,ChevronDown} from "lucide-react";
type Preference="system"|"light"|"dark";
const choices=[{value:"system",label:"System",Icon:Monitor},{value:"light",label:"Light",Icon:Sun},{value:"dark",label:"Dark",Icon:Moon}] as const;
function getPreference():Preference{
 try{const v=localStorage.getItem("theme");return v==="light"||v==="dark"?v:"system"}catch{return "system"}
}
function applyTheme(p:Preference){
 const dark=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
 document.documentElement.classList.toggle("dark",dark);
 document.documentElement.dataset.themePreference=p;
 window.dispatchEvent(new Event("logicsight-theme-change"));
}
export function ThemeToggle({mode="dropdown"}:{mode?:"dropdown"|"segmented";locale?:string}){
 const [pref,setPref]=useState<Preference>("system"),[open,setOpen]=useState(false);
 const wrapper=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const initial=getPreference();setPref(initial);applyTheme(initial);
  const media=window.matchMedia("(prefers-color-scheme: dark)");
  const change=()=>{if(getPreference()==="system")applyTheme("system")};
  media.addEventListener?.("change",change);
  return()=>media.removeEventListener?.("change",change);
 },[]);
 useEffect(()=>{if(!open)return;const onDown=(e:PointerEvent)=>{if(wrapper.current&&!wrapper.current.contains(e.target as Node))setOpen(false)};
 const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false)};
 document.addEventListener("pointerdown",onDown);document.addEventListener("keydown",onKey);
 return()=>{document.removeEventListener("pointerdown",onDown);document.removeEventListener("keydown",onKey)}},[open]);
 const choose=(p:Preference)=>{setPref(p);try{localStorage.setItem("theme",p)}catch{}applyTheme(p);setOpen(false)};
 const controls=<div role="group" aria-label="Appearance" className="flex items-center gap-1 rounded-xl border border-line bg-panel-2 p-1">{choices.map(({value,label,Icon})=><button key={value} type="button" aria-pressed={pref===value} onClick={()=>choose(value)} className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors ${pref===value?"bg-panel text-accent shadow-sm ring-1 ring-line":"text-muted hover:text-fg"}`}><Icon size={15} aria-hidden="true"/>{label}</button>)}</div>;
 if(mode==="segmented")return controls;
 const Current=choices.find(x=>x.value===pref)!.Icon;
 return <div ref={wrapper} className="relative"><button type="button" aria-label="Appearance" aria-haspopup="true" aria-expanded={open} onClick={()=>setOpen(x=>!x)} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm text-fg"><Current size={17}/><span>{choices.find(x=>x.value===pref)!.label}</span><ChevronDown size={15}/></button>{open&&<div className="absolute right-0 top-full z-50 mt-2 w-[280px] rounded-xl border border-line bg-panel p-3 shadow-xl"><div className="mb-2 text-xs font-semibold text-muted">Appearance</div>{controls}</div>}</div>;
}
