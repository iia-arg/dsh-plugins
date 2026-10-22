#!/usr/bin/env python3
"""Historical schema2–4 fixture entry only; never installed or used by the service."""
import importlib.util
from pathlib import Path
import sys
sys.dont_write_bytecode=True
if __name__=='__main__':
    import os,json
    if os.geteuid()!=0 or not Path('/run/r-normalizer-private').is_file() or not os.statvfs('/').f_flag & os.ST_RDONLY:
        print(json.dumps(dict(error='LEGACY_FIXTURE_ONLY')));sys.exit(2)
base=Path(__file__).resolve().parent.parent
source=base/'runtime/runtime_receipt_source.py'
if not source.is_file():source=Path(__file__).resolve().with_name('runtime_receipt_source.py')
spec=importlib.util.spec_from_file_location('runtime_receipt_source',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
if __name__=='__main__':sys.exit(module.collect_main())
