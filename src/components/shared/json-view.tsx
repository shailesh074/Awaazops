import { cn } from "@/lib/utils";

/** Lightweight, dependency-free JSON syntax colouring. Server-renderable. */
function Value({ value, indent }: { value: unknown; indent: number }) {
  const pad = "  ".repeat(indent + 1);
  const close = "  ".repeat(indent);

  if (value === null) return <span className="text-muted-foreground">null</span>;
  if (typeof value === "string") return <span className="text-success">&quot;{value}&quot;</span>;
  if (typeof value === "number") return <span className="text-warning">{value}</span>;
  if (typeof value === "boolean") return <span className="text-info">{String(value)}</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>[]</span>;
    return (
      <>
        {"[\n"}
        {value.map((v, i) => (
          <span key={i}>
            {pad}
            <Value value={v} indent={indent + 1} />
            {i < value.length - 1 ? "," : ""}
            {"\n"}
          </span>
        ))}
        {close}]
      </>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return <span>{"{}"}</span>;
  return (
    <>
      {"{\n"}
      {entries.map(([k, v], i) => (
        <span key={k}>
          {pad}
          <span className="text-primary">&quot;{k}&quot;</span>: <Value value={v} indent={indent + 1} />
          {i < entries.length - 1 ? "," : ""}
          {"\n"}
        </span>
      ))}
      {close}
      {"}"}
    </>
  );
}

export function JsonView({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre
      className={cn(
        "overflow-auto rounded-lg border bg-background/70 p-4 font-mono text-[12px] leading-5 text-foreground/80",
        className,
      )}
    >
      <code>
        <Value value={value} indent={0} />
      </code>
    </pre>
  );
}
