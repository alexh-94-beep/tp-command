insert into public.users (id, email, full_name, role)
select id, email, 'Boldana', 'cleaning'
from auth.users where email = 'alexh-94+boldana@hotmail.com'
on conflict do nothing;