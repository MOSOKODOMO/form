"""Build dist/downloads/fabint-price-finder.zip from the extension/ folder (same bytes every time).

    python3 tools/build-extension.py
"""
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'extension'
OUT = ROOT / 'dist' / 'downloads' / 'fabint-price-finder.zip'

OUT.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as zf:
    for path in sorted(SRC.iterdir()):
        if path.is_file():
            info = zipfile.ZipInfo(path.name, date_time=(2026, 10, 12, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, path.read_bytes())
print('wrote', OUT.relative_to(ROOT), OUT.stat().st_size, 'bytes')
