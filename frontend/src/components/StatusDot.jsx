export const StatusDot = ({ online, label }) => (
  <span className="inline-flex items-center gap-2 text-sm" data-testid={online ? "status-online" : "status-offline"}>
    <span
      className={`h-2.5 w-2.5 rounded-full ${online ? "bg-green-500 im-dot-online" : "bg-zinc-300"}`}
      aria-hidden
    />
    <span className={online ? "text-green-700 font-medium" : "text-zinc-500"}>
      {label ?? (online ? "Online" : "Offline")}
    </span>
  </span>
);
