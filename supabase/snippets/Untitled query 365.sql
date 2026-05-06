insert into public.users (id, email, full_name, role)
select id, email, 'Alex Huber', 'admin'
from auth.users
where email = 'a.huber@threepoint.ch'
on conflict (id) do nothing;