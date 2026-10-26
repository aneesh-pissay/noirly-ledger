"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { Button, PageContainer } from "@noirly-dev/ui";
import { Input, Label } from "@noirly-dev/ui";
import { ProgressBar } from "@/src/components/ProgressBar";
import { MoneyText } from "@/src/components/MoneyText";
import { SinkingFunds } from "@/src/features/savings-goals/SinkingFunds";

type Props = { workspaceId: string; baseCurrency: string };

export function GoalsScreen({ workspaceId, baseCurrency }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [targetMajor, setTargetMajor] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [contribute, setContribute] = useState<Record<string, string>>({});

  const goals = useQuery({
    queryKey: qk.savingsGoals(workspaceId),
    queryFn: () => api.listGoals(workspaceId),
  });

  const create = useMutation({
    mutationFn: () =>
      api.createGoal(workspaceId, {
        name,
        targetMajor,
        currentMajor: "0",
        currency: baseCurrency,
        targetDate: targetDate || null,
      }),
    onSuccess: () => {
      setName("");
      setTargetMajor("");
      setTargetDate("");
      void queryClient.invalidateQueries({ queryKey: qk.savingsGoals(workspaceId) });
    },
  });

  const add = useMutation({
    mutationFn: ({ id, amountMajor }: { id: string; amountMajor: string }) =>
      api.contributeGoal(id, amountMajor),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: qk.savingsGoals(workspaceId) }),
  });

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Savings goals</h1>
      <form
        className="mt-6 grid gap-3 surface grain rounded-[var(--r-lg)] p-4 sm:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="sm:col-span-3">
          <Label htmlFor="g-name">Name</Label>
          <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="g-target">Target ({baseCurrency})</Label>
          <Input
            id="g-target"
            className="font-mono"
            value={targetMajor}
            onChange={(e) => setTargetMajor(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="g-date">Target date</Label>
          <Input
            id="g-date"
            type="date"
            className="font-mono"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={create.isPending}>
            Create
          </Button>
        </div>
      </form>

      <ul className="mt-8 space-y-4">
        {(goals.data?.goals ?? []).map((goal) => {
          const ratio = goal.targetAmountMinor
            ? goal.currentAmountMinor / goal.targetAmountMinor
            : 0;
          return (
            <li key={goal.id} className="surface grain rounded-[var(--r-lg)] p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{goal.name}</p>
                {goal.targetDate ? (
                  <p className="font-mono text-xs text-[var(--muted-foreground)]">{goal.targetDate}</p>
                ) : null}
              </div>
              <div className="mt-3">
                <ProgressBar value={ratio} tone={ratio >= 1 ? "positive" : "accent"} />
              </div>
              <div className="mt-2 flex justify-between text-xs">
                <MoneyText amountMinor={goal.currentAmountMinor} currency={goal.currency} />
                <MoneyText amountMinor={goal.targetAmountMinor} currency={goal.currency} />
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const amountMajor = contribute[goal.id];
                  if (!amountMajor) return;
                  add.mutate({ id: goal.id, amountMajor });
                  setContribute((prev) => ({ ...prev, [goal.id]: "" }));
                }}
              >
                <Input
                  className="font-mono"
                  placeholder="0.00"
                  value={contribute[goal.id] ?? ""}
                  onChange={(e) =>
                    setContribute((prev) => ({ ...prev, [goal.id]: e.target.value }))
                  }
                />
                <Button type="submit" variant="ghost">
                  Add
                </Button>
              </form>
            </li>
          );
        })}
      </ul>
      <SinkingFunds workspaceId={workspaceId} baseCurrency={baseCurrency} />
    </PageContainer>
  );
}
