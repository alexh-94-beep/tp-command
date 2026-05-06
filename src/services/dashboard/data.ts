import { createSupabaseServerClient } from '@/lib/supabase/server';
import { addDaysIso, todayIso } from '@/lib/dates';

export interface CheckInOutRow {
  booking_id: string;
  apartment_id: string;
  apartment_number: string;
  date: string;
  guest_name: string;
  rental_type: string;
  contract_status: string;
  channel: string | null;
}

export interface CleaningRow {
  task_id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  type: string;
  status: string;
  apartment_label: string;
  staff_name: string | null;
}

export interface ActionItem {
  kind:
    | 'pending_reservation'
    | 'unassigned_cleaning'
    | 'damage_report'
    | 'missing_contract'
    | 'missing_name_tag'
    | 'overdue_payment';
  title: string;
  detail: string;
  href: string;
  priority: 'high' | 'medium' | 'low';
}

export interface OpenBookingTask {
  task_id: string;
  booking_id: string;
  title: string;
  category: string | null;
  kind: 'move_in' | 'move_out';
  status: 'open' | 'in_progress';
  due_date: string | null;
  apartment_number: string | null;
  guest_name: string | null;
  is_overdue: boolean;
  days_until_due: number | null;
}

export interface DashboardSections {
  checkInsToday: CheckInOutRow[];
  checkInsTomorrow: CheckInOutRow[];
  checkOutsToday: CheckInOutRow[];
  cleaningsToday: CleaningRow[];
  upcomingWeek: CheckInOutRow[];
  actions: ActionItem[];
  openTasks: OpenBookingTask[];
}

export async function getDashboardSections(): Promise<DashboardSections> {
  const supabase = createSupabaseServerClient();
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);
  const weekEnd = addDaysIso(today, 7);

  // ----- Check-ins / Check-outs in der nächsten Woche -----
  const { data: bookings } = await supabase
    .from('bookings')
    .select(
      `
      id, apartment_id, start_date, end_date, rental_type, contract_status, status,
      apartment:apartments(number),
      tenant:tenants!bookings_tenant_id_fkey(first_name, last_name),
      channel:channels(display_name)
    `,
    )
    .in('status', ['planned', 'active'])
    .or(
      `and(start_date.gte.${today},start_date.lte.${weekEnd}),and(end_date.gte.${today},end_date.lte.${weekEnd})`,
    );

  const allBookings = (bookings ?? []) as Array<{
    id: string;
    apartment_id: string;
    start_date: string;
    end_date: string;
    rental_type: string;
    contract_status: string;
    status: string;
    apartment: { number: string } | null;
    tenant: { first_name: string; last_name: string } | null;
    channel: { display_name: string } | null;
  }>;

  function toRow(b: (typeof allBookings)[number], date: string): CheckInOutRow {
    return {
      booking_id: b.id,
      apartment_id: b.apartment_id,
      apartment_number: b.apartment?.number ?? '–',
      date,
      guest_name: b.tenant ? `${b.tenant.first_name} ${b.tenant.last_name}` : '–',
      rental_type: b.rental_type,
      contract_status: b.contract_status,
      channel: b.channel?.display_name ?? null,
    };
  }

  const checkInsToday = allBookings
    .filter((b) => b.start_date === today)
    .map((b) => toRow(b, b.start_date));
  const checkInsTomorrow = allBookings
    .filter((b) => b.start_date === tomorrow)
    .map((b) => toRow(b, b.start_date));
  const checkOutsToday = allBookings
    .filter((b) => b.end_date === today)
    .map((b) => toRow(b, b.end_date));

  // Upcoming-Woche (alle Ein-/Auszüge in 7 Tagen, nach Datum)
  const upcomingWeek: CheckInOutRow[] = [];
  for (const b of allBookings) {
    if (b.start_date >= today && b.start_date <= weekEnd) {
      upcomingWeek.push({ ...toRow(b, b.start_date) });
    }
    if (b.end_date >= today && b.end_date <= weekEnd && b.end_date !== b.start_date) {
      upcomingWeek.push({ ...toRow(b, b.end_date) });
    }
  }
  upcomingWeek.sort((a, b) => a.date.localeCompare(b.date));

  // ----- Reinigungen heute -----
  const { data: cleanings } = await supabase
    .from('cleaning_tasks')
    .select(
      `
      id, scheduled_date, scheduled_time, type, status,
      apartment:apartments(number),
      external_apartment:external_apartments(label),
      staff:cleaning_staff(full_name)
    `,
    )
    .eq('scheduled_date', today)
    .order('scheduled_time', { ascending: true, nullsFirst: false });

  const cleaningsToday: CleaningRow[] = (cleanings ?? []).map((t) => ({
    task_id: t.id,
    scheduled_date: t.scheduled_date,
    scheduled_time: t.scheduled_time ?? null,
    type: t.type,
    status: t.status,
    apartment_label:
      (t.apartment as { number: string } | null)?.number ??
      (t.external_apartment as { label: string } | null)?.label ??
      '–',
    staff_name: (t.staff as { full_name: string } | null)?.full_name ?? null,
  }));

  // ----- Handlungsbedarf -----
  const actions: ActionItem[] = [];

  // Pending Pool-Reservationen
  const { count: pendingCount } = await supabase
    .from('pending_reservations')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (pendingCount && pendingCount > 0) {
    actions.push({
      kind: 'pending_reservation',
      title: `${pendingCount} Booking-Reservation${pendingCount === 1 ? '' : 'en'} ohne Wohnungs-Zuweisung`,
      detail: 'Im Pool wartet eine Reservation auf manuelle Zuweisung.',
      href: '/bookings/pending',
      priority: 'high',
    });
  }

  // Reinigungen heute ohne Zuweisung
  const unassignedCleaningsToday = cleaningsToday.filter(
    (c) => !c.staff_name && (c.status === 'open' || c.status === 'in_progress'),
  ).length;
  if (unassignedCleaningsToday > 0) {
    actions.push({
      kind: 'unassigned_cleaning',
      title: `${unassignedCleaningsToday} Reinigung${unassignedCleaningsToday === 1 ? '' : 'en'} heute ohne Zuweisung`,
      detail: 'Tagesplan öffnen und Reinigerinnen zuweisen.',
      href: '/cleaning/daily',
      priority: 'high',
    });
  }

  // Schäden gemeldet (Inspektionen mit damage_found = true, noch nicht abgeschlossen)
  const { data: damages } = await supabase
    .from('cleaning_tasks')
    .select('id, scheduled_date, apartment:apartments(number)')
    .eq('damage_found', true)
    .neq('status', 'quality_checked')
    .order('scheduled_date', { ascending: false })
    .limit(5);
  if (damages && damages.length > 0) {
    actions.push({
      kind: 'damage_report',
      title: `${damages.length} Schaden-Meldung${damages.length === 1 ? '' : 'en'} offen`,
      detail: damages
        .map((d) => `${(d.apartment as { number?: string } | null)?.number ?? '–'} (${d.scheduled_date})`)
        .join(', '),
      href: '/cleaning?type=inspection&status=done',
      priority: 'medium',
    });
  }

  // Buchungen mit fehlendem Vertrag bei Einzug in <= 7 Tagen
  const missingContractBookings = allBookings.filter(
    (b) =>
      b.start_date >= today &&
      b.start_date <= weekEnd &&
      b.contract_status !== 'signed' &&
      b.contract_status !== 'cancelled',
  );
  for (const b of missingContractBookings.slice(0, 5)) {
    actions.push({
      kind: 'missing_contract',
      title: `Vertrag fehlt: ${b.apartment?.number} – Einzug ${b.start_date}`,
      detail: `Status: ${b.contract_status}. ${b.tenant?.first_name ?? ''} ${b.tenant?.last_name ?? ''}`.trim(),
      href: `/bookings/${b.id}`,
      priority: 'high',
    });
  }

  // Türschilder fehlen (Wohnungen mit anstehendem Einzug + name_tag_status != installed)
  if (missingContractBookings.length > 0) {
    const aptIds = Array.from(new Set(missingContractBookings.map((b) => b.apartment_id)));
    const { data: apts } = await supabase
      .from('apartments')
      .select('id, number, name_tag_status')
      .in('id', aptIds)
      .neq('name_tag_status', 'installed');
    for (const a of apts ?? []) {
      actions.push({
        kind: 'missing_name_tag',
        title: `Türschild offen: ${a.number}`,
        detail: `Status ${a.name_tag_status}`,
        href: `/apartments/${a.id}`,
        priority: 'medium',
      });
    }
  }

  // Sortierung nach Priorität
  const order = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => order[a.priority] - order[b.priority]);

  // ----- Offene Workflow-Aufgaben (Top 15, sortiert nach Fälligkeit) -----
  const dueHorizon = addDaysIso(today, 14);
  const { data: openTaskRows } = await supabase
    .from('booking_tasks')
    .select(
      `
      id, booking_id, title, category, kind, status, due_date,
      booking:bookings(
        apartment:apartments(number),
        tenant:tenants!bookings_tenant_id_fkey(first_name, last_name)
      )
    `,
    )
    .in('status', ['open', 'in_progress'])
    .or(`due_date.is.null,due_date.lte.${dueHorizon}`)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(15);

  const openTasks: OpenBookingTask[] = (openTaskRows ?? []).map((r) => {
    const booking = r.booking as unknown as
      | {
          apartment: { number: string } | null;
          tenant: { first_name: string; last_name: string } | null;
        }
      | null;
    const apt = booking?.apartment ?? null;
    const ten = booking?.tenant ?? null;
    const due = r.due_date as string | null;
    const isOverdue = !!due && due < today;
    const daysUntil = due
      ? Math.round((new Date(due).getTime() - new Date(today).getTime()) / 86_400_000)
      : null;
    return {
      task_id: r.id as string,
      booking_id: r.booking_id as string,
      title: r.title as string,
      category: r.category as string | null,
      kind: r.kind as 'move_in' | 'move_out',
      status: r.status as 'open' | 'in_progress',
      due_date: due,
      apartment_number: apt?.number ?? null,
      guest_name: ten ? `${ten.first_name} ${ten.last_name}` : null,
      is_overdue: isOverdue,
      days_until_due: daysUntil,
    };
  });

  return {
    checkInsToday,
    checkInsTomorrow,
    checkOutsToday,
    cleaningsToday,
    upcomingWeek,
    actions,
    openTasks,
  };
}
