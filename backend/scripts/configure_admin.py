r"""Run from backend: .venv\Scripts\python.exe scripts/configure_admin.py

Prompts locally with visible input; saves only a password hash.
"""
from pathlib import Path
import os
import re
import tempfile
from pwdlib import PasswordHash


def main():
    username = input('Admin ID [onfit-admin]: ').strip() or 'onfit-admin'
    if not re.fullmatch(r'[a-zA-Z0-9_.-]{3,80}', username):
        raise SystemExit('Use 3-80 letters, digits, dot, dash or underscore.')
    print('Password input is visible in this terminal. Only its hash will be saved.')
    password = input('Admin password (8-32 characters, visible): ')
    if not 8 <= len(password) <= 32:
        raise SystemExit('Password must contain 8-32 characters.')
    if password != input('Confirm password (visible): '):
        raise SystemExit('Passwords do not match. Nothing changed.')
    env = Path(__file__).resolve().parents[1] / '.env'
    text = env.read_text(encoding='utf-8-sig') if env.exists() else ''
    values = {'ADMIN_USERNAME': username, 'ADMIN_PASSWORD_HASH': PasswordHash.recommended().hash(password)}
    for key, value in values.items():
        line = f'{key}={value}'
        pattern = rf'(?m)^{key}=.*$'
        if re.search(pattern, text):
            text = re.sub(pattern, lambda _: line, text)
        else:
            text = text.rstrip() + '\n' + line + '\n'
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=env.parent, delete=False) as out:
        out.write(text)
        temporary = out.name
    os.replace(temporary, env)
    print('Admin ID and password hash saved to backend/.env. Restart the backend.')
    print('For Render/EC2, copy only ADMIN_USERNAME and ADMIN_PASSWORD_HASH to server environment settings.')
    print('Do not share or commit .env. No database user was created.')


if __name__ == '__main__':
    main()
