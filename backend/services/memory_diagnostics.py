"""Small, read-only memory and image-size diagnostics for Render."""

import logging
import os
from pathlib import Path


logger = logging.getLogger('uvicorn.error')


def _read_bytes(path):
    try:
        return int(Path(path).read_text().strip())
    except (OSError, ValueError):
        return None


def _rss_bytes(pid):
    try:
        fields = Path(f'/proc/{pid}/statm').read_text().split()
        return int(fields[1]) * os.sysconf('SC_PAGE_SIZE')
    except (OSError, ValueError, IndexError):
        return None


def _descendants(pid):
    seen, pending = set(), [pid]
    while pending:
        parent = pending.pop()
        try:
            children = Path(f'/proc/{parent}/task/{parent}/children').read_text().split()
        except OSError:
            continue
        for child in children:
            child_pid = int(child)
            if child_pid not in seen:
                seen.add(child_pid)
                pending.append(child_pid)
    return seen


def _mb(value):
    return round(value / (1024 * 1024), 1) if value is not None else None


def log_memory(stage, keyword_index=None):
    """RSS includes shared pages; cgroup usage is the container-wide measure."""
    pid = os.getpid()
    children = _descendants(pid) if Path('/proc').is_dir() else set()
    child_rss = 0
    chromium_rss = 0
    chromium_count = 0
    for child in children:
        rss = _rss_bytes(child) or 0
        child_rss += rss
        try:
            name = Path(f'/proc/{child}/comm').read_text().strip().lower()
        except OSError:
            name = ''
        if 'chrome' in name or 'chromium' in name:
            chromium_rss += rss
            chromium_count += 1
    container = _read_bytes('/sys/fs/cgroup/memory.current')
    if container is None:
        container = _read_bytes('/sys/fs/cgroup/memory/memory.usage_in_bytes')
    peak = _read_bytes('/sys/fs/cgroup/memory.peak')
    if peak is None:
        peak = _read_bytes('/sys/fs/cgroup/memory/memory.max_usage_in_bytes')
    logger.info('Memory stage=%s keyword_index=%s python_rss_mb=%s child_rss_mb=%s '
                'child_processes=%s chromium_rss_mb=%s chromium_processes=%s '
                'cgroup_mb=%s cgroup_peak_mb=%s',
                stage, keyword_index, _mb(_rss_bytes(pid)), _mb(child_rss), len(children),
                _mb(chromium_rss), chromium_count, _mb(container), _mb(peak))


def log_image(stage, source_bytes, source_size, output_bytes=None, output_size=None):
    width, height = source_size
    out_width, out_height = output_size or (None, None)
    logger.info('Image stage=%s input_bytes=%s input_width_px=%s input_height_px=%s '
                'output_bytes=%s output_width_px=%s output_height_px=%s',
                stage, source_bytes, width, height, output_bytes, out_width, out_height)
