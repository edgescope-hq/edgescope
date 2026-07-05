import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-2xl group-[.toaster]:border-white/[0.08] group-[.toaster]:bg-[oklch(0.105_0.017_270/0.96)] group-[.toaster]:text-foreground group-[.toaster]:shadow-[var(--shadow-elevated)] group-[.toaster]:backdrop-blur-xl",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:rounded-lg group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:rounded-lg group-[.toast]:bg-white/[0.05] group-[.toast]:text-muted-foreground",
          success: "group-[.toast]:border-primary/[0.18]",
          error: "group-[.toast]:border-destructive/[0.18]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
