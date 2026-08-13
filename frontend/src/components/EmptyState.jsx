import { Button } from "@/components/ui/button";

export const EmptyState = ({ icon: Icon, title, description, actionLabel, onAction, testId }) => (
  <div
    className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white px-8 py-20 text-center"
    data-testid={testId || "empty-state"}
  >
    {Icon ? (
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
        <Icon className="h-7 w-7" />
      </div>
    ) : null}
    <h3 className="text-xl font-semibold text-zinc-900">{title}</h3>
    {description ? <p className="mt-2 max-w-md text-sm text-zinc-500">{description}</p> : null}
    {actionLabel ? (
      <Button className="mt-7 rounded-full px-6" onClick={onAction} data-testid="empty-state-action">
        {actionLabel}
      </Button>
    ) : null}
  </div>
);
