import{j as e}from"./jsx-runtime.D_zvdyIk.js";import{r as o}from"./index.BhzxgM1Y.js";import{S as y}from"./experimental.Fw0dhk9J.js";import{C as j,S as C}from"./index.CYA1Mkl7.js";import{S}from"./SquareButton.B2xSus6t.js";import"./Icon.BW19-AbL.js";import"./_commonjsHelpers.Cpj98o6Y.js";import"./loadClerkJsScript-Dz_r2Obb.DorIIEnD.js";import"./telemetry-wqMDWlvR.BqN6QtDy.js";import"./index.Mz72CvlS.js";import"./index.nTLIsj4E.js";import"./index.B-VhWVu8.js";import"./user-id.CKSxU32y.js";import"./safe-navigate.DbjP3MyY.js";import"./preload-helper.BlTxHScW.js";import"./EraseConfirmDialog.CTFsr-3w.js";import"./ButtonSmall.C0bXi-DM.js";import"./offline-mutations.x7h6sfPH.js";import"./offline-db.CC8-cgve.js";import"./module.DK3VP6lo.js";import"./colors.BKCNCj-W.js";import"./safe-fetch.CQfTv-a0.js";import"./url-helpers.R-bCGLpF.js";function B({children:x,publishableKey:s=null}){const[h,a]=o.useState(s),[w,l]=o.useState(""),[b,d]=o.useState(Date.now()),[g,p]=o.useState(!0),f=o.useRef(null);if(o.useEffect(()=>{const t=s||(typeof window<"u"?window.CLERK_PUBLISHABLE_KEY:null);a(t),typeof window<"u"&&(l(window.location.pathname),d(Date.now()))},[s]),o.useEffect(()=>{if(typeof window>"u"||!f.current)return;const t=new IntersectionObserver(r=>{r.forEach(c=>{const m=g,u=c.isIntersecting;!m&&u&&d(Date.now()),p(u)})},{threshold:.1,rootMargin:"0px"});return t.observe(f.current),()=>{t.disconnect()}},[g]),o.useEffect(()=>{const t=()=>{const r=s||(typeof window<"u"?window.CLERK_PUBLISHABLE_KEY:null);a(r),typeof window<"u"&&(l(window.location.pathname),d(Date.now()))};return document.addEventListener("astro:page-load",t),()=>{document.removeEventListener("astro:page-load",t)}},[s]),!h)return e.jsx("button",{type:"button",disabled:!0,style:{opacity:.5,pointerEvents:"none"},"aria-label":"Billing unavailable",children:x});const n=typeof window>"u"?{publishableKey:h,domain:void 0,afterSignInUrl:void 0,afterSignUpUrl:void 0}:{publishableKey:h,domain:window.location.hostname,afterSignInUrl:window.location.origin,afterSignUpUrl:window.location.origin};return e.jsx("div",{ref:f,children:e.jsx(j,{publishableKey:n.publishableKey,domain:n.domain,afterSignInUrl:n.afterSignInUrl,afterSignUpUrl:n.afterSignUpUrl,children:e.jsx(C,{children:e.jsx(y,{children:x},`subscription-details-${b}`)})},`clerk-provider-subscription-${w}-${b}`)})}function G({onClose:x,inBottomSheet:s=!1,publishableKey:h=null}){const[a,w]=o.useState(null),[l,b]=o.useState(null),[d,g]=o.useState(!0);o.useEffect(()=>{p();const i=()=>{p()};window.addEventListener("subscriptionUpgraded",i);const n=()=>{p()};document.addEventListener("astro:page-load",n);const t=c=>{c.detail?.panelName==="manageBilling"&&p()};window.addEventListener("openProfilePanel",t);const r=()=>{p()};return window.addEventListener("mySharingInvalidate",r),()=>{window.removeEventListener("subscriptionUpgraded",i),document.removeEventListener("astro:page-load",n),window.removeEventListener("openProfilePanel",t),window.removeEventListener("mySharingInvalidate",r)}},[]),o.useEffect(()=>{const i=()=>{const t=document.querySelector('.cl-drawerTitle[data-localization-key="billing.subscriptionDetails.title"]');t&&t.textContent!=="Manage Billing"&&(t.textContent="Manage Billing");const r=document.querySelector('.cl-drawerConfirmationDescription[data-localization-key="billing.cancelSubscriptionAccessUntil"]');if(r){const m=r.textContent||"";if(!m.includes("200 notes")){const u=m.match(/until ([^,]+),/);if(u){const v=u[1];r.textContent=`You can keep using 'Unlimited' features until ${v}, after which you will no longer have access. After canceling, you'll be moved to the free plan, which is limited to 200 notes.`}else r.textContent=m+" After canceling, you'll be moved to the free plan, which is limited to 200 notes."}}document.querySelectorAll('[class*="cl-drawer"], [class*="cl-drawerContent"], [class*="cl-drawerBody"]').forEach(m=>{const u=m;u.style.zIndex="200"})},n=new MutationObserver(()=>{i()});return n.observe(document.body,{childList:!0,subtree:!0}),i(),()=>{n.disconnect()}},[]),o.useEffect(()=>{const i=()=>{const t=document.querySelector('.cl-subscriptionDetailsActionButton[data-localization-key="billing.switchToAnnualWithAnnualPrice"]');if(t){const r=t.textContent||"";if(r.includes("annual")&&!r.includes("Switch to $")){const c=r.replace(/\s+annual\s+/i," ");t.textContent=c}}},n=new MutationObserver(()=>{i()});return n.observe(document.body,{childList:!0,subtree:!0,characterData:!0}),i(),()=>{n.disconnect()}},[]);const p=async()=>{g(!0);try{const[i,n]=await Promise.all([fetch("/api/subscription/status",{credentials:"include",cache:"no-store"}),fetch("/api/user/limits",{credentials:"include",cache:"no-store"})]);if(i.ok){const t=await i.json();w({hasUnlimited:t.hasUnlimited,currentCount:t.currentCount||0,limit:t.limit||null,referralBonusNotes:t.referralBonusNotes??0})}if(n.ok){const t=await n.json();t.limits&&b(t)}}catch(i){console.error("ManageBillingPanel: Error loading subscription info:",i)}finally{g(!1)}},f=()=>{x?x():window.dispatchEvent(new CustomEvent("closeProfilePanel"))};return e.jsxs(e.Fragment,{children:[e.jsx("style",{children:`
        /* Style Clerk drawer buttons to match ButtonSmall */
        .cl-drawerFooter .cl-button[data-variant="solid"][data-color="danger"] {
          /* ButtonSmall red/danger variant */
          background-color: var(--color-red) !important;
          color: white !important;
          padding: 0.75rem 1rem 1rem !important;
          font-size: 14px !important;
          line-height: 0 !important;
          min-height: 40px !important;
          border-radius: 1rem !important;
          box-shadow:
            0px -4px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
          border: none !important;
          font-weight: 600 !important;
        }

        .cl-drawerFooter .cl-button[data-variant="solid"][data-color="danger"]:active {
          background-color: #b30524 !important;
          box-shadow:
            0px -1px 0px 0px rgba(0, 0, 0, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
        }

        .cl-drawerFooter .cl-button[data-variant="solid"][data-color="danger"] * {
          color: white !important;
        }

        .cl-drawerFooter .cl-button[data-variant="ghost"][data-color="primary"] {
          /* ButtonSmall secondary variant */
          background-color: var(--color-stone-grey) !important;
          color: white !important;
          padding: 0.75rem 1rem 1rem !important;
          font-size: 14px !important;
          line-height: 0 !important;
          min-height: 40px !important;
          border-radius: 1rem !important;
          box-shadow:
            0px -4px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
          border: none !important;
          font-weight: 600 !important;
        }

        .cl-drawerFooter .cl-button[data-variant="ghost"][data-color="primary"]:active {
          background-color: var(--color-deep-grey) !important;
          box-shadow:
            0px -1px 0px 0px rgba(0, 0, 0, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
        }

        .cl-drawerFooter .cl-button[data-variant="ghost"][data-color="primary"] * {
          color: white !important;
        }

        /* Style subscription details action buttons */
        /* Switch to annual button - ButtonSmall secondary variant */
        .cl-subscriptionDetailsActionButton[data-variant="outline"][data-color="primary"],
        .cl-subscriptionDetailsActionButton {
          background-color: var(--color-stone-grey) !important;
          color: white !important;
          padding: 0.75rem 1rem 1rem !important;
          font-size: 14px !important;
          line-height: 0 !important;
          min-height: 40px !important;
          border-radius: 1rem !important;
          box-shadow:
            0px -4px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
          border: none !important;
          font-weight: 600 !important;
        }

        .cl-subscriptionDetailsActionButton[data-variant="outline"][data-color="primary"]:active,
        .cl-subscriptionDetailsActionButton:active {
          background-color: var(--color-deep-grey) !important;
          box-shadow:
            0px -2px 0px 0px #0000001a inset,
            0px 0px 2px 0px #00000040,
            0px 2px 0px 0px #00000040 inset !important;
        }

        .cl-subscriptionDetailsActionButton[data-variant="outline"][data-color="primary"] *,
        .cl-subscriptionDetailsActionButton * {
          color: white !important;
        }

        /* Cancel subscription button - ButtonSmall red/danger variant */
        .cl-subscriptionDetailsCancelButton[data-variant="ghost"][data-color="danger"],
        .cl-subscriptionDetailsCancelButton {
          background-color: var(--color-red) !important;
          color: white !important;
          padding: 0.75rem 1rem 1rem !important;
          font-size: 14px !important;
          line-height: 0 !important;
          min-height: 40px !important;
          border-radius: 1rem !important;
          box-shadow:
            0px -4px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
          border: none !important;
          font-weight: 600 !important;
        }

        .cl-subscriptionDetailsCancelButton[data-variant="ghost"][data-color="danger"]:active,
        .cl-subscriptionDetailsCancelButton:active {
          background-color: #b30524 !important;
          box-shadow:
            0px -2px 0px 0px #0000001a inset,
            0px 0px 2px 0px #00000040,
            0px 2px 0px 0px #00000040 inset !important;
        }

        .cl-subscriptionDetailsCancelButton[data-variant="ghost"][data-color="danger"] *,
        .cl-subscriptionDetailsCancelButton * {
          color: white !important;
        }

        /* Style subscription details card badge - Active badge */
        .cl-subscriptionDetailsCardBadge[data-color="secondary"],
        .cl-subscriptionDetailsCardBadge {
          background-color: var(--color-bold-blue) !important;
          color: white !important;
          border-radius: 0.75rem !important;
          font-weight: 600 !important;
        }

        .cl-subscriptionDetailsCardBadge[data-color="secondary"] *,
        .cl-subscriptionDetailsCardBadge * {
          color: white !important;
        }

        /* Adjust spacing between confirmation title and description */
        .cl-drawerFooter .cl-drawerConfirmationAction {
          gap: 0 !important;
          display: flex !important;
          flex-direction: column !important;
        }

        .cl-drawerFooter .cl-drawerConfirmationTitle,
        .cl-drawerFooter h2.cl-drawerConfirmationTitle {
          margin: 0 !important;
          margin-bottom: 12px !important;
          padding: 0 !important;
          line-height: 1.2 !important;
        }

        .cl-drawerFooter .cl-drawerConfirmationDescription,
        .cl-drawerFooter p.cl-drawerConfirmationDescription {
          margin: 0 !important;
          padding: 0 !important;
          line-height: 1.4 !important;
        }

        /* Target all possible wrapper elements */
        .cl-drawerFooter .cl-drawerConfirmationAction > * {
          margin-top: 0 !important;
          margin-bottom: 0 !important;
        }

        .cl-drawerFooter .cl-drawerConfirmationAction > h2 {
          margin-bottom: 12px !important;
        }

        /* Ensure Clerk drawer appears above bottom sheet */
        [class*="cl-drawer"],
        [class*="cl-drawerContent"],
        [class*="cl-drawerBody"],
        [class*="cl-internal"][class*="cl-drawer"],
        [class*="cl-internal"][class*="cl-drawerContent"],
        [class*="cl-internal"][class*="cl-drawerBody"] {
          z-index: 200 !important;
        }

        /* Billing limit upgrade links - same hover/active as condensed items */
        .billing-limit-link {
          transition: transform 200ms ease;
        }
        .billing-limit-link:hover {
          transform: scale(1.002);
        }
        .billing-limit-link:active {
          transform: scale(0.99);
        }

      `}),e.jsxs("div",{className:`panel-wrapper ${s?"panel-wrapper--bottom-sheet":""}`,children:[e.jsxs("div",{className:s?"flex-1 flex flex-col min-h-0":"flex flex-col",style:{position:"relative"},children:[d&&e.jsx("div",{className:"panel__progress-bar",style:{position:"absolute",top:0,left:0,right:0,zIndex:50},children:e.jsx("div",{className:"panel__progress-fill"})}),e.jsxs("div",{className:`panel ${s?"panel--bottom-sheet":""} ${d?"opacity-60 pointer-events-none":""}`,children:[e.jsx("div",{className:"panel__header",children:e.jsx("div",{className:"panel__title",children:e.jsx("p",{children:"My Subscription"})})}),e.jsx("div",{className:`panel__body ${s?"panel__body--bottom-sheet":""}`,children:e.jsxs("div",{className:`panel__content ${s?"panel__content--bottom-sheet":""}`,style:{gap:"12px"},children:[!d&&a&&(()=>{const i="var(--color-red, #dc2626)",n=!a.hasUnlimited&&(a.limit??200)-a.currentCount<=100,t=l!=null&&l.limits.ownedSharedSpaces.limit!=null&&l.limits.ownedSharedSpaces.remaining<=0,r=l!=null&&l.limits.ownedSharedSpaces.limit!=null&&t?Math.min(l.limits.ownedSharedSpaces.current,l.limits.ownedSharedSpaces.limit):l?.limits.ownedSharedSpaces.current??0,c=l?.limits.ownedSharedSpaces.limit;return e.jsxs("div",{className:"w-full",children:[e.jsx("div",{className:"font-sans text-center px-4 pt-3 pb-2",style:{color:"var(--color-pebble-grey)",fontSize:"16px",textWrap:"balance",marginBottom:12},children:a.hasUnlimited?"You're on the Unlimited plan":"You're on the free plan"}),e.jsxs("div",{className:"flex flex-col",style:{gap:12,marginBottom:12},children:[a.hasUnlimited?e.jsxs("div",{className:"bg-white rounded-xl p-3 flex items-center gap-3",style:{border:"1px solid",borderColor:"var(--color-fog-white)"},children:[e.jsx("svg",{className:"w-4 h-4 flex-shrink-0 fill-current",style:{color:"var(--color-deep-grey)"},viewBox:"0 0 384 512","aria-hidden":"true",children:e.jsx("path",{d:"M0 48V487.7C0 501.1 10.9 512 24.3 512c5 0 9.9-1.5 14-4.4L192 400 345.7 507.6c4.1 2.9 9 4.4 14 4.4c13.4 0 24.3-10.9 24.3-24.3V48c0-26.5-21.5-48-48-48H48C21.5 0 0 21.5 0 48z"})}),e.jsx("div",{className:"min-w-0 flex-1 flex justify-between items-center text-left",children:e.jsx("span",{className:"text-base font-semibold",style:{color:"var(--color-deep-grey)"},children:"Unlimited notes"})})]}):e.jsxs("a",{href:"/upgrade",className:"billing-limit-link bg-white rounded-xl p-3 flex items-center gap-3",style:{border:"1px solid",borderColor:n?i:"var(--color-fog-white)",textDecoration:"none"},children:[e.jsx("svg",{className:"w-4 h-4 flex-shrink-0 fill-current",style:{color:n?i:"var(--color-deep-grey)"},viewBox:"0 0 384 512","aria-hidden":"true",children:e.jsx("path",{d:"M0 48V487.7C0 501.1 10.9 512 24.3 512c5 0 9.9-1.5 14-4.4L192 400 345.7 507.6c4.1 2.9 9 4.4 14 4.4c13.4 0 24.3-10.9 24.3-24.3V48c0-26.5-21.5-48-48-48H48C21.5 0 0 21.5 0 48z"})}),e.jsxs("div",{className:"min-w-0 flex-1 flex justify-between items-center text-left",children:[e.jsx("span",{className:"text-base font-semibold",style:{color:n?i:"var(--color-deep-grey)"},children:`${a.currentCount.toLocaleString()} of ${(a.limit??200).toLocaleString()} notes${(a.referralBonusNotes??0)>0?` (+${a.referralBonusNotes} from referrals)`:""}`}),e.jsx("span",{className:"text-xs flex-shrink-0",style:{color:n?i:"var(--color-pebble-grey)"},children:"Upgrade for unlimited"})]})]}),l&&(a.hasUnlimited?e.jsxs("div",{className:"bg-white rounded-xl p-3 flex items-center gap-3",style:{border:"1px solid",borderColor:"var(--color-fog-white)"},children:[e.jsx("svg",{className:"w-4 h-4 flex-shrink-0 fill-current",style:{color:"var(--color-deep-grey)"},viewBox:"0 0 512 512","aria-hidden":"true",children:e.jsx("path",{d:"M234.5 5.7c13.9-5 29.1-5 43.1 0l192 68.6C495 83.4 512 107.5 512 134.6l0 242.9c0 27-17 51.2-42.5 60.3l-192 68.6c-13.9 5-29.1 5-43.1 0l-192-68.6C17 428.6 0 404.5 0 377.4L0 134.6c0-27 17-51.2 42.5-60.3l192-68.6zM256 66L82.3 128 256 190l173.7-62L256 66zm32 368.6l160-57.1 0-188L288 246.6l0 188z"})}),e.jsx("div",{className:"min-w-0 flex-1 flex justify-between items-center text-left",children:e.jsx("span",{className:"text-base font-semibold",style:{color:"var(--color-deep-grey)"},children:c!=null?`${r} of ${c} spaces shared`:`${r} (unlimited) spaces shared`})})]}):e.jsxs("a",{href:"/upgrade",className:"billing-limit-link bg-white rounded-xl p-3 flex items-center gap-3",style:{border:"1px solid",borderColor:t?i:"var(--color-fog-white)",textDecoration:"none"},children:[e.jsx("svg",{className:"w-4 h-4 flex-shrink-0 fill-current",style:{color:t?i:"var(--color-deep-grey)"},viewBox:"0 0 512 512","aria-hidden":"true",children:e.jsx("path",{d:"M234.5 5.7c13.9-5 29.1-5 43.1 0l192 68.6C495 83.4 512 107.5 512 134.6l0 242.9c0 27-17 51.2-42.5 60.3l-192 68.6c-13.9 5-29.1 5-43.1 0l-192-68.6C17 428.6 0 404.5 0 377.4L0 134.6c0-27 17-51.2 42.5-60.3l192-68.6zM256 66L82.3 128 256 190l173.7-62L256 66zm32 368.6l160-57.1 0-188L288 246.6l0 188z"})}),e.jsxs("div",{className:"min-w-0 flex-1 flex justify-between items-center text-left",children:[e.jsx("span",{className:"text-base font-semibold",style:{color:t?i:"var(--color-deep-grey)"},children:c!=null?`${r} of ${c} spaces shared`:`${r} (unlimited) spaces shared`}),e.jsx("span",{className:"text-xs flex-shrink-0",style:{color:t?i:"var(--color-pebble-grey)"},children:"Upgrade for unlimited"})]})]}))]})]})})(),!d&&a&&!a.hasUnlimited&&e.jsx("a",{href:"/upgrade",className:"space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 w-full",style:{backgroundImage:"var(--color-gradient-gray)",paddingRight:"8px",textDecoration:"none",display:"block",margin:0},children:e.jsxs("div",{className:"panel__list-item",children:[e.jsx("div",{className:"panel__list-item-text",children:e.jsx("span",{className:"panel__list-item-label",children:"Upgrade to Unlimited"})}),e.jsx("div",{className:"panel__list-item-icon",children:e.jsx("div",{className:"panel__list-item-icon-wrapper",children:e.jsx("div",{className:"panel__external-icon",children:e.jsx("svg",{viewBox:"0 0 320 512",children:e.jsx("path",{d:"M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"})})})})})]})}),!d&&a&&a.hasUnlimited&&e.jsx(B,{publishableKey:h,children:e.jsx("button",{type:"button",className:"space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 w-full",style:{backgroundImage:"var(--color-gradient-gray)",paddingRight:"8px",margin:0},children:e.jsxs("div",{className:"panel__list-item",children:[e.jsx("div",{className:"panel__list-item-text",children:e.jsx("span",{className:"panel__list-item-label",children:"Manage Billing"})}),e.jsx("div",{className:"panel__list-item-icon",children:e.jsx("div",{className:"panel__list-item-icon-wrapper",children:e.jsx("div",{className:"panel__external-icon",children:e.jsx("svg",{viewBox:"0 0 320 512",children:e.jsx("path",{d:"M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"})})})})})]})})})]})})]})]}),e.jsx("div",{className:"panel__footer--buttons",children:e.jsx(S,{variant:"Back",onClick:f,inBottomSheet:s})})]})]})}export{G as default};
