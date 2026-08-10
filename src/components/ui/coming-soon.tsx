import { Card, CardBody } from "@/components/ui/card";

/** Заглушка для разделов, которые появятся на следующих шагах. */
export function ComingSoon({
  title,
  hint,
  step,
  points,
}: {
  title: string;
  hint?: string;
  step: string;
  points: string[];
}) {
  return (
    <Card className="rise mx-auto max-w-2xl">
      <CardBody className="space-y-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-[-0.03em]">{title}</h2>
          {hint && <p className="text-sm text-ink-3">{hint}</p>}
        </div>
        <p className="inline-block rounded-full bg-accent-soft px-3 py-1.5 text-[11px] font-bold text-accent">
          Раздел в работе · {step}
        </p>
        <ul className="space-y-2 text-sm text-ink-2">
          {points.map((point) => (
            <li key={point} className="flex gap-2.5">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ink-3" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
