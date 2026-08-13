import type { APIRoute } from 'astro';
import { runtimeEnv } from '../lib/server';

export const GET: APIRoute = () => {
  const env = runtimeEnv();
  if (!env.POSTHOG_KEY) {
    return new Response('/* GitRacer analytics are disabled until POSTHOG_KEY is configured. */', {
      headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  const key = JSON.stringify(env.POSTHOG_KEY);
  const uiHost = JSON.stringify(env.POSTHOG_UI_HOST);
  const script = `(()=>{if(navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)return;!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split('.');2===o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(n=t.createElement('script')).type='text/javascript',n.async=true,n.src=s.api_host+'/static/array.js',(p=t.getElementsByTagName('script')[0]).parentNode.insertBefore(n,p);var u=e;void 0!==a?u=e[a]=[]:a='posthog',u.people=u.people||[],o='init capture register unregister opt_out_capturing has_opted_out_capturing reset get_distinct_id identify set_config get_session_id onFeatureFlags'.split(' ');for(r=0;r<o.length;r++)g(u,o[r]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init(${key},{api_host:location.origin+'/ph',ui_host:${uiHost},defaults:'2026-05-30',cookieless_mode:'always',person_profiles:'never',autocapture:false,capture_pageview:true,capture_pageleave:true,disable_session_recording:true,capture_heatmaps:false,capture_performance:{web_vitals:true},before_send:function(event){if(event&&event.properties&&event.properties.$current_url){try{var u=new URL(event.properties.$current_url);event.properties.$current_url=u.origin+u.pathname}catch(e){}}return event}});document.addEventListener('click',function(event){var node=event.target instanceof Element?event.target.closest('[data-track]'):null;if(!node)return;var props={};['sponsorPosition','racerCount','profileHandle'].forEach(function(key){if(node.dataset[key])props[key.replace(/[A-Z]/g,function(letter){return'_'+letter.toLowerCase()})]=node.dataset[key]});posthog.capture(node.dataset.track,props)});if('IntersectionObserver'in window){var seen=new WeakSet;var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting&&!seen.has(entry.target)){seen.add(entry.target);posthog.capture('sponsor_impression',{sponsor_position:entry.target.dataset.sponsorPosition});observer.unobserve(entry.target)}})},{threshold:.5});document.querySelectorAll('[data-sponsor-position]').forEach(function(node){observer.observe(node)})}})();`;
  return new Response(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
