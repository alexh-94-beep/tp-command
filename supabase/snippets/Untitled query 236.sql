select id, scheduled_date, status, booking_id, type
from cleaning_tasks
order by created_at desc
limit 10;
