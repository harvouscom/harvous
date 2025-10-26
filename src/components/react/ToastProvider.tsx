import { Toaster } from 'sonner';
import CircleCheck from "@fortawesome/fontawesome-free/svgs/solid/circle-check.svg";
import TriangleExclamationIcon from "@fortawesome/fontawesome-free/svgs/solid/triangle-exclamation.svg";

export default function ToastProvider() {

  return (
    <Toaster
      position="top-right"
      expand={false}
      richColors={false}
      closeButton={false}
      toastOptions={{
        duration: 4000,
        style: {
          background: 'linear-gradient(168.707deg, rgba(255, 255, 255, 0.8) 11.711%, rgb(248, 248, 248) 71.325%)',
          color: 'var(--color-deep-grey)',
          fontFamily: '"Reddit Sans", system-ui, -apple-system, sans-serif',
          fontSize: '16px',
          fontWeight: '600',
          borderRadius: '12px',
          boxShadow: '0px 7px 16px 0px rgba(0, 0, 0, 0.1), 0px 30px 30px 0px rgba(0, 0, 0, 0.09), 0px 67px 40px 0px rgba(0, 0, 0, 0.05), 0px 119px 47px 0px rgba(0, 0, 0, 0.01), 0px 185px 52px 0px rgba(0, 0, 0, 0)',
          padding: '8px 20px',
          height: '60px',
        },
        classNames: {
          toast: 'text-[var(--color-deep-grey)] rounded-xl flex items-center gap-3 h-[60px]',
          title: 'text-[var(--color-deep-grey)] font-semibold text-[16px] leading-[100%] flex-1',
          description: 'text-[var(--color-deep-grey)] text-sm',
          icon: 'w-5 h-5 flex-shrink-0',
        },
        success: {
          icon: <img src={CircleCheck.src} alt="Success" className="w-5 h-5" />,
        },
        error: {
          icon: <img src={TriangleExclamationIcon.src} alt="Error" className="w-5 h-5" />,
          style: {
            color: 'var(--color-red)',
          },
          classNames: {
            title: 'text-[var(--color-red)] font-semibold text-[16px] leading-[100%] flex-1',
          },
        },
        info: {
          icon: null,
        },
        warning: {
          icon: null,
        },
      }}
      className="[&>[data-sonner-toaster]]:top-4 [&>[data-sonner-toaster]]:right-4 [&>[data-sonner-toaster]]:left-auto [&>[data-sonner-toaster]]:transform-none
                 min-[768px]:[&>[data-sonner-toaster]]:top-4 min-[768px]:[&>[data-sonner-toaster]]:right-4 min-[768px]:[&>[data-sonner-toaster]]:left-auto
                 max-[767px]:[&>[data-sonner-toaster]]:top-4 max-[767px]:[&>[data-sonner-toaster]]:left-1/2 max-[767px]:[&>[data-sonner-toaster]]:right-auto max-[767px]:[&>[data-sonner-toaster]]:-translate-x-1/2
                 [&_[data-icon-wrapper]]:!hidden [&_[data-icon-wrapper]]:!w-0 [&_[data-icon-wrapper]]:!h-0 [&_[data-icon-wrapper]]:!p-0 [&_[data-icon-wrapper]]:!m-0
                 [&_[data-icon]]:!hidden [&_[data-icon]]:!w-0 [&_[data-icon]]:!h-0 [&_[data-icon]]:!p-0 [&_[data-icon]]:!m-0
                 [&_[data-icon-container]]:!hidden [&_[data-icon-container]]:!w-0 [&_[data-icon-container]]:!h-0 [&_[data-icon-container]]:!p-0 [&_[data-icon-container]]:!m-0
"
    />
  );
}
