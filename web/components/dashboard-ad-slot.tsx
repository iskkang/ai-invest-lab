"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/public-content";

/**
 * An approved AdSense account + certified TCF CMP must be configured before
 * rendering an ad. Disabled by default. No ad requests or tracking before
 * an affirmative CMP signal. Public client/slot IDs are not API secrets.
 *
 * Required build-time env values:
 * NEXT_PUBLIC_ADSENSE_ENABLED=true
 * NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-<16-digit publisher id>
 * NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD=<numeric ad unit id>
 * NEXT_PUBLIC_ADSENSE_CMP_READY=true
 */
declare global {
  interface Window {
    __tcfapi?: (command:string,version:number,callback:(data:unknown,success:boolean)=>void)=>void;
    adsbygoogle?: Record<string,unknown>[];
  }
}

const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";
const slotId = process.env.NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD ?? "";
const enabled = process.env.NEXT_PUBLIC_ADSENSE_ENABLED === "true"
  && process.env.NEXT_PUBLIC_ADSENSE_CMP_READY === "true"
  && /^ca-pub-\d{16}$/.test(client) && /^\d+$/.test(slotId);

export function DashboardAdSlot({locale}:{locale:Locale}) {
  const [approvedConsent,setApprovedConsent] = useState(false);
  useEffect(()=>{
    if(!enabled || !window.__tcfapi) return;
    // EU/UK/Swiss TCF consent is checked for all visitors for a conservative
    // global rollout. An approved CMP must be installed separately.
    window.__tcfapi("addEventListener",2,(value,ok)=>{
      if(!ok || !value || typeof value !== "object") return;
      const tc=value as {
        eventStatus?:string;
        purpose?:{consents?:Record<string,boolean>};
        vendor?:{consents?:Record<string,boolean>};
      };
      const active=tc.eventStatus==="tcloaded" || tc.eventStatus==="useractioncomplete";
      if(active && tc.purpose?.consents?.["1"] === true && tc.vendor?.consents?.["755"] === true)
        setApprovedConsent(true);
    });
  },[]);
  useEffect(()=>{
    if(!enabled || !approvedConsent) return;
    const scriptSelector = 'script[data-ail-adsense="1"]';
    const push=()=>{ try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch{ /* ad blocker/network */ } };
    if(document.querySelector(scriptSelector)) {push(); return;}
    const script=document.createElement("script");
    script.setAttribute("data-ail-adsense","1");
    script.async=true;
    script.crossOrigin="anonymous";
    script.src=`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
    script.addEventListener("load",push,{once:true});
    document.head.appendChild(script);
  },[approvedConsent]);
  if(!enabled || !approvedConsent) return null;
  const label:Record<Locale,string>={ko:"광고",en:"Advertisement",zh:"广告",ja:"広告"};
  return (
    <aside className="my-5 overflow-hidden rounded-xl border border-line bg-panel px-3 py-4"
      aria-label={label[locale]}>
      <p className="mb-2 text-center text-[10px] uppercase tracking-widest text-muted">{label[locale]}</p>
      <ins className="adsbygoogle block" style={{display:"block",minHeight:90}}
        data-ad-client={client} data-ad-slot={slotId}
        data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
