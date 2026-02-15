import{j as e}from"./jsx-runtime.D_zvdyIk.js";import{r as i}from"./index.BhzxgM1Y.js";import{s as P,C as M}from"./CardNote.DUcGqCx9.js";import{S as A}from"./SquareButton.B2xSus6t.js";import{b as R,T as $}from"./colors.BKCNCj-W.js";import{s as D}from"./Icon.BW19-AbL.js";import"./_commonjsHelpers.Cpj98o6Y.js";import"./url-helpers.R-bCGLpF.js";import"./index.nTLIsj4E.js";import"./index.B-VhWVu8.js";import"./user-id.CKSxU32y.js";import"./safe-navigate.DbjP3MyY.js";import"./preload-helper.BlTxHScW.js";import"./EraseConfirmDialog.CTFsr-3w.js";import"./ButtonSmall.C0bXi-DM.js";import"./offline-mutations.x7h6sfPH.js";import"./offline-db.CC8-cgve.js";import"./module.DK3VP6lo.js";import"./safe-fetch.CQfTv-a0.js";function F(r){return r?`var(--color-${{"blessed-blue":"blue","graceful-gold":"yellow","mindful-mint":"green","pleasant-peach":"orange","peaceful-pink":"pink","lovely-lavender":"purple",paper:"paper",blue:"blue",yellow:"yellow",green:"green",orange:"orange",pink:"pink",purple:"purple"}[r.toLowerCase()]||"paper"})`:"var(--color-paper)"}function V(r){const t=r.match(/--color-([a-z]+)/);return t&&$.includes(t[1])?t[1]:null}function W(r){if(r==null)return"";if(typeof r!="string")return console.warn("[normalizeHtmlContent] Non-string content received:",typeof r),"";if(r.includes("<p>")||r.includes("<p "))return r;let t=r.replace(/<div([^>]*)>/gi,"<p$1>").replace(/<\/div>/gi,"</p>");if(!t.includes("<")){const s=t.split(/\n\s*\n/).flatMap(l=>l.split(/\n/)).map(l=>l.trim()).filter(l=>l.length>0);return s.length>1?s.map(l=>`<p>${l}</p>`).join(""):s.length===1?`<p>${s[0]}</p>`:t}return t=t.replace(/(<br\s*\/?>\s*){2,}/gi,"</p><p>").trim(),t.includes("</p><p>")?(t.startsWith("<p")||(t="<p>"+t),t.endsWith("</p>")||(t=t+"</p>"),t):(t.includes("<p")||(t=`<p>${t}</p>`),t)}function ce({item:r,onClose:t,onAddToHarvous:s,onArchive:l,onUnarchive:y,inBottomSheet:u=!1}){const[n,g]=i.useState(r),[p,w]=i.useState(!1),[m,j]=i.useState(!1),[d,N]=i.useState(!1),x=i.useRef(r.id);i.useEffect(()=>{x.current=r.id},[r.id]),i.useEffect(()=>{const o=a=>{const{item:c}=a.detail;c&&c.id===x.current&&g(c)};return window.addEventListener("updateInboxPreview",o),()=>{window.removeEventListener("updateInboxPreview",o)}},[]),i.useEffect(()=>{g(r),x.current=r.id},[r]),i.useEffect(()=>{if(n.isLoading){const o=setTimeout(()=>{g(a=>a.isLoading&&a.id===x.current?{...a,isLoading:!1,loadError:"Loading took too long. Please try again."}:a)},15e3);return()=>clearTimeout(o)}},[n.isLoading,n.id]);const v=n.userStatus==="archived",_=n.isLoading===!0,[h,k]=i.useState(n.contentType==="note"?"noteDetail":"thread"),[C,E]=i.useState(n.contentType==="note"?n.id:null),L=async()=>{w(!0);try{await s(n.id),t()}catch(o){console.error("Error adding to Harvous:",o),alert("Failed to add item to your Harvous. Please try again.")}finally{w(!1)}},z=async()=>{j(!0);try{await l(n.id),t()}catch(o){console.error("Error archiving:",o),alert("Failed to archive item. Please try again.")}finally{j(!1)}},H=async()=>{if(y){N(!0);try{await y(n.id),t()}catch(o){console.error("Error unarchiving:",o),alert("Failed to unarchive item. Please try again.")}finally{N(!1)}}},T=n.color?F(n.color):"var(--color-paper)";V(T);const I=R(),b=n.notes?[...n.notes].sort((o,a)=>o.order-a.order):[],f=C?n.contentType==="note"?{id:n.id,title:n.title,content:n.content||"",order:0}:b.find(o=>o.id===C):null,U=o=>{E(o),k("noteDetail")},S=()=>{h==="noteDetail"&&n.contentType==="thread"?(E(null),k("thread")):t()};return e.jsxs(e.Fragment,{children:[e.jsx("style",{children:`
        /* Space button styles */
        .space-button {
          will-change: transform;
          transition: box-shadow 0.125s ease-in-out;
        }

        .space-button:not([data-outer-shadow]):active {
          filter: brightness(0.97);
          box-shadow: 
            0px -1px 0px 0px rgba(120, 118, 111, 0.2) inset,
            0px 1px 0px 0px rgba(120, 118, 111, 0.2) inset;
        }

        .space-button:active > div {
          translate: 0 0;
          transform: scale(0.98);
        }

        /* Loading progress bar animation */
        @keyframes progress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }

        /* Rich text content styles - matching CardFullEditable display mode */
        .inbox-note-detail-content h2 {
          font-size: 18px !important;
          font-weight: 600 !important;
          line-height: 1.3 !important;
          margin-top: 1.5em !important;
          margin-bottom: 0.75em !important;
          color: var(--color-deep-grey) !important;
          font-family: var(--font-sans) !important;
        }

        .inbox-note-detail-content h2:first-child {
          margin-top: 0 !important;
        }

        .inbox-note-detail-content h3 {
          font-size: 16px !important;
          font-weight: 600 !important;
          line-height: 1.4 !important;
          margin-top: 1.25em !important;
          margin-bottom: 0.625em !important;
          color: var(--color-deep-grey) !important;
          font-family: var(--font-sans) !important;
        }

        .inbox-note-detail-content h3:first-child {
          margin-top: 0 !important;
        }

        .inbox-note-detail-content p {
          display: block !important;
          margin: 0.75em 0 !important;
          padding: 0 !important;
          line-height: 1.6 !important;
          color: var(--color-deep-grey) !important;
          font-family: var(--font-sans) !important;
          font-size: 16px !important;
        }

        .inbox-note-detail-content p:first-child {
          margin-top: 0 !important;
        }

        .inbox-note-detail-content p:last-child {
          margin-bottom: 0 !important;
        }
        
        /* Ensure empty paragraphs don't collapse */
        .inbox-note-detail-content p:empty {
          min-height: 0.75em;
        }

        .inbox-note-detail-content ul {
          list-style-type: disc !important;
          padding-left: 1.5em !important;
          margin-left: 0 !important;
        }

        .inbox-note-detail-content ol {
          list-style-type: decimal !important;
          padding-left: 1.5em !important;
          margin-left: 0 !important;
        }

        .inbox-note-detail-content li {
          display: list-item !important;
          list-style-position: outside !important;
          list-style-type: inherit !important;
          margin-bottom: 0.5em !important;
          color: var(--color-deep-grey) !important;
        }

        .inbox-note-detail-content hr {
          margin: 1.5em 0 !important;
          border: none !important;
          border-top: 1px solid #e5e5e5 !important;
          background: none !important;
          height: 1px !important;
          padding: 0 !important;
        }

        .inbox-note-detail-content hr:first-child {
          margin-top: 0 !important;
        }

        .inbox-note-detail-content hr:last-child {
          margin-bottom: 0 !important;
        }
      `}),e.jsxs("div",{className:`panel-wrapper ${u?"panel-wrapper--bottom-sheet":""} relative`,style:{height:"100%",maxHeight:"100%",minHeight:0},children:[_&&e.jsx("div",{className:"panel__progress-bar",style:{position:"absolute",top:0,zIndex:50},children:e.jsx("div",{className:"panel__progress-fill"})}),e.jsx("div",{className:"flex-1 flex flex-col min-h-0 mb-3.5 overflow-hidden",children:h==="noteDetail"&&f?e.jsxs("div",{className:"bg-white box-border flex flex-col h-full flex-1 min-h-0 items-start justify-start overflow-hidden pb-3 pt-6 px-3 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] gap-6",style:{maxHeight:"100%",height:"100%"},children:[e.jsxs("div",{className:"box-border content-stretch flex gap-3 items-center px-3 py-0 relative shrink-0 w-full",children:[e.jsx("div",{className:"basis-0 font-sans font-semibold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]",children:e.jsx("p",{className:"leading-[normal]",children:f.title||"Untitled Note"})}),e.jsx("div",{className:"relative shrink-0 size-5",title:"Note type",children:e.jsx("svg",{className:"block max-w-none size-full text-[var(--color-deep-grey)]",fill:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{d:"M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"})})})]}),e.jsx("div",{className:"flex-1 flex flex-col min-h-0 w-full",style:{maxHeight:"100%",overflow:"hidden",marginBottom:"-12px"},children:e.jsx("div",{className:"flex-1 flex flex-col min-h-0",style:{maxHeight:"100%"},children:e.jsx("div",{className:"flex-1 flex flex-col min-h-0 px-3",style:{height:0,maxHeight:"100%",overflow:"hidden"},children:n.loadError?e.jsx("div",{className:"flex-1 flex items-center justify-center",children:e.jsx("p",{className:"text-[var(--color-stone-grey)]",children:n.loadError})}):e.jsx("div",{className:"flex-1 overflow-auto inbox-note-detail-content",style:{lineHeight:"1.6",minHeight:0,paddingBottom:"12px"},dangerouslySetInnerHTML:{__html:D(W(f.content))}})})})})]}):e.jsxs("div",{className:"box-border flex flex-col min-h-0 flex-1 items-start justify-start overflow-clip pb-6 pt-0 px-0 relative rounded-3xl shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] w-full",children:[e.jsx("div",{className:"box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 w-full",style:{backgroundColor:T,color:I},children:e.jsx("div",{className:"basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px] text-center",children:e.jsx("p",{className:"leading-[normal]",children:n.title})})}),e.jsx("div",{className:"flex-1 box-border flex flex-col min-h-0 overflow-clip relative w-full mb-[-24px]",children:e.jsx("div",{className:"flex-1 bg-[var(--color-snow-white)] box-border flex flex-col min-h-0 overflow-x-clip p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full",children:h==="thread"&&n.contentType==="thread"&&e.jsxs("div",{className:"flex flex-col h-full w-full",children:[e.jsx("div",{className:"flex-1 flex flex-col gap-3 overflow-y-auto min-h-0",style:{paddingBottom:"12px"},children:n.loadError?e.jsx("div",{className:"text-center py-12",children:e.jsx("p",{className:"text-[var(--color-stone-grey)] text-lg",children:n.loadError})}):b.length>0?b.map((o,a)=>{const c=P(o.content),B=c.substring(0,150)+(c.length>150?"...":"");return e.jsx("div",{className:"content-item note-item card-enter",style:{animationDelay:`${a*50}ms`},children:e.jsx(M,{title:o.title||"Untitled Note",content:B,noteType:"default",onClick:()=>U(o.id)})},o.id)}):e.jsx("div",{style:{textAlign:"center",paddingTop:"64px",paddingBottom:"64px"},children:e.jsx("p",{style:{fontWeight:600,color:"var(--color-pebble-grey)",fontSize:"18px"},children:_?"":"No notes found in this thread."})})}),!v&&e.jsx("div",{className:"shrink-0 mt-3",children:e.jsx("button",{type:"button",onClick:z,disabled:m||p||d,className:"space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed",style:{backgroundImage:"var(--color-gradient-gray)"},children:e.jsx("div",{className:"flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0",children:e.jsx("div",{className:"flex-1 min-w-0 overflow-hidden",children:e.jsx("span",{className:"font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block",style:{color:"var(--color-deep-grey)"},children:m?"Archiving...":"Archive Thread"})})})})})]})})})]})}),h==="thread"?e.jsxs("div",{className:"panel__footer--buttons",children:[e.jsx(A,{variant:"Back",onClick:S,inBottomSheet:u}),n.contentType==="thread"&&e.jsx(e.Fragment,{children:v?e.jsxs("button",{type:"button",onClick:H,disabled:d||p||m,"data-outer-shadow":!0,className:"btn-cta flex-1 group",children:[e.jsx("span",{className:"btn-cta__content",children:d?"Unarchiving...":"Unarchive"}),e.jsx("div",{className:"btn-cta__shadow"})]}):e.jsxs("button",{type:"button",onClick:L,disabled:p||m||d,"data-outer-shadow":!0,className:"btn-cta flex-1 group",children:[e.jsx("span",{className:"btn-cta__content",children:p?"Adding...":"Add to Harvous"}),e.jsx("div",{className:"btn-cta__shadow"})]})})]}):e.jsxs("div",{className:"panel__footer--buttons",children:[e.jsx(A,{variant:"Back",onClick:S,inBottomSheet:u}),f&&v&&e.jsxs("button",{type:"button",onClick:H,disabled:d||p||m,"data-outer-shadow":!0,className:"btn-cta flex-1 group",children:[e.jsx("span",{className:"btn-cta__content",children:d?"Unarchiving...":"Unarchive"}),e.jsx("div",{className:"btn-cta__shadow"})]})]})]})]})}export{ce as default};
