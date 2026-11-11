"""Inspect a data-only official MPFB pack, then use MPFB's pack installer."""
import argparse
import hashlib
import importlib
import json
from pathlib import Path, PurePosixPath
import sys
import zipfile

import addon_utils
import bpy

args = argparse.ArgumentParser()
args.add_argument('archive', type=Path)
args.add_argument('--install', action='store_true')
args.add_argument('--asset-name', default='elvs_hooded_sweat_jacket1')
options = args.parse_args(sys.argv[sys.argv.index('--') + 1:])
with zipfile.ZipFile(options.archive) as archive:
    for entry in archive.infolist():
        path = PurePosixPath(entry.filename)
        if path.is_absolute() or '..' in path.parts or '\\' in entry.filename or ':' in entry.filename:
            raise RuntimeError('Unsafe archive path: ' + entry.filename)
        if path.suffix.lower() in {'.py', '.exe', '.dll', '.bat', '.cmd', '.ps1', '.sh', '.blend'}:
            raise RuntimeError('Pack is not data-only: ' + entry.filename)
    assert archive.testzip() is None, 'Corrupt ZIP'
    names = archive.namelist()
    selected = [name for name in names if options.asset_name in name]
    assert any(name.endswith('.mhclo') for name in selected)
    print('HOOD_ASSET_FILES', json.dumps(selected))
    for name in selected:
        if name.endswith(('.mhclo', '.mhmat', '.txt')):
            print('HOOD_METADATA', name, archive.read(name).decode('utf8', errors='replace')[:1800])
    print('PACK_ENTRIES', len(names), 'BYTES', options.archive.stat().st_size,
          'SHA256', hashlib.sha256(options.archive.read_bytes()).hexdigest())
if options.install:
    module = 'bl_ext.blender_org.mpfb'
    addon_utils.enable(module, default_set=True, persistent=False)
    services = importlib.import_module(module + '.services')
    service = services.AssetService
    error = service.check_asset_pack_zip(str(options.archive.resolve()))
    assert error is None, error
    destination = Path(services.LocationService.get_user_data())
    # Do not replace any existing user asset file.
    with zipfile.ZipFile(options.archive) as archive:
        conflicts = [name for name in archive.namelist()
                     if not name.endswith('/') and (destination / name).exists()]
    assert not conflicts, 'Existing asset files would be replaced: ' + str(conflicts)
    error = service.fix_and_extract_asset_pack_zip(str(options.archive.resolve()), str(destination))
    assert error is None, error
    service.rescan_pack_metadata()
    installed = list(destination.glob('clothes/'+options.asset_name+'/*.mhclo'))
    assert installed, 'Hood asset not present after installation'
    print('HOOD_PACK_INSTALLED', json.dumps([str(path) for path in installed]))
