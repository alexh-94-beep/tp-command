select id, apartment_id, scheduled_date, type, notes
from cleaning_tasks
where type = 'weekly_clean';