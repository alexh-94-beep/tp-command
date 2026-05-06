-- ============================================================
-- Trigger: leitet bookings.payment_status aus payments ab.
-- ============================================================
create or replace function recompute_booking_payment_status(p_booking_id uuid)
returns void language plpgsql as $$
declare
  v_total       numeric(12,2);
  v_paid        numeric(12,2);
  v_overdue     int;
  v_new_status  booking_payment_status;
begin
  select coalesce(sum(amount),0) into v_total
    from payments where booking_id = p_booking_id and status <> 'cancelled';

  select coalesce(sum(amount),0) into v_paid
    from payments where booking_id = p_booking_id and status = 'paid';

  select count(*) into v_overdue
    from payments where booking_id = p_booking_id and status = 'overdue';

  if v_overdue > 0 then
    v_new_status := 'overdue';
  elsif v_paid = 0 then
    v_new_status := 'pending';
  elsif v_paid >= v_total then
    v_new_status := 'paid';
  else
    v_new_status := 'partial';
  end if;

  update bookings set payment_status = v_new_status where id = p_booking_id;
end;
$$;

create or replace function trg_payments_recompute()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'DELETE') then
    perform recompute_booking_payment_status(old.booking_id);
    return old;
  else
    perform recompute_booking_payment_status(new.booking_id);
    return new;
  end if;
end;
$$;

create trigger payments_recompute_status
after insert or update or delete on payments
for each row execute function trg_payments_recompute();

-- ============================================================
-- Trigger: setzt offene Zahlungen mit due_date < today auf 'overdue'.
-- Wird per Cron täglich aufgerufen, hier als Hilfsfunktion.
-- ============================================================
create or replace function mark_overdue_payments()
returns int language plpgsql as $$
declare
  v_booking_id uuid;
  v_count      int := 0;
  v_affected   uuid[];
begin
  -- 1) Status setzen und alle betroffenen Buchungs-IDs einsammeln.
  with updated as (
    update payments
       set status = 'overdue'
     where status = 'pending'
       and due_date < current_date
    returning booking_id
  )
  select array_agg(distinct booking_id) into v_affected from updated;

  -- 2) Pro betroffener Buchung den aggregierten Zahlungsstatus neu rechnen.
  if v_affected is not null then
    foreach v_booking_id in array v_affected loop
      perform recompute_booking_payment_status(v_booking_id);
      v_count := v_count + 1;
    end loop;
  end if;

  return v_count;
end;
$$;
