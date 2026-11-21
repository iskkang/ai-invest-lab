"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useRef,useState} from "react";
import {Home,GitCompareArrows,BookOpen,FlaskConical,Ellipsis,X} from "lucide-react";
import {activeNavGroup} from "@/lib/nav-groups";
const tabs=[["Home","/en","dashboard",Home],["Compare","/en/consensus","compare",GitCompareArrows],["Journal","/en/journal","journal",BookOpen],["Research","/en/patterns","research",FlaskConical]] as const;
const more=[["About","/en/about"],["Methodology","/en/methodology"],["FAQ","/en/faq"],["Privacy","/en/privacy"]] as const;
export function MobileBottomNav(){
 const path=usePathname()||"/en",active=activeNavGroup(path,"en");
 const [open,setOpen]=useState(false);
 const close=useRef<HTMLButtonElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>setOpen(false),[path]);
 useEffect(()=>{if(!open)return;const old=document.body.style.overflow;document.body.style.overflow="hidden";close.current?.focus();
 const key=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false);if(e.key==="Tab"){const a=document.querySelectorAll<HTMLElement>("[data-more-sheet] a,[data-more-sheet] button");if(!a.length)return;if(e.shiftKey&&document.activeElement===a[0]){e.preventDefault();a[a.length-1].focus()}else if(!e.shiftKey&&document.activeElement===a[a.length-1]){e.preventDefault();a[0].focus()}}};
 document.addEventListener("keydown",key);return()=>{document.body.style.overflow=old;document.removeEventListener("keydown",key);trigger.current?.focus()}},[open]);
 return <><nav data-bottom-tabs aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel shadow-lg md:hidden"><div className="grid grid-cols-5" style={{paddingBottom:"env(safe-area-inset-bottom, 0px)"}}>
 {tabs.map(([label,href,id,Icon])=><Link key={id} href={href} aria-current={active===id?"page":undefined} className={`flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 text-[11px] ${active===id?"font-bold text-accent":"font-medium text-muted"}`}><Icon size={21} aria-hidden/><span>{label}</span></Link>)}
 <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)} className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] ${active==="about"||open?"font-bold text-accent":"font-medium text-muted"}`}><Ellipsis size={21}/><span>More</span></button></div></nav>
 {open&&<div className="fixed inset-0 z-[90] md:hidden"><button type="button" aria-label="Dismiss More" onClick={()=>setOpen(false)} className="absolute inset-0 w-full bg-black/55"/><section role="dialog" aria-modal="true" aria-label="More pages" data-more-sheet className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-panel px-4 pt-4 shadow-2xl" style={{paddingBottom:"calc(20px + env(safe-area-inset-bottom, 0px))"}}><div className="mb-2 flex items-center justify-between"><h2 className="font-bold">More</h2><button ref={close} type="button" onClick={()=>setOpen(false)} aria-label="Close" className="grid h-11 w-11 place-items-center"><X size={22}/></button></div>{more.map(([label,href])=><Link key={href} href={href} onClick={()=>setOpen(false)} className="flex min-h-12 items-center border-t border-line px-2 text-sm font-semibold">{label}</Link>)}</section></div>}</>;
}
