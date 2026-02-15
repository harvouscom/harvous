import{j as e}from"./jsx-runtime.D_zvdyIk.js";import{r as l}from"./index.BhzxgM1Y.js";import{B as v}from"./ButtonSmall.C0bXi-DM.js";import{S as _}from"./SquareButton.B2xSus6t.js";import{s as b}from"./safe-fetch.CQfTv-a0.js";import"./_commonjsHelpers.Cpj98o6Y.js";import"./index.nTLIsj4E.js";import"./index.B-VhWVu8.js";import"./user-id.CKSxU32y.js";import"./safe-navigate.DbjP3MyY.js";import"./preload-helper.BlTxHScW.js";import"./EraseConfirmDialog.CTFsr-3w.js";import"./offline-mutations.x7h6sfPH.js";import"./offline-db.CC8-cgve.js";import"./module.DK3VP6lo.js";import"./colors.BKCNCj-W.js";import"./url-helpers.R-bCGLpF.js";function M({onClose:c,inBottomSheet:r=!1}){const[a,m]=l.useState(null),[n,u]=l.useState(!0),[x,p]=l.useState(!1);l.useEffect(()=>{(async()=>{try{const s=await b("/api/referral/status",{retries:1});if(s.ok){const i=await s.json();m({referralBonusNotes:i.referralBonusNotes??0,referralCode:i.referralCode??null,limit:i.limit??null})}}catch(s){console.error("ReferralPanel: Error loading status",s)}finally{u(!1)}})()},[]);const h=()=>{c?c():window.dispatchEvent(new CustomEvent("closeProfilePanel"))},d=()=>typeof window>"u"||!a?.referralCode?"":`${window.location.origin}/sign-up?ref=${encodeURIComponent(a.referralCode)}`,y=async()=>{const t=d();if(t)try{await navigator.clipboard.writeText(t),p(!0),window.dispatchEvent(new CustomEvent("toast",{detail:{message:"Link copied to clipboard",type:"success"}})),setTimeout(()=>p(!1),2e3)}catch(s){console.error("Failed to copy:",s),window.dispatchEvent(new CustomEvent("toast",{detail:{message:"Failed to copy link",type:"error"}}))}},f=d(),o=a?Math.floor(a.referralBonusNotes/100):0,g=200+(a?.referralBonusNotes??0)+100;return e.jsxs("div",{className:`referral-panel panel-wrapper ${r?"panel-wrapper--bottom-sheet":""} w-full`,children:[e.jsxs("div",{className:r?"flex-1 flex flex-col min-h-0":"flex flex-col",style:{position:"relative"},children:[n&&e.jsx("div",{className:"panel__progress-bar",style:{position:"absolute",top:0,left:0,right:0,zIndex:50},children:e.jsx("div",{className:"panel__progress-fill"})}),e.jsxs("div",{className:`panel ${r?"panel--bottom-sheet":""} ${n?"opacity-60 pointer-events-none":""}`,children:[e.jsx("div",{className:"panel__header",children:e.jsx("div",{className:"panel__title",children:e.jsx("p",{children:"Refer My Friends"})})}),e.jsx("div",{className:`panel__body ${r?"panel__body--bottom-sheet":""}`,children:e.jsxs("div",{className:`panel__content ${r?"panel__content--bottom-sheet":""}`,children:[e.jsxs("div",{className:"text-center px-4 pt-3 pb-2",style:{color:"var(--color-pebble-grey)",fontSize:"14px",textWrap:"balance"},children:["When friends sign up with your link, you get 100 extra notes on top of your 200 free notes, so ",g.toLocaleString()," before you need unlimited."]}),n?e.jsx("div",{className:"referral-panel__placeholder",children:e.jsx("span",{children:"Loading your link..."})}):f?e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"referral-panel__link-container",children:[e.jsx("input",{type:"text",readOnly:!0,value:f,className:"referral-panel__link-input",onClick:t=>t.target.select()}),e.jsx(v,{type:"button",onClick:y,disabled:n,state:"Default",children:x?"Copied":"Copy"})]}),o>0&&e.jsxs("p",{className:"referral-panel__stats",style:{marginTop:"1rem",fontFamily:"var(--font-sans)",fontSize:"14px",color:"var(--color-stone-grey)"},children:["You've earned ",a.referralBonusNotes," bonus notes from ",o," successful referral",o!==1?"s":"","."]})]}):e.jsx("div",{className:"referral-panel__placeholder",children:e.jsx("span",{children:"Unable to load referral link. Please try again."})})]})})]})]}),e.jsx("div",{className:"panel__footer--buttons",children:e.jsx(_,{variant:"Back",onClick:h,inBottomSheet:r})}),e.jsx("style",{children:`
        .referral-panel__link-container {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: var(--color-gradient-gray);
          border-radius: 1.5rem;
        }

        .referral-panel__link-container .btn {
          flex-shrink: 0;
        }

        .referral-panel__link-input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          font-size: 0.875rem;
          line-height: 1.25rem;
          color: var(--color-deep-grey);
          outline: none;
          text-overflow: ellipsis;
          font-family: var(--font-sans);
        }

        .referral-panel__placeholder {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem;
          background: var(--color-gradient-gray);
          border-radius: 0.75rem;
          font-size: 13px;
          color: var(--color-stone-grey);
          font-family: var(--font-sans);
        }
      `})]})}export{M as default};
