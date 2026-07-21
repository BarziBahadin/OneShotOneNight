"use client";

import { useEffect, useMemo, useState } from "react";
import { getLocalTimeZone, parseDateTime, today, toCalendarDateTime } from "@internationalized/date";
import { Calendar as CalendarIcon } from "lucide-react";
import { useDateFormatter } from "react-aria";
import type { DateValue } from "react-aria-components";
import {
  DatePicker,
  Dialog,
  Group,
  Popover
} from "react-aria-components";
import { Calendar } from "@/components/application/date-picker/calendar";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { cx } from "@/utils/cx";

const TIME_SLOTS = Array.from({ length: 27 }, (_, index) => {
  const totalMinutes = 9 * 60 + index * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return {
    id: `${hour}:${String(minute).padStart(2, "0")}`,
    hour,
    minute,
    label: `${hour12}:${String(minute).padStart(2, "0")} ${period}`
  };
});

type DateTimePickerProps = {
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
};

export function DateTimePicker({ label, name, defaultValue, required = false }: DateTimePickerProps) {
  const initialValue = useMemo(() => parseLocalDateTime(defaultValue), [defaultValue]);
  const [committedValue, setCommittedValue] = useState<DateValue | null>(initialValue);
  const [draftValue, setDraftValue] = useState<DateValue | null>(initialValue);
  const [focusedValue, setFocusedValue] = useState<DateValue | null>(initialValue);
  const dateFormatter = useDateFormatter({ month: "short", day: "numeric", year: "numeric" });
  const timeFormatter = useDateFormatter({ hour: "numeric", minute: "2-digit" });

  useEffect(() => {
    setCommittedValue(initialValue);
    setDraftValue(initialValue);
    setFocusedValue(initialValue);
  }, [initialValue]);

  function selectTime(slotID: string) {
    const slot = TIME_SLOTS.find((candidate) => candidate.id === slotID);
    if (!slot) return;
    const current = draftValue ?? toCalendarDateTime(today(getLocalTimeZone()));
    setDraftValue(toCalendarDateTime(current).set({ hour: slot.hour, minute: slot.minute }));
  }

  const selectedTime = draftValue && "hour" in draftValue
    ? `${draftValue.hour}:${String(draftValue.minute).padStart(2, "0")}`
    : "";

  return (
    <div className="grid min-w-0 gap-2 text-sm font-semibold">
      <span>{label}</span>
      <input type="hidden" name={name} value={serializeLocalDateTime(committedValue)} />
      <DatePicker
        aria-label={label}
        value={draftValue}
        onChange={setDraftValue}
        isRequired={required}
        shouldCloseOnSelect={false}
        onOpenChange={(isOpen) => {
          if (isOpen) {
            setDraftValue(committedValue);
            setFocusedValue(committedValue);
          }
        }}
      >
        <Group className="flex min-w-0">
          <Button color="secondary" size="md" iconLeading={CalendarIcon} className="w-full min-w-0 justify-start text-left">
            {committedValue ? (
              <span className="min-w-0 truncate">
                {dateFormatter.format(committedValue.toDate(getLocalTimeZone()))}{" "}
                <span className="text-moss">{timeFormatter.format(committedValue.toDate(getLocalTimeZone()))}</span>
              </span>
            ) : (
              <span className="text-moss">Select date</span>
            )}
          </Button>
        </Group>

        <Popover
          offset={8}
          placement="bottom start"
          className={({ isEntering, isExiting }) => cx(
            "z-50 origin-[var(--trigger-anchor-point)] will-change-transform",
            isEntering && "animate-in fade-in zoom-in-95 duration-150",
            isExiting && "animate-out fade-out zoom-out-95 duration-100"
          )}
        >
          <Dialog className="w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#151515] text-white shadow-[0_24px_80px_rgba(0,0,0,0.65)] outline-none">
            {({ close }) => (
              <>
                <div className="flex h-[min(22rem,calc(100vh-7rem))] min-h-0 overflow-hidden">
                  <div className="min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                    <Calendar focusedValue={focusedValue} onFocusChange={setFocusedValue} />
                    <NativeSelect
                      aria-label="Time"
                      value={selectedTime}
                      onChange={(event) => selectTime(event.target.value)}
                      className="mt-3 md:hidden"
                      options={TIME_SLOTS.map((slot) => ({ value: slot.id, label: slot.label }))}
                    />
                  </div>

                  <aside className="hidden h-full min-h-0 w-44 shrink-0 flex-col border-l border-white/10 md:flex">
                    <p className="shrink-0 px-4 pb-3 pt-4 text-center text-sm font-semibold text-moss">Available times</p>
                    <ul className="grid min-h-0 flex-1 gap-1 overflow-y-auto px-3 pb-4">
                      {TIME_SLOTS.map((slot) => {
                        const isSelected = selectedTime === slot.id;
                        return (
                          <li key={slot.id}>
                            <Button
                              color={isSelected ? "primary" : "secondary"}
                              size="sm"
                              onClick={() => selectTime(slot.id)}
                              className="w-full"
                            >
                              {slot.label}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </aside>
                </div>

                <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-white/10 bg-[#151515] p-3">
                  <div className="mr-auto" />
                  <Button
                    color="secondary"
                    className="flex-1 md:flex-none"
                    onClick={() => {
                      setDraftValue(committedValue);
                      close();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="primary"
                    className="flex-1 md:flex-none"
                    onClick={() => {
                      setCommittedValue(draftValue);
                      close();
                    }}
                  >
                    Apply
                  </Button>
                </footer>
              </>
            )}
          </Dialog>
        </Popover>
      </DatePicker>
    </div>
  );
}

function parseLocalDateTime(value: string): DateValue | null {
  if (!value) return null;
  try {
    return parseDateTime(value.slice(0, 16));
  } catch {
    return null;
  }
}

function serializeLocalDateTime(value: DateValue | null) {
  if (!value) return "";
  const hour = "hour" in value ? value.hour : 0;
  const minute = "minute" in value ? value.minute : 0;
  return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
