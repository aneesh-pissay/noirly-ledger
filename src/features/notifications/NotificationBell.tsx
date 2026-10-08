"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";

export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: qk.notifications,
    queryFn: () => api.listNotifications(),
    refetchInterval: 30_000,
  });

  const read = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
    },
  });

  const items = query.data?.notifications ?? [];
  const unread = items.filter((item) => !item.readAt).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg border border-[var(--hairline)] px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        aria-label="Notifications"
      >
        Alerts
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 font-mono text-[10px] text-[var(--accent-ink)]">
            {unread}
          </span>
        ) : null}
      </button>
      {open ? (
        // Positioning lives on its own element: `.surface` sets position: relative,
        // which overrode `absolute` and left the panel inside the 56px header.
        <div className="absolute right-0 top-full z-50 mt-2 w-80">
        <div className="overflow-hidden surface grain rounded-[var(--r-lg)] shadow-xl">
          <p className="border-b border-[var(--hairline)] px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            Notifications
          </p>
          <ul className="max-h-80 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id} className="border-b border-[var(--hairline)] last:border-0">
                {item.href ? (
                  <Link
                    href={item.href}
                    onClick={() => {
                      if (!item.readAt) read.mutate(item.id);
                      setOpen(false);
                    }}
                    className="block px-3 py-2 hover:bg-[var(--surface-2)]"
                  >
                    <p className="text-sm text-[var(--foreground)]">{item.title}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{item.body}</p>
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left hover:bg-[var(--surface-2)]"
                    onClick={() => {
                      if (!item.readAt) read.mutate(item.id);
                    }}
                  >
                    <p className="text-sm text-[var(--foreground)]">{item.title}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{item.body}</p>
                  </button>
                )}
              </li>
            ))}
          </ul>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-sm text-[var(--muted-foreground)]">No notifications</p>
          ) : null}
        </div>
        </div>
      ) : null}
    </div>
  );
}
