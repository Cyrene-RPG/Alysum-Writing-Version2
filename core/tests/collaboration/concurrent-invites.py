"""Disposable PostgreSQL test: a single-use link must have exactly one recipient."""
import concurrent.futures
import os
import subprocess

url = os.environ['TEST_DATABASE_URL']
def query(sql):
    return subprocess.run(['psql', url, '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], capture_output=True, text=True)

assert query('SELECT current_database()').stdout.strip() == 'collaboration_test'
owner = '10000000-0000-0000-0000-000000000001'
result = query(f"INSERT INTO public.books(id,user_id) VALUES('concurrent','{owner}'); SET ROLE authenticated; SET request.jwt.claim.sub='{owner}'; SELECT public.create_book_editor_invite('concurrent','')->>'token';")
assert result.returncode == 0, result.stderr
token = result.stdout.strip().splitlines()[-1]
assert len(token) == 64
def accept(number):
    return query(f"SET ROLE authenticated; SET request.jwt.claim.sub='10000000-0000-0000-0000-{number:012}'; SELECT public.accept_book_editor_invite('{token}');")
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(accept, [3, 5]))
assert sum(r.returncode == 0 for r in results) == 1, [(r.stdout,r.stderr) for r in results]
assert query("SELECT count(*) FROM public.book_editors WHERE book_id='concurrent'").stdout.strip() == '1'
print('Concurrent acceptance: one recipient only')
