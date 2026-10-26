"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, Tabs } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { CashFlow } from "@/src/core/cash-flow";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";

const W = 600;
const H = 160;
const PAD = 8;

/** Money on hand day by day: a line through the window, its low point marked, the days below zero in red. */
export function CashFlowCard({ flow, currency }: { flow: CashFlow; currency: string }) {
  const { money } = useMoneyFormat();
  const [hover, setHover] = useState<number | null>(null);
  const points = flow.points;
  const values = points.map((p) => p.balanceMinor);
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  const span = top - bottom || 1;
  const x = (i: number) => PAD + (i / Math.max(1, points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + ((top - v) / span) * (H - PAD * 2);
  // A step line: a balance holds all day and changes when something lands.
  const path = points.map((p, i) => (i ? `H${x(i).toFixed(1)} V${y(p.balanceMinor).toFixed(1)}` : `M${x(0).toFixed(1)},${y(p.balanceMinor).toFixed(1)}`)).join(" ");
  const zero = y(0);
  const lowIndex = points.findIndex((p) => p.date === flow.lowestDate);
  const shown = hover ?? null;
  const dayEvents = (date: string) => flow.events.filter((e) => (date === points[0]?.date ? e.date <= date : e.date === date));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash flow</CardTitle>
        <p className="meta mt-1">Cash, bank and wallets, day by day, as known income and bills land. Card spending counts when the card is paid.</p>
      </CardHeader>
      <div className="space-y-3 px-6 pb-6">
        <dl data-cash-flow className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[var(--muted-foreground)]">On hand today</dt>
            <dd className="font-mono tabular-nums">{money(flow.startMinor, currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted-foreground)]">Lowest</dt>
            <dd className={`font-mono tabular-nums ${flow.lowestMinor < 0 ? "text-[var(--balance-negative)]" : ""}`}>
              {money(flow.lowestMinor, currency)} <span className="font-sans text-xs text-[var(--muted-foreground)]">on {flow.lowestDate}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted-foreground)]">{flow.nextIncomeDate ? `Bills before income on ${flow.nextIncomeDate}` : "Bills in this window (no income expected)"}</dt>
            <dd className="font-mono tabular-nums">{money(flow.billsBeforeIncomeMinor, currency)}</dd>
          </div>
        </dl>
        {flow.firstShortDate ? (
          <p role="note" className="text-sm text-[var(--balance-negative)]">
            Money on hand goes below zero on {flow.firstShortDate}, down to {money(flow.lowestMinor, currency)} on {flow.lowestDate}. Move money in or put a bill off before then.
          </p>
        ) : null}

        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-40 w-full touch-none"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Money on hand from ${points[0]?.date} to ${points.at(-1)?.date}: lowest ${money(flow.lowestMinor, currency)} on ${flow.lowestDate}`}
            onPointerMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - box.left) / box.width;
              setHover(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
            }}
            onPointerLeave={() => setHover(null)}
          >
            <defs>
              <clipPath id="cash-below">
                <rect x="0" y={zero} width={W} height={Math.max(0, H - zero)} />
              </clipPath>
              <clipPath id="cash-above">
                <rect x="0" y="0" width={W} height={Math.max(0, zero)} />
              </clipPath>
            </defs>
            {bottom < 0 ? <line x1={0} x2={W} y1={zero} y2={zero} stroke="var(--hairline)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" /> : null}
            <path d={path} fill="none" stroke="var(--foreground)" strokeWidth={2} vectorEffect="non-scaling-stroke" clipPath="url(#cash-above)" />
            <path d={path} fill="none" stroke="var(--balance-negative)" strokeWidth={2} vectorEffect="non-scaling-stroke" clipPath="url(#cash-below)" />
            {shown != null ? <line x1={x(shown)} x2={x(shown)} y1={0} y2={H} stroke="var(--muted-foreground)" strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
          </svg>
          {lowIndex >= 0 ? (
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] ${flow.lowestMinor < 0 ? "bg-[var(--balance-negative)]" : "bg-[var(--foreground)]"}`}
              style={{ left: `${(x(lowIndex) / W) * 100}%`, top: `${(y(flow.lowestMinor) / H) * 160}px` }}
            />
          ) : null}
          {shown != null && points[shown] ? (
            <div
              role="tooltip"
              className="pointer-events-none absolute top-0 z-10 w-56 rounded-lg border border-[var(--hairline)] bg-[var(--surface)] p-2 text-xs shadow-lg"
              style={{ left: `min(max(0px, calc(${(x(shown) / W) * 100}% - 7rem)), calc(100% - 14rem))` }}
            >
              <p className="font-mono">{points[shown].date}</p>
              <p className="font-mono tabular-nums">{money(points[shown].balanceMinor, currency)} on hand</p>
              {dayEvents(points[shown].date).map((e, i) => (
                <p key={i} className="truncate text-[var(--muted-foreground)]">
                  {e.label}: {money(e.deltaMinor, currency)}
                </p>
              ))}
            </div>
          ) : null}
          <div className="mt-1 flex justify-between font-mono text-[11px] text-[var(--muted-foreground)]">
            <span>{points[0]?.date}</span>
            <span>{points.at(-1)?.date}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

const WINDOWS = [
  { id: "30", label: "30 days" },
  { id: "60", label: "60 days" },
  { id: "90", label: "90 days" },
];

/** The cash-flow card with its own window, for pages without the account projection. */
export function CashFlowPanel({ workspaceId }: { workspaceId: string }) {
  const [days, setDays] = useState(30);
  const query = useQuery({ queryKey: qk.projection(workspaceId, days), queryFn: () => api.getProjection(workspaceId, days) });
  const data = query.data?.projection;
  if (!data || !data.accounts.length) return null;
  return (
    <section aria-label="Cash flow ahead" className="space-y-3">
      <div className="flex justify-end">
        <Tabs aria-label="Cash flow window" activeId={String(days)} onSelect={(id) => setDays(Number(id))} items={WINDOWS} />
      </div>
      <CashFlowCard flow={data.cashFlow} currency={data.baseCurrency} />
    </section>
  );
}
