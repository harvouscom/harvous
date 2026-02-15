import{j as n}from"./jsx-runtime.D_zvdyIk.js";import{r as t}from"./index.BhzxgM1Y.js";import{t as i,T as l}from"./index.CmOBps3x.js";import"./_commonjsHelpers.Cpj98o6Y.js";import"./index.nTLIsj4E.js";import"./index.B-VhWVu8.js";function w(){const r=t.useRef(!1),[s,p]=t.useState(!1),[d,c]=t.useState(!1),a=t.useCallback(()=>{const o=window.innerWidth;p(o<1160),c(o<800)},[]);t.useEffect(()=>(a(),window.addEventListener("resize",a),()=>window.removeEventListener("resize",a)),[a]),t.useEffect(()=>{if(r.current)return;const o=i.success("",{duration:0,icon:null,style:{opacity:0,pointerEvents:"none",position:"fixed",left:"-9999px",top:"-9999px"}});r.current=!0,setTimeout(()=>{i.dismiss(o)},50)},[]);const e={backgroundColor:"rgb(255, 255, 255)",background:"linear-gradient(168.707deg, rgba(255, 255, 255, 1.0) 11.711%, rgb(248, 248, 248) 71.325%)",color:"var(--color-deep-grey)",fontFamily:'"Reddit Sans", system-ui, -apple-system, sans-serif',fontSize:"16px",fontWeight:"600",borderRadius:"12px",boxShadow:"0px 7px 16px 0px rgba(0, 0, 0, 0.1), 0px 30px 30px 0px rgba(0, 0, 0, 0.09), 0px 67px 40px 0px rgba(0, 0, 0, 0.05), 0px 119px 47px 0px rgba(0, 0, 0, 0.01), 0px 185px 52px 0px rgba(0, 0, 0, 0)",padding:"16px 20px",textAlign:"center",minWidth:"280px"},m=d?{...e,bottom:"48px",width:"90vw",minWidth:"auto"}:e;return n.jsxs(n.Fragment,{children:[n.jsx(l,{position:s?"bottom-center":"bottom-right",toastOptions:{duration:4e3,style:m,classNames:{toast:"rounded-xl toast-center-text",title:"font-semibold text-[16px] text-center"}}}),n.jsx("style",{children:`
        /* Upgrade toast: message full width, then cancel + action in a row, centered */
        .harvous-upgrade-toast,
        [data-sonner-toast]:has(button[data-cancel]) {
          --toast-button-margin-start: 0 !important;
          --toast-button-margin-end: 0 !important;
          display: flex !important;
          flex-direction: row !important;
          flex-wrap: wrap !important;
          justify-content: center !important;
          align-items: center !important;
          gap: 0.5rem 0.75rem !important;
        }
        .harvous-upgrade-toast [data-button],
        [data-sonner-toast]:has(button[data-cancel]) [data-button] {
          margin-left: 0 !important;
          margin-right: 0 !important;
        }
        .harvous-upgrade-toast *,
        [data-sonner-toast]:has(button[data-cancel]) > *,
        [data-sonner-toast]:has(button[data-cancel]) *:has(button[data-action]) {
          justify-content: center !important;
        }
        .harvous-upgrade-toast > *:first-child,
        [data-sonner-toast]:has(button[data-cancel]) > *:first-child {
          width: 100% !important;
          flex: 0 0 100% !important;
        }
        .harvous-upgrade-toast button[data-cancel],
        [data-sonner-toast]:has(button[data-cancel]) button[data-cancel] {
          order: 1 !important;
        }
        .harvous-upgrade-toast button[data-action],
        [data-sonner-toast]:has(button[data-cancel]) button[data-action] {
          order: 2 !important;
        }

        /* Primary button (Upgrade): btn--sm btn--primary */
        [data-sonner-toaster] button[data-action],
        [data-sonner-toast] button[data-action] {
          position: relative !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background-color: var(--color-bold-blue) !important;
          color: white !important;
          border-radius: 1rem !important;
          padding: 0.75rem 1rem 1rem !important;
          font-family: var(--font-sans) !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          line-height: 0 !important;
          min-height: 39px !important;
          border: none !important;
          cursor: pointer !important;
          white-space: nowrap !important;
          transition: transform 0.3s, box-shadow 0.3s !important;
          will-change: transform, box-shadow !important;
          box-shadow:
            0px -4px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
          margin-top: 8px !important;
        }
        .harvous-upgrade-toast button[data-action],
        .harvous-upgrade-toast button[data-cancel],
        [data-sonner-toast]:has(button[data-cancel]) button[data-action],
        [data-sonner-toast]:has(button[data-cancel]) button[data-cancel] {
          margin-top: 0.5rem !important;
        }
        [data-sonner-toast] button[data-action] + button[data-cancel],
        [data-sonner-toast] button[data-cancel] + button[data-action] {
          margin-left: 0 !important;
        }
        [data-sonner-toaster] button[data-action] *,
        [data-sonner-toast] button[data-action] * {
          color: white !important;
          font-family: var(--font-sans) !important;
          font-weight: 600 !important;
        }
        [data-sonner-toast] button[data-action]:hover {
          background-color: var(--color-bold-blue) !important;
        }
        [data-sonner-toast] button[data-action]:active {
          transform: scale(0.98) !important;
          background-color: var(--color-navy) !important;
          box-shadow:
            0px -2px 0px 0px #0000001a inset,
            0px 0px 2px 0px #00000040,
            0px 2px 0px 0px #00000040 inset !important;
        }

        /* Secondary button (Not now): btn--sm btn--secondary */
        [data-sonner-toast] button[data-cancel] {
          position: relative !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background-color: var(--color-stone-grey) !important;
          color: white !important;
          border-radius: 1rem !important;
          padding: 0.75rem 1rem 1rem !important;
          font-family: var(--font-sans) !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          line-height: 0 !important;
          min-height: 39px !important;
          border: none !important;
          cursor: pointer !important;
          white-space: nowrap !important;
          transition: transform 0.3s, box-shadow 0.3s !important;
          box-shadow:
            0px -4px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
          margin-top: 8px !important;
        }
        [data-sonner-toast] button[data-cancel] * {
          color: white !important;
          font-family: var(--font-sans) !important;
          font-weight: 600 !important;
        }
        [data-sonner-toast] button[data-cancel]:hover {
          background-color: var(--color-stone-grey) !important;
        }
        [data-sonner-toast] button[data-cancel]:active {
          transform: scale(0.98) !important;
          background-color: var(--color-deep-grey) !important;
          box-shadow:
            0px -2px 0px 0px #0000001a inset,
            0px 0px 2px 0px #00000040,
            0px 2px 0px 0px #00000040 inset !important;
        }

        /* Legacy: single action button (no cancel) still primary */
        [data-sonner-toaster] button[data-button]:not([data-cancel]),
        [data-sonner-toaster] [data-button]:not([data-cancel]),
        [data-sonner-toast] button[data-button]:not([data-cancel]) {
          position: relative !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background-color: var(--color-bold-blue) !important;
          color: white !important;
          border-radius: 1rem !important;
          padding: 0.75rem 1rem 1rem !important;
          font-family: var(--font-sans) !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          line-height: 0 !important;
          min-height: 39px !important;
          border: none !important;
          cursor: pointer !important;
          white-space: nowrap !important;
          transition: transform 0.3s, box-shadow 0.3s !important;
          will-change: transform, box-shadow !important;
          box-shadow:
            0px -4px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
          margin-top: 8px !important;
        }
        [data-sonner-toaster] button[data-button]:not([data-cancel]) *,
        [data-sonner-toast] button[data-button]:not([data-cancel]) * {
          color: white !important;
          font-family: var(--font-sans) !important;
          font-weight: 600 !important;
        }
        [data-sonner-toaster] button[data-button]:not([data-cancel]):hover,
        [data-sonner-toast] button[data-button]:not([data-cancel]):hover {
          background-color: var(--color-bold-blue) !important;
        }
        [data-sonner-toaster] button[data-button]:not([data-cancel]):active,
        [data-sonner-toast] button[data-button]:not([data-cancel]):active {
          transform: scale(0.98) !important;
          background-color: var(--color-navy) !important;
          box-shadow:
            0px -2px 0px 0px #0000001a inset,
            0px 0px 2px 0px #00000040,
            0px 2px 0px 0px #00000040 inset !important;
        }
      `})]})}export{w as default};
