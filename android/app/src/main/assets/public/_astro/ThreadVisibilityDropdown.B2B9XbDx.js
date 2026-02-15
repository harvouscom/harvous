import{j as e}from"./jsx-runtime.D_zvdyIk.js";import{r as l,R as z}from"./index.BhzxgM1Y.js";import{S}from"./SearchInput.CZ80ZB3h.js";import{A as T}from"./ActionButton.Xb0SJgML.js";import{I as v}from"./Icon.BW19-AbL.js";import{f as L}from"./badge-count.DQjKS0Nt.js";import{B as M}from"./ButtonSmall.C0bXi-DM.js";const D=({item:i,isSelected:x,isLoading:c,onClick:a})=>{const[p,h]=l.useState(!1),[y,g]=l.useState(!0);l.useEffect(()=>{if(typeof window<"u"){const s=window.matchMedia("(hover: hover)");g(s.matches)}},[]);const b=s=>{(s.key==="Enter"||s.key===" ")&&(s.preventDefault(),a())},m=()=>{const s=i.noteType||"default",o=20;return s==="scripture"?e.jsx(v,{name:"scroll",size:o,style:{color:"var(--color-deep-grey)"}}):s==="resource"?e.jsx(v,{name:"newspaper",size:o,style:{color:"var(--color-deep-grey)"}}):e.jsx("svg",{width:o,height:o,style:{color:"var(--color-deep-grey)",opacity:.3},fill:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{d:"M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"})})};return e.jsx("div",{className:"group",style:{position:"relative",animation:"fadeIn 0.3s ease-out forwards",opacity:0},children:e.jsxs("div",{onClick:a,onKeyDown:b,role:"button",tabIndex:0,className:"relative cursor-pointer",style:{position:"relative",borderRadius:"0.75rem",height:"48px",width:"100%",textAlign:"left",backgroundColor:"white",boxShadow:"none",border:x?"2px solid var(--color-bold-blue)":"none",transition:"transform 0.2s",cursor:"pointer"},onMouseEnter:s=>{s.currentTarget.style.transform="scale(1.002)",h(!0)},onMouseLeave:s=>{s.currentTarget.style.transform="scale(1)",h(!1)},children:[e.jsx("div",{style:{position:"absolute",top:0,bottom:0,left:0,width:"2.75rem",borderTopLeftRadius:"0.75rem",borderBottomLeftRadius:"0.75rem",overflow:"hidden",backgroundColor:"var(--color-light-paper)",display:"flex",alignItems:"center",justifyContent:"center"},children:(i.noteType==="resource"||i.noteType==="scripture")&&e.jsx("div",{style:{width:"20px",height:"20px",display:"flex",alignItems:"center",justifyContent:"center",opacity:.3},children:m()})}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"1.5rem",paddingLeft:i.noteType==="resource"||i.noteType==="scripture"?"3.5rem":"0.75rem",paddingRight:"3rem",height:"100%",overflow:"hidden"},children:[(!i.noteType||i.noteType==="default")&&e.jsx("div",{style:{position:"relative",flexShrink:0,width:"1.25rem",height:"1.25rem"},children:m()}),e.jsx("div",{style:{display:"flex",flexDirection:"column",gap:"0.25rem",flex:1,minWidth:0},children:e.jsx("div",{style:{fontFamily:"var(--font-sans)",fontWeight:700,color:"var(--color-deep-grey)",fontSize:"16px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:i.title})})]}),e.jsx("div",{style:{position:"absolute",top:"50%",right:"0.75rem",transform:"translateY(-50%)",width:"2rem",height:"2rem",display:"flex",alignItems:"center",justifyContent:"center",opacity:y?p?1:0:1,transition:"opacity 0.2s",zIndex:10,pointerEvents:"none"},className:"add-button-wrapper",children:e.jsx(T,{variant:"Add",onClick:s=>{s.preventDefault(),s.stopPropagation(),a()},disabled:c,className:"w-8 h-8",style:{pointerEvents:"auto"}})})]})})},R=({item:i,isSelected:x,isLoading:c,onClick:a})=>{const[p,h]=l.useState(!1),[y,g]=l.useState(!0),b=i.color?`var(--color-${i.color})`:"var(--color-purple)";l.useEffect(()=>{if(typeof window<"u"){const s=window.matchMedia("(hover: hover)");g(s.matches)}},[]);const m=s=>{(s.key==="Enter"||s.key===" ")&&(s.preventDefault(),a())};return e.jsx("div",{className:"group",style:{position:"relative",animation:"fadeIn 0.3s ease-out forwards",opacity:0},children:e.jsxs("div",{onClick:a,onKeyDown:m,role:"button",tabIndex:0,className:"relative cursor-pointer",style:{position:"relative",borderRadius:"0.75rem",height:"48px",width:"100%",textAlign:"left",backgroundColor:"white",boxShadow:"0px 2px 8px 0px rgba(120, 118, 111, 0.1)",border:x?"2px solid var(--color-bold-blue)":"none",transition:"transform 0.2s",cursor:"pointer"},onMouseEnter:s=>{s.currentTarget.style.transform="scale(1.002)",h(!0)},onMouseLeave:s=>{s.currentTarget.style.transform="scale(1)",h(!1)},children:[e.jsx("div",{style:{position:"absolute",top:0,bottom:0,left:0,width:"2.75rem",borderTopLeftRadius:"0.75rem",borderBottomLeftRadius:"0.75rem",overflow:"hidden",backgroundColor:b,zIndex:10}}),e.jsx("div",{style:{position:"absolute",top:0,bottom:0,left:"2.75rem",right:0,borderTopRightRadius:"0.75rem",borderBottomRightRadius:"0.75rem",backgroundColor:"white"}}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"1.5rem",paddingLeft:"0.75rem",paddingRight:"3rem",height:"100%",overflow:"hidden",position:"relative",zIndex:20},children:[e.jsx("div",{style:{position:"relative",flexShrink:0,width:"1.25rem",height:"1.25rem"},children:i.isPublic===!0?e.jsx("svg",{style:{display:"block",maxWidth:"none",width:"100%",height:"100%",color:"var(--color-deep-grey)",opacity:.3},fill:"currentColor",viewBox:"0 0 640 640",children:e.jsx("path",{d:"M96 192C96 130.1 146.1 80 208 80C269.9 80 320 130.1 320 192C320 253.9 269.9 304 208 304C146.1 304 96 253.9 96 192zM32 528C32 430.8 110.8 352 208 352C305.2 352 384 430.8 384 528L384 534C384 557.2 365.2 576 342 576L74 576C50.8 576 32 557.2 32 534L32 528zM464 128C517 128 560 171 560 224C560 277 517 320 464 320C411 320 368 277 368 224C368 171 411 128 464 128zM464 368C543.5 368 608 432.5 608 512L608 534.4C608 557.4 589.4 576 566.4 576L421.6 576C428.2 563.5 432 549.2 432 534L432 528C432 476.5 414.6 429.1 385.5 391.3C408.1 376.6 435.1 368 464 368z"})}):e.jsx("svg",{style:{display:"block",maxWidth:"none",width:"100%",height:"100%",color:"var(--color-deep-grey)",opacity:.3},fill:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{d:"M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"})})}),e.jsx("div",{style:{display:"flex",flexDirection:"column",gap:"0.25rem",flex:1,minWidth:0},children:e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"12px",minWidth:0},children:[e.jsx("div",{style:{fontFamily:"var(--font-sans)",fontWeight:700,color:"var(--color-deep-grey)",fontSize:"16px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:i.title}),i.count!==void 0&&i.count!==null&&i.count>0&&e.jsx("div",{className:"badge-count",style:{flexShrink:0},children:e.jsx("span",{className:"badge-number",children:L(i.count)})})]})})]}),e.jsx("div",{style:{position:"absolute",top:"50%",right:"0.75rem",transform:"translateY(-50%)",width:"2rem",height:"2rem",display:"flex",alignItems:"center",justifyContent:"center",opacity:y?p?1:0:1,transition:"opacity 0.2s",zIndex:10,pointerEvents:"none"},className:"add-button-wrapper",children:e.jsx(T,{variant:"Add",onClick:s=>{s.preventDefault(),s.stopPropagation(),a()},disabled:c,className:"w-8 h-8",style:{pointerEvents:"auto"}})})]})})};function Y({allNotes:i,allThreads:x,currentSpaceId:c,currentThreadId:a=null,onItemSelect:p,selectedItems:h,isLoading:y=!1,placeholder:g="Search notes and threads",emptyMessage:b="No items found",itemsToShow:m="all",currentThreadNoteIds:s=[]}){const[o,w]=l.useState(""),d=l.useMemo(()=>{const r=[];return i.forEach(t=>{a&&s.includes(t.id)||(c===null?r.push({id:t.id,title:t.title||"Untitled Note",type:"note",spaceId:t.spaceId,content:t.content,updatedAt:t.updatedAt,createdAt:t.createdAt,lastAccessed:void 0,noteType:t.noteType||"default",resourceImage:t.resourceImage||null,resourceTitle:t.resourceTitle||null,resourceDescription:t.resourceDescription||null}):t.spaceId!==c&&r.push({id:t.id,title:t.title||"Untitled Note",type:"note",spaceId:t.spaceId,content:t.content,updatedAt:t.updatedAt,createdAt:t.createdAt,lastAccessed:void 0}))}),m==="all"&&x.forEach(t=>{t.id!=="thread_unorganized"&&(c===null?r.push({id:t.id,title:t.title,type:"thread",spaceId:t.spaceId,color:t.color,isPublic:t.isPublic,subtitle:t.subtitle,count:t.count,updatedAt:t.updatedAt,createdAt:t.createdAt,lastAccessed:void 0}):t.spaceId!==c&&r.push({id:t.id,title:t.title,type:"thread",spaceId:t.spaceId,color:t.color,isPublic:t.isPublic,subtitle:t.subtitle,count:t.count,updatedAt:t.updatedAt,createdAt:t.createdAt,lastAccessed:void 0}))}),r.filter(t=>!h.includes(t.id))},[i,x,c,a,s,h,m]),{recentItems:j,otherItems:A}=l.useMemo(()=>{const r=u=>u?u instanceof Date?u.getTime():typeof u=="string"?new Date(u).getTime():0:0,t=[...d].sort((u,I)=>{const E=r(u.updatedAt)||r(u.createdAt)||0;return(r(I.updatedAt)||r(I.createdAt)||0)-E}),n=t.slice(0,3),C=t.slice(3);return{recentItems:n,otherItems:C}},[d]),f=l.useMemo(()=>{if(!o.trim())return d;const r=o.toLowerCase();return d.filter(n=>n.title.toLowerCase().includes(r)||n.type==="note"&&n.content?.toLowerCase().includes(r))},[d,o]),_=(r,t)=>{p(r,t),w("")},N=(r,t)=>{const n=h.includes(r.id);return e.jsx(D,{item:r,isSelected:n,isLoading:y,onClick:t})},k=(r,t)=>{const n=h.includes(r.id);return e.jsx(R,{item:r,isSelected:n,isLoading:y,onClick:t})};return e.jsxs("div",{className:"flex-1 flex flex-col min-h-0",children:[e.jsx("style",{children:`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}),e.jsx("div",{className:"mb-3",children:e.jsx(S,{placeholder:g||(m==="notes"?"Search notes":"Search notes and threads"),value:o,onChange:w})}),o&&e.jsx("div",{className:"flex flex-col gap-2 max-h-48 overflow-y-auto",children:f.length===0?e.jsxs("div",{className:"text-center py-4 text-[var(--color-stone-grey)] text-sm font-sans",children:[b,' matching "',o,'"']}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"text-[12px] text-[var(--color-stone-grey)] font-sans mb-1",children:[f.length," ",f.length===1?"item":"items"," found"]}),e.jsx("div",{className:"flex flex-col gap-2",children:f.map(r=>{const t=()=>_(r.id,r.type);return e.jsx(z.Fragment,{children:r.type==="note"?N(r,t):k(r,t)},r.id)})})]})}),!o&&e.jsx(e.Fragment,{children:d.length===0?e.jsx("div",{className:"text-center py-4 text-[var(--color-stone-grey)] text-sm font-sans",children:c===null?"No items available to add":"All items are already in this space"}):e.jsxs("div",{className:"flex flex-col gap-3 flex-1 overflow-y-auto min-h-0",children:[j.length>0&&e.jsxs("div",{className:"flex flex-col gap-2",children:[e.jsxs("div",{className:"flex items-center justify-between px-2",children:[e.jsx("div",{className:"text-[12px] text-[var(--color-stone-grey)] font-sans leading-[normal] text-nowrap",children:"Most Recent"}),d.length>0&&e.jsxs("div",{className:"text-[12px] text-[var(--color-stone-grey)] font-sans leading-[normal] text-nowrap",children:[d.length," ",d.length===1?"item":"items"," available"]})]}),e.jsx("div",{className:"flex flex-col gap-2",children:j.map(r=>{const t=()=>_(r.id,r.type);return e.jsx(z.Fragment,{children:r.type==="note"?N(r,t):k(r,t)},r.id)})})]}),A.length>0&&e.jsxs("div",{className:"flex flex-col gap-2",children:[j.length>0&&e.jsx("div",{className:"pt-2 border-t border-[rgba(120,118,111,0.15)]",children:e.jsx("div",{className:"text-[12px] text-[var(--color-stone-grey)] font-sans leading-[normal] text-nowrap mb-2",children:"All items"})}),j.length===0&&e.jsxs("div",{className:"flex items-center justify-between px-2",children:[e.jsx("div",{className:"text-[12px] text-[var(--color-stone-grey)] font-sans leading-[normal] text-nowrap",children:"All items"}),d.length>0&&e.jsxs("div",{className:"text-[12px] text-[var(--color-stone-grey)] font-sans leading-[normal] text-nowrap",children:[d.length," ",d.length===1?"item":"items"," available"]})]}),e.jsx("div",{className:"flex flex-col gap-2",children:A.map(r=>{const t=()=>_(r.id,r.type);return e.jsx(z.Fragment,{children:r.type==="note"?N(r,t):k(r,t)},r.id)})})]})]})}),y&&e.jsx("div",{className:"text-[12px] text-[var(--color-stone-grey)] font-sans text-center mt-2",children:"Adding..."})]})}function G({isShared:i,shareUrl:x,onToggle:c,onRefresh:a,isLoading:p=!1,isEditMode:h=!1,privateTriggerLabel:y="Only I can see this thread",sharedTriggerLabel:g="Shared to anyone with link",privateOptionLabel:b="Only I can see this thread",sharedOptionLabel:m="Share to anyone with link",shareNotReadyLabel:s}){const[o,w]=l.useState(!1),[d,j]=l.useState(!1),[A,f]=l.useState(null),_=l.useRef(null);l.useEffect(()=>{if(!o)return;const n=u=>{const I=u.target;_.current&&!_.current.contains(I)&&(w(!1),f(null))},C=u=>{u.key==="Escape"&&(w(!1),f(null))};return document.addEventListener("mousedown",n),document.addEventListener("keydown",C),()=>{document.removeEventListener("mousedown",n),document.removeEventListener("keydown",C)}},[o]);const N=async()=>{if(x)try{await navigator.clipboard.writeText(x),j(!0),window.dispatchEvent(new CustomEvent("toast",{detail:{message:"Link copied to clipboard",type:"success"}})),setTimeout(()=>j(!1),2e3)}catch(n){console.error("Failed to copy:",n),window.dispatchEvent(new CustomEvent("toast",{detail:{message:"Failed to copy link",type:"error"}}))}},k=async n=>{p||(n==="private"&&i?await c(!1):n==="shared"&&!i&&await c(!0),(n==="private"&&!i||n==="shared"&&i)&&(w(!1),f(null)))},r=async()=>{!a||p||await a()},t=i;return e.jsxs("div",{className:"thread-visibility-dropdown",ref:_,children:[e.jsx("button",{type:"button",onClick:()=>w(!o),disabled:p,className:"thread-visibility-dropdown__trigger space-button h-[64px] w-full",style:{backgroundImage:"var(--color-gradient-gray)"},children:e.jsxs("div",{className:"flex items-center justify-between gap-3 relative w-full h-full",children:[e.jsxs("div",{className:"flex items-center gap-3 flex-1 min-w-0",children:[e.jsx("div",{className:"size-4 flex items-center justify-center shrink-0",children:e.jsx(v,{name:i?"user-group":"user",size:16,style:{color:"var(--color-deep-grey)"}})}),e.jsx("span",{className:"font-sans text-[18px] font-semibold whitespace-nowrap truncate text-[var(--color-deep-grey)]",children:i?g:y})]}),e.jsx("div",{className:"size-4 flex items-center justify-center shrink-0",children:e.jsx(v,{name:o?"chevron-up":"chevron-down",size:16,style:{color:"var(--color-deep-grey)"}})})]})}),o&&e.jsxs("div",{className:"thread-visibility-dropdown__options",children:[e.jsx("button",{type:"button",onClick:()=>k("private"),onMouseEnter:()=>f("private"),onMouseLeave:()=>f(i?"shared":null),disabled:p,className:"thread-visibility-dropdown__option",children:e.jsxs("div",{className:"thread-visibility-dropdown__option-content",children:[e.jsxs("div",{className:"flex items-center gap-3 flex-1 min-w-0",children:[e.jsx("div",{className:"thread-visibility-dropdown__icon-slot",children:e.jsx(v,{name:"user",size:16,style:{color:"var(--color-deep-grey)"}})}),e.jsx("span",{className:"thread-visibility-dropdown__option-text",children:i?"Turn off sharing":b})]}),!i&&e.jsx("div",{className:"thread-visibility-dropdown__check-slot",children:e.jsx("span",{className:"thread-visibility-dropdown__check","aria-hidden":"true",children:e.jsx(v,{name:"check",size:16,style:{color:"var(--color-deep-grey)"}})})})]})}),e.jsx("button",{type:"button",onClick:()=>k("shared"),disabled:p,className:"thread-visibility-dropdown__option",children:e.jsxs("div",{className:"thread-visibility-dropdown__option-content",children:[e.jsxs("div",{className:"flex items-center gap-3 flex-1 min-w-0",children:[e.jsx("div",{className:"thread-visibility-dropdown__icon-slot",children:e.jsx(v,{name:"user-group",size:16,style:{color:"var(--color-deep-grey)"}})}),e.jsx("span",{className:"thread-visibility-dropdown__option-text",children:i?g:m})]}),i&&e.jsx("div",{className:"thread-visibility-dropdown__check-slot",children:e.jsx("span",{className:"thread-visibility-dropdown__check","aria-hidden":"true",children:e.jsx(v,{name:"check",size:16,style:{color:"var(--color-deep-grey)"}})})})]})}),t&&e.jsx("div",{className:"thread-visibility-dropdown__sharing-ui",children:h&&x?e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"thread-visibility-dropdown__link-container",children:[e.jsx("input",{type:"text",readOnly:!0,value:x,className:"thread-visibility-dropdown__link-input",onClick:n=>n.target.select()}),e.jsx(M,{type:"button",onClick:N,disabled:p,state:"Default",children:d?"Copied":"Copy"})]}),a&&e.jsxs("button",{type:"button",onClick:r,disabled:p,className:"btn-cta btn--secondary",children:[e.jsx("span",{className:"btn-cta__content",children:"Generate a New Sharable Link"}),e.jsx("div",{className:"btn-cta__shadow"})]})]}):e.jsxs("div",{className:"thread-visibility-dropdown__placeholder",children:[e.jsx(v,{name:"circle-info",size:14,style:{color:"var(--color-pebble-grey)",flexShrink:0}}),e.jsx("span",{children:s??(h?"Share link will be available after enabling sharing":"Share link will be available after creating the thread")})]})})]}),e.jsx("style",{children:`
        .thread-visibility-dropdown {
          position: relative;
          width: 100%;
        }

        .thread-visibility-dropdown__trigger {
          border-radius: 1.5rem;
          transition: all 0.2s ease;
        }

        .thread-visibility-dropdown__trigger:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .thread-visibility-dropdown__options {
          position: absolute;
          top: calc(100% + 0.5rem);
          left: 0;
          right: 0;
          background: white;
          border-radius: 1.5rem;
          box-shadow: 0px 3px 20px 0px rgba(120, 118, 111, 0.15);
          overflow: hidden;
          z-index: 1000;
          display: flex;
          flex-direction: column;
        }

        .thread-visibility-dropdown__option {
          display: flex;
          align-items: center;
          padding: 0;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: background-color 0.15s ease;
          text-align: left;
          width: 100%;
          min-height: 48px;
        }

        .thread-visibility-dropdown__option:hover:not(:disabled) {
          background: var(--color-gradient-gray);
        }

        .thread-visibility-dropdown__option:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .thread-visibility-dropdown__option-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding-top: 1rem;
          padding-bottom: 1rem;
          padding-left: 1rem;
          padding-right: 1rem;
          gap: 0.75rem;
        }

        .thread-visibility-dropdown__icon-slot {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .thread-visibility-dropdown__option-text {
          font-family: var(--font-sans);
          font-size: 18px;
          font-weight: 600;
          color: var(--color-deep-grey);
          text-align: left;
        }

        .thread-visibility-dropdown__check-slot {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .thread-visibility-dropdown__check {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
        }

        .thread-visibility-dropdown__chevron-slot {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .thread-visibility-dropdown__sharing-ui {
          padding: 0.75rem 1rem 1rem 1rem;
          background: var(--color-snow-white);
          border-radius: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .thread-visibility-dropdown__link-container {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: var(--color-gradient-gray);
          border-radius: 1.5rem;
        }

        .thread-visibility-dropdown__link-container .btn {
          flex-shrink: 0;
        }

        .thread-visibility-dropdown__link-input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          font-size: 0.875rem; /* 14px - matches text-sm */
          line-height: 1.25rem;
          color: var(--color-deep-grey);
          outline: none;
          text-overflow: ellipsis;
          font-family: var(--font-sans);
        }


        .thread-visibility-dropdown__placeholder {
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
      `})]})}export{Y as A,G as T};
