import{j as e}from"./jsx-runtime.D_zvdyIk.js";import{r as n}from"./index.BhzxgM1Y.js";import{I as l}from"./Icon.BW19-AbL.js";import{B as F}from"./ButtonSmall.C0bXi-DM.js";import{S as O}from"./SquareButton.B2xSus6t.js";import{s as P}from"./safe-fetch.CQfTv-a0.js";import"./_commonjsHelpers.Cpj98o6Y.js";import"./index.nTLIsj4E.js";import"./index.B-VhWVu8.js";import"./user-id.CKSxU32y.js";import"./safe-navigate.DbjP3MyY.js";import"./preload-helper.BlTxHScW.js";import"./EraseConfirmDialog.CTFsr-3w.js";import"./offline-mutations.x7h6sfPH.js";import"./offline-db.CC8-cgve.js";import"./module.DK3VP6lo.js";import"./colors.BKCNCj-W.js";import"./url-helpers.R-bCGLpF.js";function ee({noteId:c,noteTitle:U="Note",onClose:_,inBottomSheet:r=!1}){const[o,x]=n.useState(!1),[p,m]=n.useState(null),[s,i]=n.useState(!0),[b,f]=n.useState(!1),[w,j]=n.useState(!1),[N,k]=n.useState(null),[g,d]=n.useState(!1),y=async()=>{d(!1);try{const t=await P(`/api/notes/${c}/share`,{retries:1});if(t&&t.ok){const a=await t.json();x(a.isPublic),m(a.shareUrl),k(a.noteType||"default")}else d(!0)}catch(t){console.error("Error fetching share status:",t),d(!0)}finally{i(!1)}};n.useEffect(()=>{j(!0),y()},[c]);const E=()=>{d(!1),i(!0),y()},C=()=>{_?_():window.dispatchEvent(new CustomEvent("closeNoteSharePanel"))},v=async t=>{if(!s){i(!0);try{const a=await fetch(`/api/notes/${c}/share`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:t?"enable":"disable"})});if(a.ok){const h=await a.json();x(h.isPublic),m(h.shareUrl),window.dispatchEvent(new CustomEvent("toast",{detail:{message:t?"Note is now shared":"Note is now private",type:"success"}}))}else{const h=await a.json();window.dispatchEvent(new CustomEvent("toast",{detail:{message:h.error||"Failed to update sharing",type:"error"}}))}}catch(a){console.error("Error toggling share:",a),window.dispatchEvent(new CustomEvent("toast",{detail:{message:"Failed to update sharing",type:"error"}}))}finally{i(!1)}}},S=async()=>{if(!(s||!o)){i(!0);try{const t=await fetch(`/api/notes/${c}/share`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"refresh"})});if(t.ok){const a=await t.json();m(a.shareUrl),window.dispatchEvent(new CustomEvent("toast",{detail:{message:"New share link generated",type:"success"}}))}else{const a=await t.json();window.dispatchEvent(new CustomEvent("toast",{detail:{message:a.error||"Failed to generate new link",type:"error"}}))}}catch(t){console.error("Error refreshing share link:",t),window.dispatchEvent(new CustomEvent("toast",{detail:{message:"Failed to generate new link",type:"error"}}))}finally{i(!1)}}},T=async()=>{if(p)try{await navigator.clipboard.writeText(p),f(!0),window.dispatchEvent(new CustomEvent("toast",{detail:{message:"Link copied to clipboard",type:"success"}})),setTimeout(()=>f(!1),2e3)}catch(t){console.error("Failed to copy:",t),window.dispatchEvent(new CustomEvent("toast",{detail:{message:"Failed to copy link",type:"error"}}))}};if(!w)return null;const u=N==="scripture",z=!u,$=o||u;return e.jsxs("div",{className:`note-share-panel panel-wrapper ${r?"panel-wrapper--bottom-sheet":""} w-full`,children:[e.jsxs("div",{className:r?"flex-1 flex flex-col min-h-0":"flex flex-col",style:{position:"relative"},children:[s&&e.jsx("div",{className:"panel__progress-bar",style:{position:"absolute",top:0,left:0,right:0,zIndex:50},children:e.jsx("div",{className:"panel__progress-fill"})}),e.jsxs("div",{className:`panel ${r?"panel--bottom-sheet":""} ${s?"opacity-60 pointer-events-none":""}`,children:[e.jsx("div",{className:"panel__header",children:e.jsx("div",{className:"panel__title",children:e.jsx("p",{children:"Share Note"})})}),e.jsx("div",{className:`panel__body ${r?"panel__body--bottom-sheet":""}`,children:e.jsxs("div",{className:`panel__content ${r?"panel__content--bottom-sheet":""}`,children:[z&&!g&&e.jsxs("div",{className:"note-share-panel__visibility",children:[e.jsx("button",{type:"button",onClick:()=>v(!1),disabled:s,className:`note-share-panel__option ${o?"":"note-share-panel__option--active"}`,children:e.jsxs("div",{className:"note-share-panel__option-content",children:[e.jsx("div",{className:"note-share-panel__icon-slot",children:e.jsx(l,{name:"user",size:16,style:{color:"var(--color-deep-grey)"}})}),e.jsx("span",{className:"note-share-panel__option-text",children:"Only I can see this note"}),!o&&e.jsx("div",{className:"note-share-panel__check-slot",children:e.jsx(l,{name:"check",size:16,style:{color:"var(--color-deep-grey)"}})})]})}),e.jsx("button",{type:"button",onClick:()=>v(!0),disabled:s,className:`note-share-panel__option ${o?"note-share-panel__option--active":""}`,children:e.jsxs("div",{className:"note-share-panel__option-content",children:[e.jsx("div",{className:"note-share-panel__icon-slot",children:e.jsx(l,{name:"user-group",size:16,style:{color:"var(--color-deep-grey)"}})}),e.jsx("span",{className:"note-share-panel__option-text",children:"Shared with link to anyone"}),o&&e.jsx("div",{className:"note-share-panel__check-slot",children:e.jsx(l,{name:"check",size:16,style:{color:"var(--color-deep-grey)"}})})]})})]}),g?e.jsxs("div",{className:"note-share-panel__sharing-ui",children:[e.jsxs("div",{className:"note-share-panel__placeholder",children:[e.jsx(l,{name:"circle-info",size:14,style:{color:"var(--color-pebble-grey)",flexShrink:0}}),e.jsx("span",{children:"Couldn't load share link."})]}),e.jsxs("button",{type:"button",onClick:E,disabled:s,className:"btn-cta btn--secondary",children:[e.jsx("span",{className:"btn-cta__content",children:"Retry"}),e.jsx("div",{className:"btn-cta__shadow"})]})]}):$?e.jsx("div",{className:"note-share-panel__sharing-ui",children:p?e.jsxs(n.Fragment,{children:[e.jsxs("div",{className:"note-share-panel__link-container",children:[e.jsx("input",{type:"text",readOnly:!0,value:p,className:"note-share-panel__link-input",onClick:t=>{t.target.select()}}),e.jsx(F,{type:"button",onClick:T,disabled:s,state:"Default",children:b?"Copied":"Copy"})]}),!u&&e.jsxs("button",{type:"button",onClick:S,disabled:s,className:"btn-cta btn--secondary",children:[e.jsx("span",{className:"btn-cta__content",children:"Generate a New Sharable Link"}),e.jsx("div",{className:"btn-cta__shadow"})]})]}):e.jsxs("div",{className:"note-share-panel__placeholder",children:[e.jsx(l,{name:"circle-info",size:14,style:{color:"var(--color-pebble-grey)",flexShrink:0}}),e.jsx("span",{children:"Generating share link..."})]})}):null]})})]})]}),e.jsx("div",{className:"panel__footer--buttons",children:e.jsx(O,{variant:"Back",onClick:C,inBottomSheet:r})}),e.jsx("style",{children:`
        .note-share-panel .panel__content {
          padding-bottom: 12px;
          gap: 12px;
        }
        .note-share-panel .panel__content::after {
          height: 0;
        }

        .note-share-panel__visibility {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 0;
        }

        .note-share-panel__option {
          display: flex;
          align-items: center;
          padding: 1rem;
          background: var(--color-gradient-gray);
          border: none;
          border-radius: 1.5rem;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
          width: 100%;
          min-height: 64px;
        }

        .note-share-panel__option:hover:not(:disabled) {
          filter: brightness(0.98);
        }

        .note-share-panel__option:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .note-share-panel__option--active {
          box-shadow: 0px -3px 0px 0px rgba(120, 118, 111, 0.2) inset;
        }

        .note-share-panel__option-content {
          display: flex;
          align-items: center;
          width: 100%;
          gap: 0.75rem;
        }

        .note-share-panel__icon-slot {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .note-share-panel__option-text {
          font-family: var(--font-sans);
          font-size: 18px;
          font-weight: 600;
          color: var(--color-deep-grey);
          flex: 1;
        }

        .note-share-panel__check-slot {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .note-share-panel__sharing-ui {
          background: var(--color-snow-white);
          border-radius: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .note-share-panel__link-container {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: var(--color-gradient-gray);
          border-radius: 1.5rem;
        }

        .note-share-panel__link-container .btn {
          flex-shrink: 0;
        }

        .note-share-panel__link-input {
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

        .note-share-panel__placeholder {
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
      `})]})}export{ee as default};
