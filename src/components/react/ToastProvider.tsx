import { Toaster } from 'sonner';

export default function ToastProvider() {

  return (
    <Toaster
      position="top-right"
      expand={true}
      richColors={false}
      closeButton={true}
      toastOptions={{
        duration: 4000,
        style: {
          background: 'white',
          color: 'var(--color-deep-grey)',
          fontFamily: '"Reddit Sans", system-ui, -apple-system, sans-serif',
          fontSize: '16px',
          fontWeight: '600',
          borderRadius: '12px',
          boxShadow: '0px 7px 16px 0px rgba(0, 0, 0, 0.1), 0px 30px 30px 0px rgba(0, 0, 0, 0.09), 0px 67px 40px 0px rgba(0, 0, 0, 0.05), 0px 119px 47px 0px rgba(0, 0, 0, 0.01), 0px 185px 52px 0px rgba(0, 0, 0, 0)',
        },
        classNames: {
          toast: 'text-[var(--color-deep-grey)] bg-white rounded-xl flex items-center gap-3 px-5 py-5',
          title: 'text-[var(--color-deep-grey)] font-medium text-base',
          description: 'text-[var(--color-deep-grey)] text-sm',
          icon: 'hidden',
          closeButton: 'text-[var(--color-deep-grey)] w-5 h-5',
        },
        success: {
          icon: null,
        },
        error: {
          icon: null,
          style: {
            color: 'var(--color-red)',
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
                 [&_[data-icon-container]]:!hidden [&_[data-icon-container]]:!w-0 [&_[data-icon-container]]:!h-0 [&_[data-icon-container]]:!p-0 [&_[data-icon-container]]:!m-0"
    />
  );
}
