import { useCallback, useMemo, useRef } from "react";
import {
  useCalendarApp,
  ScheduleXCalendar,
} from "@schedule-x/react";
import {
  createViewDay,
  createViewWeek,
  createViewMonthGrid,
  createViewMonthAgenda,
  createViewList,
} from "@schedule-x/calendar";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import "temporal-polyfill/global";
import "@schedule-x/theme-default/dist/index.css";
import { api } from "../../api/client";

const TemporalGlobal = typeof window !== "undefined" ? (window as unknown as { Temporal: typeof Temporal }).Temporal : (globalThis as unknown as { Temporal: typeof Temporal }).Temporal;

function toTemporal(dt: string): Temporal.ZonedDateTime {
  let s = dt;
  if (dt.endsWith("Z")) {
    s = dt.slice(0, -1) + "+00:00[UTC]";
  } else if (!/[+-]\d{2}:\d{2}\]$/.test(dt)) {
    s = dt + "+00:00[UTC]";
  }
  return TemporalGlobal.ZonedDateTime.from(s);
}

interface CalendarViewProps {
  token: string;
  onEventClick: (noteId: number) => void;
}

type CalendarAppWithEventsService = { eventsService?: { set: (events: unknown[]) => void } };

export function CalendarView({ token, onEventClick }: CalendarViewProps) {
  const calendarRef = useRef<CalendarAppWithEventsService | null>(null);

  const fetchAndSetEvents = useCallback(
    async (range: { start: Temporal.ZonedDateTime; end: Temporal.ZonedDateTime }) => {
      const from = range.start.toInstant().toString();
      const to = range.end.toInstant().toString();
      const list = await api.events.list(token, from, to);
      const events = list.map((e) => ({
        id: String(e.id),
        title: e.title,
        start: toTemporal(e.starts_at),
        end: toTemporal(e.ends_at),
        noteId: e.note_id,
      }));
      calendarRef.current?.eventsService?.set(events);
    },
    [token]
  );

  const calendar = useCalendarApp(
    {
      views: [
        createViewList(),
        createViewDay(),
        createViewWeek(),
        createViewMonthGrid(),
        createViewMonthAgenda(),
      ],
      defaultView: "list",
      timezone: "UTC",
      callbacks: {
        onRangeUpdate: (range) => {
          void fetchAndSetEvents(range);
        },
        onRender: ($app) => {
          const range = $app.calendarState?.range?.value;
          if (range) {
            void fetchAndSetEvents(range);
          }
        },
        onEventClick: (event, _e) => {
          const noteId = (event as { noteId?: number }).noteId;
          if (noteId != null) {
            onEventClick(noteId);
          }
        },
      },
      isDark: true,
    },
    useMemo(() => [createEventsServicePlugin()], [])
  );

  calendarRef.current = calendar as CalendarAppWithEventsService | null;

  return (
    <div className="sx-react-calendar-wrapper" style={{ width: "100%", minHeight: 500, height: "70vh" }}>
      <ScheduleXCalendar calendarApp={calendar} />
    </div>
  );
}
